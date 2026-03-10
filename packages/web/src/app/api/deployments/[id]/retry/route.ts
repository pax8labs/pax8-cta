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
import { resolve } from "path";
import {
  loadConfig,
  isDemoMode,
  DEPLOYMENT_STATUS_CATEGORIES,
  TenantConfig,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { demoDeployments, resolveDeployment } from "@/lib/demo-store";
import { serverTrackDeployment, serverTrackError } from "@/lib/posthog-server";
import { requireRoles, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { deploymentRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { notFound, invalidRequest, internalError } from "@/lib/errors";
import {
  isRedisConnectionError,
  createQueueUnavailableResponse,
  safelyCloseQueueManager,
} from "@/lib/queue-error-handler";

const logger = createLogger("deployment-retry");

// Use centralized retryable statuses (failed, cancelled, rolled_back)
const RETRYABLE_STATUSES = DEPLOYMENT_STATUS_CATEGORIES.RETRYABLE as readonly string[];

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Retry failed tenant deployments for a specific deployment
 * Requires Admin or Deployer role
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  // Require Admin or Deployer role
  const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER]);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/retry`, "forbidden", {
      action: "retry_deployment",
    });
    return session;
  }

  // Apply rate limiting
  const rateLimitResult = await deploymentRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Demo mode handling
    if (isDemoMode()) {
      // Resolve deployment from store or generate for historical demo IDs
      const deployment = resolveDeployment(params.id);

      if (!deployment) {
        return notFound("deployment", params.id);
      }

      // Find retryable tenants (failed, cancelled, or rolled_back)
      const retryableTenants = deployment.tenantResults.filter((r) =>
        RETRYABLE_STATUSES.includes(r.status)
      );

      if (retryableTenants.length === 0) {
        return invalidRequest("No failed or cancelled tenants to retry");
      }

      // Reset retryable tenants to pending and update deployment status
      for (const result of deployment.tenantResults) {
        if (RETRYABLE_STATUSES.includes(result.status)) {
          result.status = "pending";
          result.error = undefined;
          result.startedAt = undefined;
          result.completedAt = undefined;
          result.attemptNumber = (result.attemptNumber || 1) + 1;
        }
      }

      // Reset deployment status to in_progress
      deployment.status = "in_progress";
      // Recalculate counts after resetting failed tenants to pending
      deployment.completedTenants = deployment.tenantResults.filter(
        (t) => t.status === "completed"
      ).length;
      deployment.failedTenants = deployment.tenantResults.filter(
        (t) => t.status === "failed"
      ).length;
      deployment.completedAt = undefined; // Clear completion time so SSE knows to process
      deployment.updatedAt = new Date().toISOString();

      // Update the stored deployment
      demoDeployments.set(params.id, deployment);

      // Track retry event
      serverTrackDeployment("deployment_retried", {
        deploymentId: params.id,
        solutionName: deployment.solutionName,
        tenantCount: retryableTenants.length,
        status: "in_progress",
      });

      return NextResponse.json({
        demoMode: true,
        message: `Retrying ${retryableTenants.length} tenant(s)`,
        retriedTenants: retryableTenants.map((t) => t.tenantName),
        deploymentId: params.id,
      });
    }

    // Handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null;
    let tenantsToRetry: TenantConfig[];
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL);

      // Get current deployment status
      const deployment = await queueManager.getDeploymentStatus(params.id);

      if (!deployment) {
        await queueManager.close();
        return notFound("deployment", params.id);
      }

      // Find retryable tenants (failed, cancelled, or rolled_back)
      const retryableTenants = deployment.tenantResults.filter((r) =>
        RETRYABLE_STATUSES.includes(r.status)
      );

      if (retryableTenants.length === 0) {
        await queueManager.close();
        return invalidRequest("No failed or cancelled tenants to retry");
      }

      // Load config to get full tenant details
      const config = await loadConfig(resolve(CONFIG_PATH));

      tenantsToRetry = config.tenants.filter((t) =>
        retryableTenants.some((f) => f.tenantId === t.tenantId)
      );

      // Create new jobs for failed tenants
      await queueManager.addTenantDeploymentsBulk(
        params.id, // Use same deployment ID
        deployment.solutionPath,
        tenantsToRetry,
        config.partner.tenantId,
        config.partner.clientId
      );

      await queueManager.close();
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager);

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error("Redis connection failed during retry", { error, deploymentId: params.id });
        return createQueueUnavailableResponse(error);
      }

      // Re-throw non-Redis errors to outer catch
      throw error;
    }

    // Track retry event
    serverTrackDeployment("deployment_retried", {
      deploymentId: params.id,
      tenantCount: tenantsToRetry.length,
      status: "in_progress",
    });

    return NextResponse.json({
      message: `Retrying ${tenantsToRetry.length} failed tenant(s)`,
      retriedTenants: tenantsToRetry.map((t) => t.name),
    });
  } catch (error) {
    logger.error("Retry deployment error", error as Error);

    // Track the error
    serverTrackError(error instanceof Error ? error : String(error), {
      endpoint: `/api/deployments/${params.id}/retry`,
      method: "POST",
    });

    return internalError("Failed to retry deployment");
  }
}
