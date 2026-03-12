import { Queue, QueueEvents, Job, RedisOptions } from "bullmq";
import {
  TenantConfig,
  DeploymentJob,
  DeploymentStatus,
  TenantDeploymentResult,
  Config,
  Schedule,
  SchedulerService,
  workerLogger,
  JOB_RETRY_INITIAL_DELAY_MS,
  COMPLETED_JOB_RETENTION_MS,
  COMPLETED_JOB_MAX_COUNT,
  FAILED_JOB_RETENTION_MS,
  SCHEDULED_JOB_RETENTION_MS,
  SCHEDULED_JOB_MAX_COUNT,
  SCHEDULED_FAILED_JOB_RETENTION_MS,
  DEFAULT_JOB_ATTEMPTS,
  ONE_SECOND_MS,
  parseRedisUrl as parseRedisUrlShared,
  DEFAULT_REDIS_URL,
} from "@agentsync/core";

const logger = workerLogger;

export const DEPLOYMENT_QUEUE_NAME = "deployments";
export const TENANT_DEPLOYMENT_QUEUE_NAME = "tenant-deployments";
export const SCHEDULED_DEPLOYMENT_QUEUE_NAME = "scheduled-deployments";

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
  waveNumber?: number;
  waveName?: string;
  config?: Config;
}

/**
 * Job data for a single tenant deployment
 */
export interface TenantDeploymentJobData {
  deploymentId: string;
  solutionPath: string;
  solutionName?: string;
  tenant: TenantConfig;
  partnerTenantId: string;
  partnerClientId: string;
  waveNumber?: number;
  waveName?: string;
  config?: Config;
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
  durationMs?: number;
}

/**
 * Job data for a scheduled deployment trigger
 * This is what BullMQ repeatable jobs use to trigger deployments on schedule
 */
export interface ScheduledDeploymentJobData {
  scheduleId: string;
  scheduleName: string;
  solutionPath: string;
  solutionName: string;
  tenantIds: string[]; // Which tenants to deploy to
  tags?: string[]; // Or deploy to tenants matching these tags
  config: Config;
}

/**
 * Result of a scheduled deployment trigger
 */
export interface ScheduledDeploymentJobResult {
  scheduleId: string;
  deploymentId: string;
  tenantCount: number;
  triggeredAt: string;
  withinMaintenanceWindow: boolean;
}

/**
 * Creates and manages deployment queues
 */
export class DeploymentQueueManager {
  private connectionOptions: RedisOptions;
  private deploymentQueue: Queue<DeploymentJobData>;
  private tenantDeploymentQueue: Queue<TenantDeploymentJobData, TenantDeploymentJobResult>;
  private scheduledDeploymentQueue: Queue<ScheduledDeploymentJobData, ScheduledDeploymentJobResult>;
  private queueEvents: QueueEvents;
  private schedulerService: SchedulerService;

  constructor(redisUrl: string = DEFAULT_REDIS_URL) {
    this.connectionOptions = parseRedisUrlShared(redisUrl);
    this.schedulerService = new SchedulerService();

    this.deploymentQueue = new Queue(DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
    });

