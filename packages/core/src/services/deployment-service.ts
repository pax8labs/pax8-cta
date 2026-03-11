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

import { TokenManager, TokenManagerConfig } from "../auth/token-manager.js";
import { DataverseClient } from "../dataverse/client.js";
import { SolutionOperations, ImportResult } from "../dataverse/solution-ops.js";
import { ConnectionOperations } from "../dataverse/connection-refs.js";
import { ConnectionMapping, EnvironmentVariable } from "../config/schema.js";
import { PowerPlatformAdminClient } from "../powerplatform/admin-client.js";

export interface DeploymentServiceConfig extends TokenManagerConfig {
  // Partner/MSP tenant credentials for GDAP access
}

export interface DeploymentTarget {
  tenantId: string;
  tenantName: string;
  environmentUrl: string;
  environmentId?: string; // Power Platform environment ID for app user setup
  connectionMappings?: ConnectionMapping[];
  environmentVariables?: EnvironmentVariable[];
  autoSetup?: boolean; // Whether to auto-setup app user if missing (default: true)
}

export interface RealDeploymentProgress {
  tenantId: string;
  tenantName: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  step: RealDeploymentStepId;
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  error?: string;
  importJobId?: string;
}

export type RealDeploymentStepId =
  | "authenticating"
  | "validating"
  | "uploading"
  | "importing"
  | "configuring_connections"
  | "configuring_variables"
  | "verifying"
  | "completing";

export interface DeploymentResult {
  tenantId: string;
  tenantName: string;
  success: boolean;
  importJobId?: string;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export type RealDeploymentProgressCallback = (progress: RealDeploymentProgress) => void;

/**
 * Service for deploying solutions to customer tenants via GDAP
 */
export class DeploymentService {
  private config: DeploymentServiceConfig;

  constructor(config: DeploymentServiceConfig) {
    this.config = config;
  }

  /**
   * Deploy a solution to a single tenant
   */
  async deployToTenant(
    solutionBase64: string,
    target: DeploymentTarget,
    onProgress?: RealDeploymentProgressCallback
  ): Promise<DeploymentResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const emitProgress = (
      step: RealDeploymentStepId,
      progress: number,
      status: RealDeploymentProgress["status"] = "in_progress"
    ) => {
      onProgress?.({
        tenantId: target.tenantId,
        tenantName: target.tenantName,
        status,
        step,
        progress,
        startedAt,
      });
    };

