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
import {
  TokenManager,
  DataverseClient,
  SolutionOperations,
  ConnectionOperations,
  getClientSecret,
  loadConfig,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  TenantConfig,
} from "@agentsync/core";
import { invalidRequest, internalError } from "@/lib/errors";

/**
 * In-process deployment endpoint for simple/serverless deployments
 *
 * This processes deployments directly in the web app without Redis or workers.
 * Good for:
 * - Vercel/Netlify serverless deployments
 * - Single-tenant scenarios
 * - Development/testing
 * - Low-volume deployments
 *
 * For high-volume or multi-instance deployments, use the worker + Redis approach.
 */

export const maxDuration = 300; // 5 minute timeout for Vercel Pro
export const dynamic = "force-dynamic";

interface DeploymentRequest {
  tenantIds: string[];
  solutionPath: string;
  solutionName?: string;
}

interface TenantResult {
  tenantId: string;
  tenantName: string;
  success: boolean;
  error?: string;
  importJobId?: string;
  durationMs: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DeploymentRequest;
    const { tenantIds, solutionPath, solutionName } = body;

    if (!tenantIds?.length || !solutionPath) {
      return invalidRequest("Missing required fields: tenantIds, solutionPath");
    }

    // Load config
    const configPath = process.env.CONFIG_PATH || "./config/tenants.yaml";
    const config = await loadConfig(configPath);

    // Filter to requested tenants
    const tenantsToProcess = config.tenants.filter(
      (t) => tenantIds.includes(t.tenantId) && t.enabled !== false
    );

    if (tenantsToProcess.length === 0) {
      return invalidRequest("No enabled tenants found matching the provided IDs");
    }

    // Process each tenant sequentially (for simplicity in serverless)
    const results: TenantResult[] = [];
    const deploymentId = crypto.randomUUID();

    for (const tenant of tenantsToProcess) {
      const result = await deployToTenant(
        tenant,
        solutionPath,
        solutionName || "Unknown",
        config.partner.clientId,
        config
      );
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      deploymentId,
      status: failedCount === 0 ? "completed" : "partial",
      totalTenants: tenantsToProcess.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("Deployment error:", error);
    return internalError(
      "Failed to process deployment",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

async function deployToTenant(
  tenant: TenantConfig,
  solutionPath: string,
  solutionName: string,
  partnerClientId: string,
  config: Awaited<ReturnType<typeof loadConfig>>
): Promise<TenantResult> {
  const startTime = Date.now();

  try {
    const clientSecret = getClientSecret();

    const tokenManager = new TokenManager({
      tenantId: tenant.tenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl: tenant.environmentUrl,
      tokenManager,
    });

    const solutionOps = new SolutionOperations(dataverseClient);
    const connectionOps = new ConnectionOperations(dataverseClient);

    // Import solution
    const importJobId = await solutionOps.importSolutionAsync(solutionPath, {
      overwriteUnmanagedCustomizations: true,
      publishWorkflows: true,
    });

    // Wait for import
    const result = await solutionOps.waitForImport(importJobId, {
      timeoutMs: 240000, // 4 minutes (leave 1 min buffer for serverless timeout)
      pollIntervalMs: 5000,
    });

    if (!result.success) {
      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        success: false,
        error: result.error || "Import failed",
        importJobId,
        durationMs: Date.now() - startTime,
      };
    }

    // Apply connection mappings
    const connectionMappings = getEffectiveConnectionMappings(config, tenant);
    if (connectionMappings.length > 0) {
      await connectionOps.applyConnectionMappings(connectionMappings);
    }

    // Apply environment variables
    const envVars = getEffectiveEnvironmentVariables(config, tenant);
    if (envVars.length > 0) {
      await connectionOps.applyEnvironmentVariables(envVars);
    }

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      success: true,
      importJobId,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}
