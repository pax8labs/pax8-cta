export * from "./queue.js";
export * from "./processor.js";

import { createTenantDeploymentWorker } from "./processor.js";

// When run directly, start the worker
if (import.meta.url === `file://${process.argv[1]}`) {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "5", 10);

  console.log(`Starting deployment worker...`);
  console.log(`  Redis URL: ${redisUrl}`);
  console.log(`  Concurrency: ${concurrency}`);

  const worker = createTenantDeploymentWorker({
    redisUrl,
    concurrency,
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Worker started and listening for jobs.");
}