    try {
      // Step 1: Authenticate to customer tenant
      emitProgress("authenticating", 5);

      const customerTokenManager = new TokenManager({
        tenantId: target.tenantId,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      });

      // Verify we can get a token
      await customerTokenManager.getDataverseToken(target.environmentUrl);
      emitProgress("authenticating", 15);

      // Step 2: Validate environment
      emitProgress("validating", 20);

      const dataverseClient = new DataverseClient({
        environmentUrl: target.environmentUrl,
        tokenManager: customerTokenManager,
        clientId: this.config.clientId,
      });

      // Quick health check - try to query solutions
      try {
        await dataverseClient.querySolutions();
      } catch (error) {
        // Check if this is an app user setup issue
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAppUserError = this.isAppUserNotRegisteredError(errorMessage);

        if (isAppUserError) {
          // Check if auto-setup is enabled (default: true)
          const autoSetup = target.autoSetup !== false;

          if (!autoSetup) {
            // Auto-setup is disabled, provide helpful error message
            throw new Error(
              `Application user not registered in environment.\n\n` +
                `Auto-setup is disabled (autoSetup: false in config).\n\n` +
                `To fix manually:\n` +
                `1. Go to https://admin.powerplatform.microsoft.com\n` +
                `2. Select the environment → Settings → Users + permissions → Application users\n` +
                `3. Click "+ New app user" and add your application (Client ID: ${this.config.clientId})\n` +
                `4. Assign the "System Administrator" security role\n` +
                `5. Save and retry the deployment\n\n` +
                `Or enable auto-setup by removing 'autoSetup: false' from your tenant configuration.`
            );
          }

          // Auto-setup the application user
          console.log(
            `Application user not registered. Auto-setting up for ${target.tenantName}...`
          );
          await this.setupApplicationUser(target, customerTokenManager);

          // Retry the query
          await dataverseClient.querySolutions();
        } else {
          // Re-throw other errors
          throw error;
        }
      }
      emitProgress("validating", 30);

      // Step 3: Import solution
      emitProgress("uploading", 35);

      const solutionOps = new SolutionOperations(dataverseClient);

      // Import solution from base64
      emitProgress("importing", 40);

      const importResult = await this.importSolutionFromBase64(
        solutionOps,
        solutionBase64,
        (importProgress) => {
          // Map import progress (0-100) to our step range (40-70)
          const mappedProgress = 40 + Math.floor(importProgress * 0.3);
          emitProgress("importing", mappedProgress);
        }
      );

      if (!importResult.success) {
        throw new Error(importResult.error || "Solution import failed");
      }

      emitProgress("importing", 70);

      // Step 4: Configure connections (if provided)
      if (target.connectionMappings && target.connectionMappings.length > 0) {
        emitProgress("configuring_connections", 75);

        const connectionOps = new ConnectionOperations(dataverseClient);
        const connResult = await connectionOps.applyConnectionMappings(target.connectionMappings);

        if (!connResult.success) {
          console.warn("Connection mapping warnings:", connResult.errors);
          // Don't fail the deployment for connection mapping issues
        }
      }

      emitProgress("configuring_connections", 80);

      // Step 5: Configure environment variables (if provided)
      if (target.environmentVariables && target.environmentVariables.length > 0) {
        emitProgress("configuring_variables", 85);

        const connectionOps = new ConnectionOperations(dataverseClient);
        const varResult = await connectionOps.applyEnvironmentVariables(
          target.environmentVariables
        );

        if (!varResult.success) {
          console.warn("Environment variable warnings:", varResult.errors);
          // Don't fail the deployment for env var issues
        }
      }

      emitProgress("configuring_variables", 90);

      // Step 6: Verify deployment
      emitProgress("verifying", 95);

      // Could add additional verification here (e.g., check solution is active)

      // Step 7: Complete
      emitProgress("completing", 100, "completed");

      const completedAt = new Date().toISOString();

      return {
        tenantId: target.tenantId,
        tenantName: target.tenantName,
        success: true,
        importJobId: importResult.importJobId,
        startedAt,
        completedAt,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);

      onProgress?.({
        tenantId: target.tenantId,
        tenantName: target.tenantName,
        status: "failed",
        step: "importing", // Best guess at where it failed
        progress: 0,
        startedAt,
        completedAt,
        error: errorMessage,
      });

      return {
        tenantId: target.tenantId,
        tenantName: target.tenantName,
        success: false,
        error: errorMessage,
        startedAt,
        completedAt,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Deploy to multiple tenants with concurrency control
   */
  async deployToTenants(
    solutionBase64: string,
    targets: DeploymentTarget[],
    options?: {
      maxConcurrent?: number;
      onProgress?: RealDeploymentProgressCallback;
    }
  ): Promise<DeploymentResult[]> {
    const { maxConcurrent = 3, onProgress } = options || {};

    const results: DeploymentResult[] = [];
    const pending = [...targets];
    const active: Promise<void>[] = [];

    while (pending.length > 0 || active.length > 0) {
      // Start new deployments up to max concurrency
      while (pending.length > 0 && active.length < maxConcurrent) {
        const target = pending.shift()!;

        const promise = this.deployToTenant(solutionBase64, target, onProgress)
          .then((result) => {
            results.push(result);
          })
          .finally(() => {
            const index = active.indexOf(promise);
            if (index > -1) active.splice(index, 1);
          });

        active.push(promise);
      }

      // Wait for at least one to complete
      if (active.length > 0) {
        await Promise.race(active);
      }
    }

    return results;
  }

  /**
   * Import a solution from base64 encoded content
   */
  private async importSolutionFromBase64(
    solutionOps: SolutionOperations,
    base64Content: string,
    onProgress?: (progress: number) => void
  ): Promise<ImportResult> {
    // Write to temp file (required by current SolutionOperations API)
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `solution-${Date.now()}.zip`);

    try {
      // Decode and write solution
      const buffer = Buffer.from(base64Content, "base64");
      await fs.writeFile(tempFile, buffer);

      // Import with progress polling
      const importJobId = await solutionOps.importSolutionAsync(tempFile);

      // Poll for completion
      const result = await solutionOps.waitForImport(importJobId, {
        pollIntervalMs: 3000,
        timeoutMs: 600000, // 10 minutes
        onProgress,
      });

      return result;
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Validate that a tenant is ready for deployment
   */
  async validateTenant(target: DeploymentTarget): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check authentication
      const customerTokenManager = new TokenManager({
        tenantId: target.tenantId,
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
      });

      try {
        await customerTokenManager.getDataverseToken(target.environmentUrl);
      } catch (error) {
        errors.push(
          `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return { valid: false, errors, warnings };
      }

      // Check environment is accessible
      const dataverseClient = new DataverseClient({
        environmentUrl: target.environmentUrl,
        tokenManager: customerTokenManager,
        clientId: this.config.clientId,
      });

      try {
        await dataverseClient.querySolutions();
      } catch (error) {
        errors.push(
          `Environment not accessible: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        return { valid: false, errors, warnings };
      }

      // Check connection references if mappings provided
      if (target.connectionMappings && target.connectionMappings.length > 0) {
        const connectionOps = new ConnectionOperations(dataverseClient);

        for (const mapping of target.connectionMappings) {
          const connRef = await connectionOps.getConnectionReferenceByLogicalName(
            mapping.sourceLogicalName
          );
          if (!connRef) {
            warnings.push(`Connection reference not found: ${mapping.sourceLogicalName}`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : "Unknown error"}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Check if an error message indicates the app user is not registered
   */
  private isAppUserNotRegisteredError(errorMessage: string): boolean {
    return (
      /user is not a member of the organization/i.test(errorMessage) ||
      /not a member of.*environment/i.test(errorMessage) ||
      /application is not registered as a user/i.test(errorMessage)
    );
  }

  /**
   * Setup application user in an environment
   */
  private async setupApplicationUser(
    target: DeploymentTarget,
    tokenManager: TokenManager
  ): Promise<void> {
    // We need the environment ID for the Power Platform Admin API
    if (!target.environmentId) {
      // Try to extract from URL (e.g., https://org.crm.dynamics.com -> org)
      // This is a fallback - ideally environmentId should be provided in config
      const match = target.environmentUrl.match(/https:\/\/([^.]+)\./);
      if (!match) {
        throw new Error(
          "Cannot auto-setup application user: environmentId not provided in target configuration.\n" +
            "Please add 'environmentId' to your tenant configuration or set 'autoSetup: false' to disable auto-setup."
        );
      }
      // Note: This is the org name, not the full environment ID
      // The Admin API requires the full ID like: /providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/{guid}
      throw new Error(
        "Cannot auto-setup application user: environmentId not provided in target configuration.\n" +
          "Please add 'environmentId' to your tenant configuration.\n" +
          "You can find the environment ID in the Power Platform Admin Center URL when viewing the environment."
      );
    }

    const adminClient = new PowerPlatformAdminClient({
      tokenManager,
    });

    try {
      const result = await adminClient.setupApplicationUser(
        target.environmentId,
        target.environmentUrl,
        this.config.clientId
      );

      if (result.created) {
        console.log(`✓ ${result.message}`);
      } else {
        console.log(`✓ ${result.message}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to auto-setup application user: ${errorMessage}\n\n` +
          `You can disable auto-setup by setting 'autoSetup: false' in your tenant configuration,\n` +
          `then follow the manual setup instructions.`
      );
    }
  }
}
