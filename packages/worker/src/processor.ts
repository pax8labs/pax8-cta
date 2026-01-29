import { Worker, Job } from "bullmq";
import { randomUUID } from "node:crypto";
import {
  TokenManager,
  DataverseClient,
  SolutionOperations,
  getClientSecret,
  Config,
  getEffectiveConnectionMappings,
  getEffectiveEnvironmentVariables,
  getEffectiveRollbackSettings,
  RollbackService,
  HealthCheckService,
  WebhookService,
  ConnectionOperations,
  workerLogger,
  timedOperation,
  getAuditLog,
  SchedulerService,
  SOLUTION_IMPORT_POLL_INTERVAL_MS,
  SOLUTION_IMPORT_TIMEOUT_MS,
  parseRedisUrl,
  DEFAULT_REDIS_URL,
  DEFAULT_WORKER_CONCURRENCY,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_DURATION_MS,
} from "@agentsync/core";
import {
  TENANT_DEPLOYMENT_QUEUE_NAME,
  SCHEDULED_DEPLOYMENT_QUEUE_NAME,
  TenantDeploymentJobData,
  TenantDeploymentJobResult,
  ScheduledDeploymentJobData,
  ScheduledDeploymentJobResult,
  DeploymentQueueManager,
} from "./queue.js";

const logger = workerLogger;
const auditLog = getAuditLog();

export interface ProcessorOptions {
  redisUrl?: string;
  concurrency?: number;
  rateLimitMax?: number;
  rateLimitDuration?: number;
  config?: Config;
}

// Services shared across jobs
let rollbackService: RollbackService | null = null;
let healthCheckService: HealthCheckService | null = null;
let webhookService: WebhookService | null = null;
let currentConfig: Config | null = null;

function initializeServices(config: Config): void {
  if (currentConfig !== config) {
    currentConfig = config;

    // Initialize rollback service
    rollbackService = new RollbackService(
      process.env.SNAPSHOT_DIR || './snapshots'
    );

    // Initialize health check service
    healthCheckService = new HealthCheckService();

    // Initialize webhook service
    if (config.webhooks) {
      webhookService = new WebhookService(config.webhooks);
    }

    logger.info('Worker services initialized', {
      hasRollback: !!rollbackService,
      hasHealthCheck: !!healthCheckService,
      hasWebhooks: !!webhookService,
    });
  }
}

/**
 * Creates a worker that processes tenant deployment jobs
 */
export function createTenantDeploymentWorker(
  options: ProcessorOptions = {}
): Worker<TenantDeploymentJobData, TenantDeploymentJobResult> {
  const {
    redisUrl = DEFAULT_REDIS_URL,
    concurrency = DEFAULT_WORKER_CONCURRENCY,
    rateLimitMax = DEFAULT_RATE_LIMIT_MAX,
    rateLimitDuration = DEFAULT_RATE_LIMIT_DURATION_MS,
    config,
  } = options;

  if (config) {
    initializeServices(config);
  }

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

  worker.on("completed", (job) => {
    logger.info(`Deployment completed`, {
      jobId: job.id,
      tenant: job.data.tenant.name,
      success: job.returnvalue?.success,
    });
  });

  worker.on("failed", (job, error) => {
    logger.error(`Deployment failed`, error, {
      jobId: job?.id,
      tenant: job?.data.tenant.name,
    });
  });

  worker.on("error", (error) => {
    logger.error(`Worker error`, error);
  });

  return worker;
}

/**
 * Process a single tenant deployment with full v2.0 feature support
 *
 * This is the core deployment logic that handles the entire lifecycle of
 * deploying a Power Platform solution to a single tenant. It orchestrates:
 *
 * 1. **Pre-deployment Health Check** - Verifies the tenant environment is healthy
 *    before attempting deployment (if configured)
 *
 * 2. **Rollback Snapshot** - Creates a snapshot of the current solution state
 *    that can be used for rollback if deployment fails (if rollback is enabled)
 *
 * 3. **Solution Import** - Imports the solution ZIP file into the target
 *    Dataverse environment using async import with progress polling
 *
 * 4. **Connection References** - Configures connection references to point
 *    to the correct connections in the target tenant
 *
 * 5. **Environment Variables** - Sets environment variable values specific
 *    to the target tenant
 *
 * 6. **Post-deployment Health Check** - Verifies the deployment was successful
 *    and the solution is functioning correctly
 *
 * 7. **Auto-rollback** - If the deployment fails and auto-rollback is enabled,
 *    automatically restores the previous solution version
 *
 * @param job - BullMQ job containing tenant deployment data
 * @returns Result object with success status, timing, and any error details
 *
 * @example
 * ```ts
 * // This function is typically called by the BullMQ worker
 * const result = await processTenantDeployment(job);
 * if (result.success) {
 *   console.log(`Deployed to ${result.tenantName} in ${result.durationMs}ms`);
 * }
 * ```
 */
