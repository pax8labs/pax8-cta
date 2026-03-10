/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";
import {
  loadConfig,
  TenantConfig,
  isDemoMode,
  DEMO_TENANTS,
  Deployment,
  DeploymentBatch,
  DeploymentStatus,
  getDeploymentNotifications,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { demoDeployments, demoDeploymentsV2, demoBatches } from "@/lib/demo-store";
import { startDemoDeployment } from "@/lib/demo-worker";
import { serverTrackDeployment, serverTrackError } from "@/lib/posthog-server";
import * as deploymentRepo from "@/lib/repositories/deployment-repository";
import * as approvalRepo from "@/lib/repositories/approval-repository";
import { logDeploymentAction, logApprovalAction } from "@/lib/repositories/audit-repository";
import { requireRoles, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { deploymentRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { invalidRequest, notFound, internalError, validationError } from "@/lib/errors";
import {
  isRedisConnectionError,
  createQueueUnavailableResponse,
  safelyCloseQueueManager,
} from "@/lib/queue-error-handler";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SOLUTIONS_DIR = process.env.SOLUTIONS_DIR || "./solutions";

export async function POST(request: NextRequest) {
  // Require Admin or Deployer role
  const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER]);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/deployments/create", "forbidden", {
      action: "create_deployment",
    });
    return session;
  }

  // Apply rate limiting
  const rateLimitResult = await deploymentRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    const formData = await request.formData();
    const solutionFile = formData.get("solution") as File | null;
    const tenantIdsJson = formData.get("tenantIds") as string | null;
    const urlOverridesJson = formData.get("urlOverrides") as string | null;
    const dryRun = formData.get("dryRun") === "true";

    // Parse URL overrides if provided (for agents with URL templates)
    let urlOverrides:
      | Record<
          string,
          { tenant: string; sharepoint: string; dynamicsCrm: string; onmicrosoft: string }
        >
      | undefined;
    if (urlOverridesJson) {
      try {
        urlOverrides = JSON.parse(urlOverridesJson);
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Validate solution file
    if (!solutionFile) {
      return invalidRequest("Solution file is required");
    }

    // File validation constants
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (Power Platform solutions can be large)
    const ALLOWED_TYPES = [
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream", // Some browsers send this for .zip
    ];
    const ALLOWED_EXTENSIONS = [".zip"];

    // Validate file size
    if (solutionFile.size > MAX_FILE_SIZE) {
      return validationError(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`, {
        maxSize: MAX_FILE_SIZE,
        actualSize: solutionFile.size,
      });
    }

    // Validate file extension
    const fileName = solutionFile.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    if (!hasValidExtension) {
      return validationError("Invalid file extension. Only .zip files are allowed.", {
        allowedExtensions: ALLOWED_EXTENSIONS,
      });
    }

    // Validate MIME type (note: this can be spoofed, extension check is more reliable)
    if (solutionFile.type && !ALLOWED_TYPES.includes(solutionFile.type)) {
      return validationError("Invalid file type. Only ZIP files are allowed.", {
        allowedTypes: ALLOWED_TYPES,
        receivedType: solutionFile.type,
      });
    }

    if (!tenantIdsJson) {
      return invalidRequest("Tenant IDs are required");
    }

    let tenantIds: string[];
    try {
      tenantIds = JSON.parse(tenantIdsJson);
      if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
        throw new Error("Invalid tenant IDs");
      }
    } catch {
      return invalidRequest("Invalid tenant IDs format");
    }

    // Dry-run mode: validate everything but don't execute
    if (dryRun) {
      // Extract solution name for preview
      const solutionName = solutionFile.name
        .replace(/_(managed|unmanaged)\.zip$/i, "")
        .replace(/\.zip$/i, "")
        .replace(/_\d+(_\d+)*$/i, "");

      // Load config to validate tenants and check approval requirements
      let config;
      try {
        config = await loadConfig(resolve(CONFIG_PATH));
      } catch (configError) {
        return validationError("Failed to load tenant configuration", {
          error: configError instanceof Error ? configError.message : "Unknown error",
        });
      }

      // Filter to requested tenants (same logic as real deployment)
      const targetTenants = isDemoMode()
        ? DEMO_TENANTS.filter((t) => t.enabled && tenantIds.includes(t.tenantId))
        : config.tenants.filter((t) => t.enabled && tenantIds.includes(t.tenantId));

      if (targetTenants.length === 0) {
        return validationError("No valid tenants found", {
          requestedTenants: tenantIds.length,
          enabledTenants: targetTenants.length,
          hint: "Ensure tenant IDs are correct and tenants are enabled in configuration",
        });
      }

      // Check if any requested tenants were not found
      const foundTenantIds = targetTenants.map((t) => t.tenantId);
      const missingTenants = tenantIds.filter((id) => !foundTenantIds.includes(id));

      // Check approval requirements
      const approvalRequired = config.settings?.approval?.required || false;
      const approvalConfig = config.settings?.approval;

      // Check Redis connectivity if not in demo mode
      let redisHealthy = true;
      let redisError: string | undefined;
      if (!isDemoMode()) {
        let queueManager: DeploymentQueueManager | null = null;
        try {
          queueManager = new DeploymentQueueManager(REDIS_URL);
          await queueManager.close();
        } catch (error) {
          redisHealthy = false;
          redisError = error instanceof Error ? error.message : "Unknown error";
          await safelyCloseQueueManager(queueManager);
        }
      }

      // Return preview of what would be deployed
      return NextResponse.json({
        dryRun: true,
        valid: missingTenants.length === 0 && redisHealthy,
        solution: {
          name: solutionName,
          fileName: solutionFile.name,
          size: solutionFile.size,
          sizeFormatted: `${(solutionFile.size / 1024 / 1024).toFixed(2)} MB`,
        },
        tenants: {
          requested: tenantIds.length,
          valid: targetTenants.length,
          missing: missingTenants.length > 0 ? missingTenants : undefined,
          targets: targetTenants.map((t) => ({
            tenantId: t.tenantId,
            name: t.name,
            environmentUrl: isDemoMode() ? t.environmentUrl : (t as TenantConfig).environmentUrl,
          })),
        },
        approval: {
          required: approvalRequired,
          minApprovals: approvalConfig?.minApprovals || 1,
          timeout: approvalConfig?.timeout || "24h",
        },
        infrastructure: {
          redis: {
            healthy: redisHealthy,
            error: redisError,
          },
          demoMode: isDemoMode(),
        },
        warnings: [
          ...(missingTenants.length > 0
            ? [`${missingTenants.length} tenant(s) not found or disabled`]
            : []),
          ...(!redisHealthy ? ["Redis connection failed - deployments will not be queued"] : []),
        ],
        message:
          missingTenants.length === 0 && redisHealthy
            ? "Deployment validation passed - ready to deploy"
            : "Deployment validation found issues - see warnings",
      });
    }

    // Demo mode: create deployments using the new v2 model
    if (isDemoMode()) {
      const batchId = `batch-${Date.now().toString(36)}`;

      // Filter to requested tenants
      const targetTenants = DEMO_TENANTS.filter((t) => t.enabled && tenantIds.includes(t.tenantId));

      // Extract solution name from filename
      // Remove _managed.zip or _unmanaged.zip suffix, then version suffix like _1_0_0_0
      const solutionName = solutionFile.name
        .replace(/_(managed|unmanaged)\.zip$/i, "") // Remove _managed.zip or _unmanaged.zip
        .replace(/\.zip$/i, "") // Remove plain .zip if present
        .replace(/_\d+(_\d+)*$/i, ""); // Remove version suffix (e.g., _1_0_0_0)

      // Save solution file to disk in demo mode for later deployments
      const solutionsDir = resolve(SOLUTIONS_DIR);
      await mkdir(solutionsDir, { recursive: true });
      const solutionPath = join(solutionsDir, solutionFile.name);
      const solutionBuffer = Buffer.from(await solutionFile.arrayBuffer());
      await writeFile(solutionPath, solutionBuffer);

      const now = new Date().toISOString();

      // Create atomic deployments (one per tenant)
      const deployments: Deployment[] = targetTenants.map((t, index) => ({
        id: `${batchId}-${index}`,
        batchId,
        solutionName: solutionName || "DemoAgent",
        solutionVersion: "1.0.0",
        solutionPath,
        tenantId: t.tenantId,
        tenantName: t.name,
        environmentUrl: t.environmentUrl,
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
        attemptNumber: 1,
        triggeredBy: "manual" as const,
        // Include URL overrides if provided for this tenant
        ...(urlOverrides?.[t.tenantId] ? { urlOverride: urlOverrides[t.tenantId] } : {}),
      }));

      // Load config to check approval requirements
      let approvalRequired = false;
      let approvalConfig: { minApprovals?: number; timeout?: string } | undefined;
      try {
        const config = await loadConfig(resolve(CONFIG_PATH));
        approvalRequired = config.settings?.approval?.required || false;
        approvalConfig = config.settings?.approval;
      } catch {
        // Config not available, proceed without approval
      }

      // Determine initial status based on approval requirements
      const initialStatus: DeploymentStatus = approvalRequired
        ? "awaiting_approval"
        : "in_progress";

      // Create the batch
      const batch: DeploymentBatch = {
        id: batchId,
        solutionName: solutionName || "DemoAgent",
        solutionVersion: "1.0.0",
        solutionPath,
        status: initialStatus,
        totalDeployments: deployments.length,
        completedDeployments: 0,
        failedDeployments: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: approvalRequired ? undefined : now,
        triggeredBy: "manual",
      };

      // Update deployment statuses if awaiting approval
      if (approvalRequired) {
        deployments.forEach((d) => {
          d.status = "pending";
        });
      }

      // Store v2 data in demo stores
      for (const deployment of deployments) {
        demoDeploymentsV2.set(deployment.id, deployment);
      }
      demoBatches.set(batchId, batch);

      // Also persist to database
      try {
        deploymentRepo.createBatch(batch);
        for (const deployment of deployments) {
          deploymentRepo.createDeployment(deployment);
        }

        // Create approval record if required
        if (approvalRequired) {
          const timeout = approvalConfig?.timeout || "24h";
          const timeoutMs = parseTimeout(timeout);
          const expiresAt = new Date(Date.now() + timeoutMs).toISOString();

          approvalRepo.createApproval({
            deploymentId: batchId,
            status: "pending",
            requiredApprovals: approvalConfig?.minApprovals || 1,
            createdAt: now,
            expiresAt,
          });

          logApprovalAction("approval.requested", batchId);
        }

        logDeploymentAction("deployment.created", batchId, solutionName || "DemoAgent", {
          details: { tenantCount: targetTenants.length, approvalRequired },
        });
      } catch (dbError) {
        console.warn("Failed to persist to database:", dbError);
        // Continue - demo stores are primary for demo mode
      }

      // Also create legacy DeploymentJob for backward compatibility with existing UI
      const legacyDeployment = {
        id: batchId,
        solutionName: solutionName || "DemoAgent",
        solutionPath,
        solutionVersion: "1.0.0",
        status: initialStatus,
        totalTenants: targetTenants.length,
        completedTenants: 0,
        failedTenants: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: approvalRequired ? undefined : now,
        triggeredBy: "manual" as const,
        tenantResults: targetTenants.map((t) => ({
          tenantId: t.tenantId,
          tenantName: t.name,
          status: "pending" as const,
          attemptNumber: 1,
          // Include URL override for dependency display in logs
          ...(urlOverrides?.[t.tenantId] ? { urlOverride: urlOverrides[t.tenantId] } : {}),
        })),
      };
      demoDeployments.set(batchId, legacyDeployment);

      // Track deployment creation
      serverTrackDeployment("deployment_created", {
        deploymentId: batchId,
        solutionName: solutionName || "DemoAgent",
        tenantCount: targetTenants.length,
        status: initialStatus,
      });

      // Send notifications
      const notificationService = getDeploymentNotifications();
      if (approvalRequired) {
        await notificationService.notifyApprovalNeeded(
          batchId,
          solutionName || "DemoAgent",
          targetTenants.length
        );
      } else {
        await notificationService.notifyDeploymentStart(
          batchId,
          solutionName || "DemoAgent",
          targetTenants.length
        );
        // Start demo worker to auto-complete deployment
        startDemoDeployment(batchId);
      }

      return NextResponse.json({
        deploymentId: batchId, // Return batchId as deploymentId for backward compatibility
        batchId, // Also return batchId explicitly for v2 clients
        demoMode: true,
        solutionPath,
        tenantCount: targetTenants.length,
        approvalRequired,
        message: approvalRequired
          ? "Demo deployment created - awaiting approval"
          : "Demo deployment created - watch the progress!",
      });
    }

    // Load config to get tenant details and partner info
    const config = await loadConfig(resolve(CONFIG_PATH));

    // Filter to only requested tenants that exist and are enabled
    const targetTenants: TenantConfig[] = config.tenants.filter(
      (t) => t.enabled && tenantIds.includes(t.tenantId)
    );

    if (targetTenants.length === 0) {
      return notFound("tenants", undefined);
    }

    // Save the solution file
    const solutionsDir = resolve(SOLUTIONS_DIR);
    await mkdir(solutionsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const solutionFileName = `${timestamp}_${solutionFile.name}`;
    const solutionPath = join(solutionsDir, solutionFileName);

    const solutionBuffer = Buffer.from(await solutionFile.arrayBuffer());
    await writeFile(solutionPath, solutionBuffer);

    // Create deployment - handle Redis connection failures gracefully
    const deploymentId = crypto.randomUUID();
    let queueManager: DeploymentQueueManager | null = null;
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      await queueManager.addTenantDeploymentsBulk(
        deploymentId,
        solutionPath,
        targetTenants,
        config.partner.tenantId,
        config.partner.clientId
      );

      await queueManager.close();
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        console.error("Redis connection failed:", error);
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors
      throw error;
    }

    // Track deployment creation
    serverTrackDeployment("deployment_created", {
      deploymentId,
      solutionName: solutionFile.name,
      tenantCount: targetTenants.length,
      status: "in_progress",
    });

    // Send start notification
    const notificationService = getDeploymentNotifications();
    await notificationService.notifyDeploymentStart(
      deploymentId,
      solutionFile.name,
      targetTenants.length
    );

    return NextResponse.json({
      deploymentId,
      solutionPath,
      tenantCount: targetTenants.length,
      message: "Deployment created successfully",
    });
  } catch (error) {
    console.error("Create deployment error:", error);

    // Track the error
    serverTrackError(error instanceof Error ? error : String(error), {
      endpoint: "/api/deployments/create",
      method: "POST",
    });

    return internalError(
      "Failed to create deployment",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * Parse timeout string like "24h", "30m", "7d"
 */
function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)([mhd])$/);
  if (!match) {
    return 24 * 60 * 60 * 1000; // Default 24 hours
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}
