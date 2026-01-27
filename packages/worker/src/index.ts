export * from "./queue.js";
export * from "./processor.js";

import { createTenantDeploymentWorker, createScheduledDeploymentWorker } from "./processor.js";
import { DeploymentQueueManager } from "./queue.js";

// When run directly, start the workers
if (import.meta.url === `file://${process.argv[1]}`) {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);
  const enableScheduler = process.env.ENABLE_SCHEDULER !== "false"; // Enabled by default

  console.log(`Starting deployment workers...`);
  console.log(`  Redis URL: ${redisUrl}`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Scheduler enabled: ${enableScheduler}`);

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
    console.log("Scheduled deployment worker started.");
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down workers...");
    await tenantWorker.close();
    if (scheduledWorker) {
      await scheduledWorker.close();
    }
    await queueManager.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Workers started and listening for jobs.");
}