async function processTenantDeployment(
  job: Job<TenantDeploymentJobData>
): Promise<TenantDeploymentJobResult> {
  const { tenant, solutionPath, partnerClientId, deploymentId, config } = job.data;
  const startTime = Date.now();

  // Initialize services if config is provided
  if (config) {
    initializeServices(config);
  }

  logger.info(`Starting deployment`, {
    jobId: job.id,
    deploymentId,
    tenant: tenant.name,
    tenantId: tenant.tenantId,
  });

  // Send webhook notification
  if (webhookService) {
    await webhookService.notifyTenantStarted(
      deploymentId,
      job.data.solutionName || 'Unknown',
      tenant.tenantId,
      tenant.name,
      job.attemptsMade + 1
    );
  }

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

    await job.updateProgress(5);

    // Pre-deployment health check if configured
    if (healthCheckService && config) {
      const effectiveHealthCheck = {
        enabled: tenant.healthCheck?.enabled ?? config.settings?.healthCheck?.enabled ?? true,
        timeout: tenant.healthCheck?.timeout ?? config.settings?.healthCheck?.timeout ?? '30s',
        retries: tenant.healthCheck?.retries ?? config.settings?.healthCheck?.retries ?? 2,
      };

      if (effectiveHealthCheck.enabled) {
        logger.info(`Running pre-deployment health check`, { tenant: tenant.name });

        const healthResult = await timedOperation(
          logger,
          'Pre-deployment health check',
          () => healthCheckService!.checkTenantHealth(tenant, dataverseClient),
          { tenant: tenant.name }
        );

        if (!healthResult.healthy) {
          const errorMsg = `Pre-deployment health check failed: ${healthResult.checks.filter((c: { passed: boolean; name: string }) => !c.passed).map((c: { name: string }) => c.name).join(', ')}`;
          logger.warn(errorMsg, { tenant: tenant.name, checks: healthResult.checks });

          return {
            tenantId: tenant.tenantId,
            tenantName: tenant.name,
            success: false,
            error: errorMsg,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }

    await job.updateProgress(10);

    // Create rollback snapshot if enabled
    if (rollbackService && config) {
      const rollbackSettings = getEffectiveRollbackSettings(config, tenant);

      if (rollbackSettings.enabled) {
        try {
          logger.info(`Creating rollback snapshot`, { tenant: tenant.name });

          await timedOperation(
            logger,
            'Create rollback snapshot',
            () => rollbackService!.createSnapshot(
              deploymentId,
              tenant.tenantId,
              tenant.name,
              job.data.solutionName || 'Unknown',
              dataverseClient,
              rollbackSettings
            ),
            { tenant: tenant.name }
          );
        } catch (snapshotError) {
          logger.warn(`Failed to create rollback snapshot`, {
            tenant: tenant.name,
            error: (snapshotError as Error).message
          });
          // Continue with deployment even if snapshot fails
        }
      }
    }

    await job.updateProgress(20);

    // Import the solution
    logger.info(`Starting solution import`, { tenant: tenant.name });

    const importJobId = await timedOperation(
      logger,
      'Start solution import',
      () => solutionOps.importSolutionAsync(solutionPath, {
        overwriteUnmanagedCustomizations: true,
        publishWorkflows: true,
      }),
      { tenant: tenant.name }
    );

    await job.updateProgress(30);

    // Wait for import to complete
    const result = await solutionOps.waitForImport(importJobId, {
      pollIntervalMs: SOLUTION_IMPORT_POLL_INTERVAL_MS,
      timeoutMs: SOLUTION_IMPORT_TIMEOUT_MS,
      onProgress: async (progress) => {
        const jobProgress = 30 + Math.floor(progress * 0.4);
        await job.updateProgress(jobProgress);
      },
    });

    if (!result.success) {
      const errorMsg = result.error || 'Solution import failed';
      logger.error(`Import failed`, new Error(errorMsg), { tenant: tenant.name });

      // Auto-rollback if configured
      if (rollbackService && config) {
        const rollbackSettings = getEffectiveRollbackSettings(config, tenant);

        if (rollbackSettings.autoRollbackOnFailure) {
          logger.info(`Initiating auto-rollback`, { tenant: tenant.name });

          try {
            const latestSnapshot = await rollbackService.getLatestSnapshot(
              tenant.tenantId,
              job.data.solutionName || 'Unknown'
            );

            if (latestSnapshot) {
              const rollbackResult = await rollbackService.rollback(
                latestSnapshot.id,
                dataverseClient,
                { timeout: rollbackSettings.rollbackTimeout }
              );

              if (webhookService) {
                await webhookService.notifyRollbackCompleted(
                  deploymentId,
                  job.data.solutionName || 'Unknown',
                  tenant.tenantId,
                  tenant.name,
                  rollbackResult.success,
                  rollbackResult.restoredVersion,
                  rollbackResult.error
                );
              }
            } else {
              logger.warn(`No snapshot available for rollback`, { tenant: tenant.name });
            }
          } catch (rollbackError) {
            logger.error(`Auto-rollback failed`, rollbackError as Error, { tenant: tenant.name });
          }
        }
      }

      if (webhookService) {
        await webhookService.notifyTenantFailed(
          deploymentId,
          job.data.solutionName || 'Unknown',
          tenant.tenantId,
          tenant.name,
          errorMsg
        );
      }

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        success: false,
        error: errorMsg,
        importJobId,
        durationMs: Date.now() - startTime,
      };
    }

    await job.updateProgress(70);

    // Configure connection references if specified
    if (config) {
      const connectionMappings = getEffectiveConnectionMappings(config, tenant);

      if (connectionMappings.length > 0) {
        logger.info(`Configuring connection references`, {
          tenant: tenant.name,
          count: connectionMappings.length,
        });

        await timedOperation(
          logger,
          'Configure connection references',
          () => connectionOps.applyConnectionMappings(connectionMappings),
          { tenant: tenant.name }
        );
      }
    }

    await job.updateProgress(80);

    // Set environment variables if specified
    if (config) {
      const envVars = getEffectiveEnvironmentVariables(config, tenant);

      if (envVars.length > 0) {
        logger.info(`Setting environment variables`, {
          tenant: tenant.name,
          count: envVars.length,
        });

        await timedOperation(
          logger,
          'Set environment variables',
          () => connectionOps.applyEnvironmentVariables(envVars),
          { tenant: tenant.name }
        );
      }
    }

    await job.updateProgress(90);

    // Post-deployment health check
    if (healthCheckService && config) {
      const effectiveHealthCheck = {
        enabled: tenant.healthCheck?.enabled ?? config.settings?.healthCheck?.enabled ?? true,
      };

      if (effectiveHealthCheck.enabled) {
        logger.info(`Running post-deployment health check`, { tenant: tenant.name });

        const healthResult = await healthCheckService.checkTenantHealth(tenant, dataverseClient);

        if (!healthResult.healthy) {
          logger.warn(`Post-deployment health check failed`, {
            tenant: tenant.name,
            checks: healthResult.checks,
          });
          // Don't fail the deployment, just log the warning
        }
      }
    }

    await job.updateProgress(100);

    const durationMs = Date.now() - startTime;

    logger.info(`Deployment successful`, {
      tenant: tenant.name,
      durationMs,
      importJobId,
    });

    // Log to audit
    await auditLog.log('solution.imported', {
      userId: 'worker',
      resourceType: 'tenant',
      resourceId: tenant.tenantId,
      resourceName: tenant.name,
      success: true,
      details: {
        deploymentId,
        solutionPath,
        importJobId,
        durationMs,
      },
    });

    // Send success webhook
    if (webhookService) {
      await webhookService.notifyTenantCompleted(
        deploymentId,
        job.data.solutionName || 'Unknown',
        tenant.tenantId,
        tenant.name
      );
    }

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      success: true,
      importJobId,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error(`Deployment error`, error as Error, {
      tenant: tenant.name,
      durationMs,
    });

    // Log to audit
    await auditLog.log('solution.imported', {
      userId: 'worker',
      resourceType: 'tenant',
      resourceId: tenant.tenantId,
      resourceName: tenant.name,
      success: false,
      errorMessage,
      details: {
        deploymentId,
        solutionPath,
        durationMs,
      },
    });

    // Send failure webhook
    if (webhookService) {
      await webhookService.notifyTenantFailed(
        deploymentId,
        job.data.solutionName || 'Unknown',
        tenant.tenantId,
        tenant.name,
        errorMessage
      );
    }

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

/**
 * Creates a worker that processes scheduled deployment triggers
 * When a schedule fires, this worker queues the actual tenant deployment jobs
 */
export function createScheduledDeploymentWorker(
  options: ProcessorOptions & { queueManager?: DeploymentQueueManager } = {}
): Worker<ScheduledDeploymentJobData, ScheduledDeploymentJobResult> {
  const {
    redisUrl = DEFAULT_REDIS_URL,
    queueManager,
  } = options;

  const connectionOptions = parseRedisUrl(redisUrl);
  const schedulerService = new SchedulerService();

  // Create or use provided queue manager for adding tenant jobs
  const deploymentQueueManager = queueManager || new DeploymentQueueManager(redisUrl);

  const worker = new Worker<ScheduledDeploymentJobData, ScheduledDeploymentJobResult>(
    SCHEDULED_DEPLOYMENT_QUEUE_NAME,
    async (job: Job<ScheduledDeploymentJobData>) => {
      const { scheduleId, scheduleName, solutionPath, solutionName, tenantIds, tags, config } = job.data;
      const triggeredAt = new Date().toISOString();

      logger.info(`Scheduled deployment triggered`, {
        scheduleId,
        scheduleName,
        solutionName,
      });

      // Check maintenance window if configured
      const schedule = config.settings?.schedule;
      let withinMaintenanceWindow = true;

      if (schedule?.maintenanceWindow) {
        withinMaintenanceWindow = schedulerService.isWithinMaintenanceWindow(schedule);

        if (!withinMaintenanceWindow) {
          logger.warn(`Scheduled deployment triggered outside maintenance window, skipping`, {
            scheduleId,
            scheduleName,
          });

          return {
            scheduleId,
            deploymentId: "",
            tenantCount: 0,
            triggeredAt,
            withinMaintenanceWindow: false,
          };
        }
      }

      // Determine which tenants to deploy to
      let tenantsToDeployTo = config.tenants.filter(t => t.enabled !== false);

      if (tenantIds && tenantIds.length > 0) {
        // Deploy to specific tenants
        tenantsToDeployTo = tenantsToDeployTo.filter(t => tenantIds.includes(t.tenantId));
      } else if (tags && tags.length > 0) {
        // Deploy to tenants matching tags
        tenantsToDeployTo = tenantsToDeployTo.filter(t =>
          t.tags?.some(tag => tags.includes(tag))
        );
      }

      if (tenantsToDeployTo.length === 0) {
        logger.warn(`No tenants matched for scheduled deployment`, {
          scheduleId,
          scheduleName,
          tenantIds,
          tags,
        });

        return {
          scheduleId,
          deploymentId: "",
          tenantCount: 0,
          triggeredAt,
          withinMaintenanceWindow: true,
        };
      }

      // Generate a deployment ID for this scheduled run
      const deploymentId = `sched-${scheduleId}-${randomUUID().slice(0, 8)}`;

      logger.info(`Queuing deployment jobs for scheduled deployment`, {
        scheduleId,
        deploymentId,
        tenantCount: tenantsToDeployTo.length,
      });

      // Queue the tenant deployment jobs
      await deploymentQueueManager.addTenantDeploymentsBulk(
        deploymentId,
        solutionPath,
        tenantsToDeployTo,
        config.partner.tenantId,
        config.partner.clientId,
        {
          solutionName,
          config,
        }
      );

      // Log to audit
      await auditLog.log('scheduled.deployment.triggered', {
        userId: 'scheduler',
        resourceType: 'schedule',
        resourceId: scheduleId,
        resourceName: scheduleName,
        success: true,
        details: {
          deploymentId,
          solutionPath,
          solutionName,
          tenantCount: tenantsToDeployTo.length,
          tenantIds: tenantsToDeployTo.map(t => t.tenantId),
        },
      });

      return {
        scheduleId,
        deploymentId,
        tenantCount: tenantsToDeployTo.length,
        triggeredAt,
        withinMaintenanceWindow: true,
      };
    },
    {
      connection: connectionOptions,
      concurrency: 1, // Only process one schedule trigger at a time
    }
  );

  worker.on("completed", (job) => {
    logger.info(`Scheduled deployment trigger completed`, {
      scheduleId: job.data.scheduleId,
      deploymentId: job.returnvalue?.deploymentId,
      tenantCount: job.returnvalue?.tenantCount,
    });
  });

  worker.on("failed", (job, error) => {
    logger.error(`Scheduled deployment trigger failed`, error, {
      scheduleId: job?.data.scheduleId,
    });
  });

  worker.on("error", (error) => {
    logger.error(`Scheduled deployment worker error`, error);
  });

  return worker;
}

/**
 * Cleanup function to be called on shutdown
 */
export async function cleanupWorker(): Promise<void> {
  logger.info('Cleaning up worker resources');
  rollbackService = null;
  healthCheckService = null;
  webhookService = null;
  currentConfig = null;
}
