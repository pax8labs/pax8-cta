import { TokenManager, TokenManagerConfig } from "../auth/token-manager.js";
import { DataverseClient } from "../dataverse/client.js";
import { SolutionOperations, ImportResult } from "../dataverse/solution-ops.js";
import { ConnectionOperations } from "../dataverse/connection-refs.js";
import { ConnectionMapping, EnvironmentVariable } from "../config/schema.js";

export interface DeploymentServiceConfig extends TokenManagerConfig {
  // Partner/MSP tenant credentials for GDAP access
}

export interface DeploymentTarget {
  tenantId: string;
  tenantName: string;
  environmentUrl: string;
  connectionMappings?: ConnectionMapping[];
  environmentVariables?: EnvironmentVariable[];
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

    const emitProgress = (step: RealDeploymentStepId, progress: number, status: RealDeploymentProgress["status"] = "in_progress") => {
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
      });

      // Quick health check - try to query solutions
      await dataverseClient.querySolutions();
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
        const varResult = await connectionOps.applyEnvironmentVariables(target.environmentVariables);

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
        errors.push(`Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        return { valid: false, errors, warnings };
      }

      // Check environment is accessible
      const dataverseClient = new DataverseClient({
        environmentUrl: target.environmentUrl,
        tokenManager: customerTokenManager,
      });

      try {
        await dataverseClient.querySolutions();
      } catch (error) {
        errors.push(`Environment not accessible: ${error instanceof Error ? error.message : "Unknown error"}`);
        return { valid: false, errors, warnings };
      }

      // Check connection references if mappings provided
      if (target.connectionMappings && target.connectionMappings.length > 0) {
        const connectionOps = new ConnectionOperations(dataverseClient);

        for (const mapping of target.connectionMappings) {
          const connRef = await connectionOps.getConnectionReferenceByLogicalName(mapping.sourceLogicalName);
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
}