    this.tenantDeploymentQueue = new Queue(TENANT_DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
      defaultJobOptions: {
        attempts: DEFAULT_JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: JOB_RETRY_INITIAL_DELAY_MS,
        },
        removeOnComplete: {
          age: COMPLETED_JOB_RETENTION_MS / ONE_SECOND_MS, // BullMQ uses seconds
          count: COMPLETED_JOB_MAX_COUNT,
        },
        removeOnFail: {
          age: FAILED_JOB_RETENTION_MS / ONE_SECOND_MS,
        },
      },
    });

    this.scheduledDeploymentQueue = new Queue(SCHEDULED_DEPLOYMENT_QUEUE_NAME, {
      connection: this.connectionOptions,
      defaultJobOptions: {
        attempts: 1, // Scheduled triggers should not retry automatically
        removeOnComplete: {
          age: SCHEDULED_JOB_RETENTION_MS / ONE_SECOND_MS,
          count: SCHEDULED_JOB_MAX_COUNT,
        },
        removeOnFail: {
          age: SCHEDULED_FAILED_JOB_RETENTION_MS / ONE_SECOND_MS,
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
    partnerClientId: string,
    options?: {
      solutionName?: string;
      waveNumber?: number;
      waveName?: string;
      config?: Config;
    }
  ): Promise<void> {
    const jobs = tenants.map((tenant) => ({
      name: "tenant-deployment",
      data: {
        deploymentId,
        solutionPath,
        solutionName: options?.solutionName,
        tenant,
        partnerTenantId,
        partnerClientId,
        waveNumber: options?.waveNumber,
        waveName: options?.waveName,
        config: options?.config,
      } as TenantDeploymentJobData,
      opts: {
        jobId: `${deploymentId}-${tenant.tenantId}`,
      },
    }));

    await this.tenantDeploymentQueue.addBulk(jobs);
  }

  /**
   * Add deployments for a wave-based execution plan
   */
  async addWaveDeployments(
    deploymentId: string,
    solutionPath: string,
    solutionName: string,
    waves: Array<{
      name: string;
      tenants: TenantConfig[];
      order: number;
      delayMs?: number;
    }>,
    partnerTenantId: string,
    partnerClientId: string,
    config?: Config
  ): Promise<void> {
    // Add jobs for each wave with appropriate delays
    let accumulatedDelay = 0;

    for (const wave of waves) {
      const jobs = wave.tenants.map((tenant) => ({
        name: "tenant-deployment",
        data: {
          deploymentId,
          solutionPath,
          solutionName,
          tenant,
          partnerTenantId,
          partnerClientId,
          waveNumber: wave.order,
          waveName: wave.name,
          config,
        } as TenantDeploymentJobData,
        opts: {
          jobId: `${deploymentId}-${tenant.tenantId}`,
          delay: accumulatedDelay,
        },
      }));

      await this.tenantDeploymentQueue.addBulk(jobs);

      // Add wave delay if specified
      if (wave.delayMs) {
        accumulatedDelay += wave.delayMs;
      }
    }
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

    const deploymentJobs = jobs.filter((job) => job.data.deploymentId === deploymentId);

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
        } else if (state === "delayed") {
          status = "scheduled";
        }

        return {
          tenantId: job.data.tenant.tenantId,
          tenantName: job.data.tenant.name,
          status,
          startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : undefined,
          completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : undefined,
          error: state === "failed" ? job.failedReason : job.returnvalue?.error,
          solutionImportJobId: job.returnvalue?.importJobId,
          attemptNumber: job.attemptsMade + 1,
          durationMs: job.returnvalue?.durationMs,
          waveNumber: job.data.waveNumber,
          waveName: job.data.waveName,
        };
      })
    );

    const completedCount = tenantResults.filter((r) => r.status === "completed").length;
    const failedCount = tenantResults.filter((r) => r.status === "failed").length;

    let overallStatus: DeploymentStatus = "pending";
    if (completedCount + failedCount === tenantResults.length) {
      overallStatus = failedCount > 0 ? "failed" : "completed";
    } else if (tenantResults.some((r) => r.status === "in_progress")) {
      overallStatus = "in_progress";
    } else if (tenantResults.some((r) => r.status === "scheduled")) {
      overallStatus = "scheduled";
    }

    // Get the first job to extract common metadata
    const firstJob = deploymentJobs[0];

    return {
      id: deploymentId,
      solutionPath: firstJob.data.solutionPath,
      solutionName: firstJob.data.solutionName || firstJob.data.solutionPath.split("/").pop() || "",
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
   * Cancel a deployment (remove pending jobs)
   */
  async cancelDeployment(deploymentId: string): Promise<number> {
    const jobs = await this.tenantDeploymentQueue.getJobs(["waiting", "delayed"]);

    const deploymentJobs = jobs.filter((job) => job.data.deploymentId === deploymentId);

    let cancelledCount = 0;
    for (const job of deploymentJobs) {
      await job.remove();
      cancelledCount++;
    }

    return cancelledCount;
  }

  /**
   * Retry failed jobs for a deployment
   */
  async retryFailedJobs(deploymentId: string): Promise<number> {
    const jobs = await this.tenantDeploymentQueue.getJobs(["failed"]);

    const failedJobs = jobs.filter((job) => job.data.deploymentId === deploymentId);

    let retriedCount = 0;
    for (const job of failedJobs) {
      await job.retry();
      retriedCount++;
    }

    return retriedCount;
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
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.tenantDeploymentQueue.getWaitingCount(),
      this.tenantDeploymentQueue.getActiveCount(),
      this.tenantDeploymentQueue.getCompletedCount(),
      this.tenantDeploymentQueue.getFailedCount(),
      this.tenantDeploymentQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Register a scheduled deployment using BullMQ's repeatable jobs
   * This uses cron patterns to automatically trigger deployments
   */
  async registerScheduledDeployment(
    scheduleId: string,
    scheduleName: string,
    schedule: Schedule,
    solutionPath: string,
    solutionName: string,
    config: Config,
    options?: {
      tenantIds?: string[];
      tags?: string[];
    }
  ): Promise<void> {
    if (!schedule.cron) {
      throw new Error(`Schedule ${scheduleId} has no cron expression`);
    }

    // Validate the cron expression
    const validation = this.schedulerService.validateCron(schedule.cron);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression for schedule ${scheduleId}: ${validation.error}`);
    }

    const jobData: ScheduledDeploymentJobData = {
      scheduleId,
      scheduleName,
      solutionPath,
      solutionName,
      tenantIds: options?.tenantIds || [],
      tags: options?.tags,
      config,
    };

    // Remove any existing repeatable job with this schedule ID
    await this.removeScheduledDeployment(scheduleId);

    // Add the repeatable job with BullMQ's built-in cron support
    await this.scheduledDeploymentQueue.add("scheduled-deployment", jobData, {
      repeat: {
        pattern: schedule.cron,
        tz: schedule.timezone || "UTC",
      },
      jobId: scheduleId,
    });

    logger.info("Registered scheduled deployment", {
      scheduleName,
      scheduleId,
      cron: schedule.cron,
      description: this.schedulerService.describeCron(schedule.cron),
      timezone: schedule.timezone || "UTC",
    });
  }

  /**
   * Register multiple scheduled deployments from config
   */
  async registerScheduledDeploymentsFromConfig(
    config: Config,
    solutionPath: string,
    solutionName: string
  ): Promise<{ registered: number; errors: string[] }> {
    const errors: string[] = [];
    let registered = 0;

    // Check for global schedule
    if (config.settings?.schedule?.cron) {
      try {
        await this.registerScheduledDeployment(
          "global-schedule",
          "Global Scheduled Deployment",
          config.settings.schedule,
          solutionPath,
          solutionName,
          config,
          { tenantIds: config.tenants.filter((t) => t.enabled !== false).map((t) => t.tenantId) }
        );
        registered++;
      } catch (error) {
        errors.push(`Global schedule: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check for tenant-specific schedules
    for (const tenant of config.tenants) {
      if (tenant.schedule?.cron && tenant.enabled !== false) {
        try {
          await this.registerScheduledDeployment(
            `tenant-${tenant.tenantId}`,
            `Scheduled Deployment for ${tenant.name}`,
            tenant.schedule,
            solutionPath,
            solutionName,
            config,
            { tenantIds: [tenant.tenantId] }
          );
          registered++;
        } catch (error) {
          errors.push(
            `Tenant ${tenant.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return { registered, errors };
  }

  /**
   * Remove a scheduled deployment
   */
  async removeScheduledDeployment(scheduleId: string): Promise<boolean> {
    const repeatableJobs = await this.scheduledDeploymentQueue.getRepeatableJobs();
    const job = repeatableJobs.find((j) => j.id === scheduleId || j.key.includes(scheduleId));

    if (job) {
      await this.scheduledDeploymentQueue.removeRepeatableByKey(job.key);
      logger.info("Removed scheduled deployment", { scheduleId });
      return true;
    }

    return false;
  }

  /**
   * Remove all scheduled deployments
   */
  async removeAllScheduledDeployments(): Promise<number> {
    const repeatableJobs = await this.scheduledDeploymentQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      await this.scheduledDeploymentQueue.removeRepeatableByKey(job.key);
    }

    logger.info("Removed all scheduled deployments", { count: repeatableJobs.length });
    return repeatableJobs.length;
  }

  /**
   * List all registered scheduled deployments
   */
  async listScheduledDeployments(): Promise<
    Array<{
      id: string;
      name: string;
      cron: string;
      timezone: string;
      nextRun: Date | null;
    }>
  > {
    const repeatableJobs = await this.scheduledDeploymentQueue.getRepeatableJobs();

    return repeatableJobs.map((job) => ({
      id: job.id || job.key,
      name: job.name,
      cron: job.pattern || "",
      timezone: job.tz || "UTC",
      nextRun: job.next ? new Date(job.next) : null,
    }));
  }

  /**
   * Get the scheduled deployment queue for creating workers
   */
  getScheduledDeploymentQueue(): Queue<ScheduledDeploymentJobData, ScheduledDeploymentJobResult> {
    return this.scheduledDeploymentQueue;
  }

  /**
   * Get active worker information for health checks
   * Returns information about workers processing tenant deployments
   */
  async getWorkerInfo(): Promise<{
    activeWorkers: number;
    activeJobs: number;
    waitingJobs: number;
  }> {
    // Get workers info from the tenant deployment queue (the main worker queue)
    const workers = await this.tenantDeploymentQueue.getWorkers();
    const activeWorkers = workers.length;

    // Get job counts
    const counts = await this.tenantDeploymentQueue.getJobCounts("active", "waiting");

    return {
      activeWorkers,
      activeJobs: counts.active || 0,
      waitingJobs: counts.waiting || 0,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.deploymentQueue.close();
    await this.tenantDeploymentQueue.close();
    await this.scheduledDeploymentQueue.close();
    await this.queueEvents.close();
  }
}
