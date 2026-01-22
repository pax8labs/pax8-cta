export * from "./queue.js";
export * from "./processor.js";

import { createTenantDeploymentWorker, createScheduledDeploymentWorker } from "./processor.js";
import { DeploymentQueueManager } from "./queue.js";
import { workerLogger } from "@agentsync/core";

const logger = workerLogger;

// Note: Auto-start is COMPLETELY DISABLED to prevent workers from starting in CLI binary
// To start workers, use a separate worker process or deployment
// Example: START_WORKERS=true bun run packages/worker/src/index.ts

// DISABLED: Auto-start removed to fix CLI binary including worker startup
// When run directly AND workers are explicitly enabled, start the workers
if (false && import.meta.url === `file://${process.argv[1]}` && process.env.START_WORKERS === "true") {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);
  const enableScheduler = process.env.ENABLE_SCHEDULER !== "false"; // Enabled by default

  logger.info("Starting deployment workers", {
    redisUrl,
    concurrency,
    schedulerEnabled: enableScheduler,
  });

  // Create shared queue manager
  const queueManager = new DeploymentQueueManager(redisUrl);

  // Start the tenant deployment worker
  const tenantWorker = createTenantDeploymentWorker({
    redisUrl,
    concurrency,
  });

  // Start the scheduled deployment worker if enabled
  let scheduledWorker: ReturnType<typeof createScheduledDeploymentWorker> | null = null;
  if (enableScheduler) {
    scheduledWorker = createScheduledDeploymentWorker({
      redisUrl,
      queueManager,
    });
    logger.info("Scheduled deployment worker started");
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down workers");
    await tenantWorker.close();
    if (scheduledWorker) {
      await scheduledWorker.close();
    }
    await queueManager.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Workers started and listening for jobs");
}
