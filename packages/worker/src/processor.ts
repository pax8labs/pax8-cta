import { Worker, Job, RedisOptions } from "bullmq";
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
} from "@agentcrate/core";
import {
  TENANT_DEPLOYMENT_QUEUE_NAME,
  TenantDeploymentJobData,
  TenantDeploymentJobResult,
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
    redisUrl = "redis://localhost:6379",
    concurrency = 5,
    rateLimitMax = 10,
    rateLimitDuration = 60000,
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
 * Process a single tenant deployment with v2.0 features
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
      pollIntervalMs: 5000,
      timeoutMs: 300000,
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
 * Cleanup function to be called on shutdown
 */
export async function cleanupWorker(): Promise<void> {
  logger.info('Cleaning up worker resources');
  rollbackService = null;
  healthCheckService = null;
  webhookService = null;
  currentConfig = null;
}
