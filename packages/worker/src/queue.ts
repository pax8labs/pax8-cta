import { Queue, QueueEvents, Job, RedisOptions } from "bullmq";
import {
  TenantConfig,
  DeploymentJob,
  DeploymentStatus,
  TenantDeploymentResult,
} from "@csd/core";

export const DEPLOYMENT_QUEUE_NAME = "deployments";
export const TENANT_DEPLOYMENT_QUEUE_NAME = "tenant-deployments";

/**
 * Job data for a full deployment (to multiple tenants)
 */
export interface DeploymentJobData {
  deploymentId: string;
  solutionPath: string;
  solutionName: string;
  tenants: TenantConfig[];
  partnerTenantId: string;
  partnerClientId: string;
  // Client secret comes from environment variable
}

/**
 * Job data for a single tenant deployment
 */
export interface TenantDeploymentJobData {
  deploymentId: string;
  solutionPath: string;
  tenant: TenantConfig;
  partnerTenantId: string;
  partnerClientId: string;
}

/**
 * Result of a tenant deployment job
 */
export interface TenantDeploymentJobResult {
  tenantId: string;
  tenantName: string;
  success: boolean;
  error?: string;
  importJobId?: string;
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
 * Creates and manages deployment queues
 */
export class DeploymentQueueManager {
  private connectionOptions: RedisOptions;
  private deploymentQueue: Queue<DeploymentJobData>;
  private tenantDeploymentQueue: Queue<TenantDeploymentJobData, TenantDeploymentJobResult>;
  private queueEvents: QueueEvents;

  constructor(redisUrl: string = "redis://localhost:6379") {
    this.connectionOptions = parseRedisUrl(redisUrl);

    this.deploymentQueue = new Queue(DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
    });

    this.tenantDeploymentQueue = new Queue(TENANT_DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10000, // Start with 10 seconds
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });

    this.queueEvents = new QueueEvents(TENANT_DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
    });
  }

  /**
   * Add a new deployment job to the queue
   */
  async addDeployment(data: DeploymentJobData): Promise<Job<DeploymentJobData>> {
    return this.deploymentQueue.add("deployment", data, {
      jobId: data.deploymentId,
    });
  }

  /**
   * Add a single tenant deployment job
   */
  async addTenantDeployment(
    data: TenantDeploymentJobData
  ): Promise<Job<TenantDeploymentJobData, TenantDeploymentJobResult>> {
    const jobId = `${data.deploymentId}-${data.tenant.tenantId}`;
    return this.tenantDeploymentQueue.add("tenant-deployment", data, {
      jobId,
    });
  }

  /**
   * Add multiple tenant deployment jobs in bulk
   */
  async addTenantDeploymentsBulk(
    deploymentId: string,
    solutionPath: string,
    tenants: TenantConfig[],
    partnerTenantId: string,
    partnerClientId: string
  ): Promise<void> {
    const jobs = tenants.map((tenant) => ({
      name: "tenant-deployment",
      data: {
        deploymentId,
        solutionPath,
        tenant,
        partnerTenantId,
        partnerClientId,
      } as TenantDeploymentJobData,
      opts: {
        jobId: `${deploymentId}-${tenant.tenantId}`,
      },
    }));

    await this.tenantDeploymentQueue.addBulk(jobs);
  }

  /**
   * Get the status of a deployment
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentJob | null> {
    // Get all tenant jobs for this deployment
    const jobs = await this.tenantDeploymentQueue.getJobs([
      "completed",
      "failed",
      "active",
      "waiting",
      "delayed",
    ]);

    const deploymentJobs = jobs.filter(
      (job) => job.data.deploymentId === deploymentId
    );

    if (deploymentJobs.length === 0) {
      return null;
    }

    const tenantResults: TenantDeploymentResult[] = await Promise.all(
      deploymentJobs.map(async (job) => {
        const state = await job.getState();
        let status: DeploymentStatus = "pending";

        if (state === "completed") {
          const result = job.returnvalue;
          status = result?.success ? "completed" : "failed";
        } else if (state === "failed") {
          status = "failed";
        } else if (state === "active") {
          status = "in_progress";
        }

        return {
          tenantId: job.data.tenant.tenantId,
          tenantName: job.data.tenant.name,
          status,
          startedAt: job.processedOn
            ? new Date(job.processedOn).toISOString()
            : undefined,
          completedAt: job.finishedOn
            ? new Date(job.finishedOn).toISOString()
            : undefined,
          error:
            state === "failed"
              ? job.failedReason
              : job.returnvalue?.error,
          solutionImportJobId: job.returnvalue?.importJobId,
          attemptNumber: job.attemptsMade + 1,
        };
      })
    );

    const completedCount = tenantResults.filter(
      (r) => r.status === "completed"
    ).length;
    const failedCount = tenantResults.filter(
      (r) => r.status === "failed"
    ).length;

    let overallStatus: DeploymentStatus = "pending";
    if (completedCount + failedCount === tenantResults.length) {
      overallStatus = failedCount > 0 ? "failed" : "completed";
    } else if (tenantResults.some((r) => r.status === "in_progress")) {
      overallStatus = "in_progress";
    }

    // Get the first job to extract common metadata
    const firstJob = deploymentJobs[0];

    return {
      id: deploymentId,
      solutionPath: firstJob.data.solutionPath,
      solutionName: firstJob.data.solutionPath.split("/").pop() || "",
      status: overallStatus,
      createdAt: new Date(firstJob.timestamp).toISOString(),
      updatedAt: new Date().toISOString(),
      tenantResults,
      totalTenants: tenantResults.length,
      completedTenants: completedCount,
      failedTenants: failedCount,
    };
  }

  /**
   * Get the tenant deployment queue for creating workers
   */
  getTenantDeploymentQueue(): Queue<TenantDeploymentJobData, TenantDeploymentJobResult> {
    return this.tenantDeploymentQueue;
  }

  /**
   * Get queue events for monitoring
   */
  getQueueEvents(): QueueEvents {
    return this.queueEvents;
  }

  /**
   * Get Redis connection options for workers
   */
  getConnectionOptions(): RedisOptions {
    return this.connectionOptions;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.deploymentQueue.close();
    await this.tenantDeploymentQueue.close();
    await this.queueEvents.close();
  }
}
