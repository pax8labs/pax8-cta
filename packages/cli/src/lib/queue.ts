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

/**
 * Optional queue integration for the CLI.
 *
 * The @agentsync/worker package (and its Redis dependency) is not required for
 * the CLI to function. Queue-based features (queued deploy, status tracking,
 * deployment management) are only available when the worker package is
 * installed. Without it, the CLI falls back to direct (synchronous) execution.
 */

import type { DeploymentJob, TenantConfig } from "@agentsync/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkerModule = any;

/**
 * The module specifier is assigned to a variable so that TypeScript does not
 * attempt to resolve it at compile time. This lets the CLI build and run
 * without @agentsync/worker being present in node_modules.
 */
const WORKER_MODULE = "@agentsync/worker";

export interface QueueManager {
  addTenantDeploymentsBulk(
    deploymentId: string,
    solutionPath: string,
    tenants: TenantConfig[],
    partnerTenantId: string,
    partnerClientId: string,
    options?: Record<string, unknown>
  ): Promise<void>;
  getDeploymentStatus(deploymentId: string): Promise<DeploymentJob | null>;
  cancelDeployment(deploymentId: string): Promise<number>;
  retryFailedJobs(deploymentId: string): Promise<number>;
  close(): Promise<void>;
}

const WORKER_UNAVAILABLE_MESSAGE =
  "Queue-based features require the @agentsync/worker package and a Redis instance.\n" +
  "For standalone CLI usage, use --direct flag for deployments (e.g. agentsync deploy --direct --all -s ./agent.zip).";

async function importWorker(): Promise<WorkerModule | null> {
  try {
    return await import(WORKER_MODULE);
  } catch {
    return null;
  }
}

/**
 * Check whether the @agentsync/worker package is available (importable).
 * Does not instantiate any connections.
 */
export async function isWorkerAvailable(): Promise<boolean> {
  return (await importWorker()) !== null;
}

/**
 * Attempt to dynamically import DeploymentQueueManager from @agentsync/worker.
 * Returns null if the package is not installed.
 */
export async function tryLoadQueueManager(redisUrl: string): Promise<QueueManager | null> {
  const mod = await importWorker();
  if (!mod) return null;
  try {
    return new mod.DeploymentQueueManager(redisUrl) as QueueManager;
  } catch {
    return null;
  }
}

/**
 * Load the queue manager or exit with a helpful message.
 * Use this in commands that absolutely require the worker package.
 */
export async function requireQueueManager(redisUrl: string): Promise<QueueManager> {
  const qm = await tryLoadQueueManager(redisUrl);
  if (!qm) {
    console.error(WORKER_UNAVAILABLE_MESSAGE);
    process.exit(1);
  }
  return qm;
}
