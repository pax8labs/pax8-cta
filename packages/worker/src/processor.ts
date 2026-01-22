import { Worker, Job, RedisOptions } from "bullmq";
import {
  TokenManager,
  DataverseClient,
  SolutionOperations,
  getClientSecret,
} from "@csd/core";
import {
  TENANT_DEPLOYMENT_QUEUE_NAME,
  TenantDeploymentJobData,
  TenantDeploymentJobResult,
} from "./queue.js";

export interface ProcessorOptions {
  redisUrl?: string;
  concurrency?: number;
  rateLimitMax?: number;
  rateLimitDuration?: number;
}

/**
 * Parse Redis URL into connection options
 */
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Creates a worker that processes tenant deployment jobs
 */
export function createTenantDeploymentWorker(
  options: ProcessorOptions = {}
): Worker<TenantDeploymentJobData, TenantDeploymentJobResult> {
  const {
    redisUrl = "redis://localhost:6379",
    concurrency = 5, // Process 5 tenants concurrently
    rateLimitMax = 10,
    rateLimitDuration = 60000, // 10 requests per minute per tenant
  } = options;

  const connectionOptions = parseRedisUrl(redisUrl);

  const worker = new Worker<TenantDeploymentJobData, TenantDeploymentJobResult>(
    TENANT_DEPLOYMENT_QUEUE_NAME,
    async (job: Job<TenantDeploymentJobData>) => {
      return processTenantDeployment(job);
    },
    {
      connection: connectionOptions,
      concurrency,
      limiter: {
        max: rateLimitMax,
        duration: rateLimitDuration,
      },
    }
  );

  // Log worker events
  worker.on("completed", (job) => {
    console.log(
      `[${job.id}] Completed: ${job.data.tenant.name} - ${
        job.returnvalue?.success ? "SUCCESS" : "FAILED"
      }`
    );
  });

  worker.on("failed", (job, error) => {
    console.error(`[${job?.id}] Failed: ${job?.data.tenant.name} - ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error(`Worker error: ${error.message}`);
  });

  return worker;
}

/**
 * Process a single tenant deployment
 */
async function processTenantDeployment(
  job: Job<TenantDeploymentJobData>
): Promise<TenantDeploymentJobResult> {
  const { tenant, solutionPath, partnerClientId } = job.data;

  console.log(`[${job.id}] Starting deployment to ${tenant.name}`);

  try {
    // Get client secret from environment
    const clientSecret = getClientSecret();

    // Create token manager for the customer tenant
    // Using partner credentials with GDAP delegation
    const tokenManager = new TokenManager({
      tenantId: tenant.tenantId,
      clientId: partnerClientId,
      clientSecret,
    });

    // Create Dataverse client for the customer environment
    const dataverseClient = new DataverseClient({
      environmentUrl: tenant.environmentUrl,
      tokenManager,
    });

    const solutionOps = new SolutionOperations(dataverseClient);

    // Update job progress
    await job.updateProgress(10);

    // Import the solution asynchronously
    console.log(`[${job.id}] Starting async import for ${tenant.name}`);
    const importJobId = await solutionOps.importSolutionAsync(solutionPath, {
      overwriteUnmanagedCustomizations: true,
      publishWorkflows: true,
    });

    await job.updateProgress(30);

    // Wait for import to complete with progress updates
    const result = await solutionOps.waitForImport(importJobId, {
      pollIntervalMs: 5000,
      timeoutMs: 300000, // 5 minutes timeout per tenant
      onProgress: async (progress) => {
        // Map import progress (0-100) to job progress (30-90)
        const jobProgress = 30 + Math.floor(progress * 0.6);
        await job.updateProgress(jobProgress);
      },
    });

    await job.updateProgress(100);

    if (result.success) {
      console.log(`[${job.id}] Successfully deployed to ${tenant.name}`);
      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        success: true,
        importJobId: result.importJobId,
      };
    } else {
      console.error(`[${job.id}] Import failed for ${tenant.name}: ${result.error}`);
      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        success: false,
        error: result.error,
        importJobId: result.importJobId,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${job.id}] Error deploying to ${tenant.name}: ${errorMessage}`);

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      success: false,
      error: errorMessage,
    };
  }
}
