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
 * Demo mode deployment worker
 * Simulates deployment processing by auto-completing deployments after a delay
 */

import { demoDeploymentsV2, demoBatches, demoDeployedAgents } from "./demo-store";
import { Deployment, DeploymentBatch } from "@agentsync/core";

const DEPLOYMENT_SIMULATION_MS = 5000; // 5 seconds per deployment
const activeTimers = new Map<string, NodeJS.Timeout>();

/**
 * Start simulating a deployment batch
 * Each deployment in the batch will complete after DEPLOYMENT_SIMULATION_MS
 */
export function startDemoDeployment(batchId: string) {
  // Get all deployments in this batch
  const deployments = demoDeploymentsV2.getByBatchId(batchId);
  const batch = demoBatches.get(batchId);

  if (!batch || deployments.length === 0) {
    console.warn(`[Demo Worker] No batch or deployments found for ${batchId}`);
    return;
  }

  console.log(
    `[Demo Worker] Starting simulation for batch ${batchId} with ${deployments.length} deployments`
  );

  // Update batch to in_progress
  batch.status = "in_progress";
  batch.startedAt = new Date().toISOString();
  batch.updatedAt = new Date().toISOString();
  demoBatches.set(batchId, batch);

  // Process each deployment sequentially
  deployments.forEach((deployment, index) => {
    const delay = DEPLOYMENT_SIMULATION_MS * (index + 1);

    const timer = setTimeout(() => {
      completeDeployment(deployment, batch);
      activeTimers.delete(`${batchId}-${index}`);
    }, delay);

    activeTimers.set(`${batchId}-${index}`, timer);
  });
}

/**
 * Complete a single deployment
 */
function completeDeployment(deployment: Deployment, batch: DeploymentBatch) {
  const now = new Date().toISOString();

  // Update deployment status
  deployment.status = "completed";
  deployment.completedAt = now;
  deployment.updatedAt = now;
  demoDeploymentsV2.set(deployment.id, deployment);

  // Add to tenant's deployed agents
  const existingAgents = demoDeployedAgents.get(deployment.tenantId) || [];
  const agentExists = existingAgents.some((a) => a.solutionName === deployment.solutionName);

  if (!agentExists) {
    existingAgents.push({
      solutionName: deployment.solutionName,
      version: deployment.solutionVersion || "1.0.0.0",
      deployedAt: now,
      deploymentId: deployment.id,
      status: "active",
    });
    demoDeployedAgents.set(deployment.tenantId, existingAgents);
  }

  // Update batch progress
  const batchDeployments = demoDeploymentsV2.getByBatchId(batch.id);
  const completedCount = batchDeployments.filter((d) => d.status === "completed").length;
  const failedCount = batchDeployments.filter((d) => d.status === "failed").length;

  batch.completedDeployments = completedCount;
  batch.failedDeployments = failedCount;
  batch.updatedAt = now;

  // Check if all deployments are done
  if (completedCount + failedCount === batch.totalDeployments) {
    batch.status = failedCount > 0 ? "failed" : "completed";
    batch.completedAt = now;
  }

  demoBatches.set(batch.id, batch);

  console.log(
    `[Demo Worker] Completed deployment ${deployment.id} for ${deployment.tenantName} (${completedCount}/${batch.totalDeployments})`
  );
}

/**
 * Cancel all active timers (for cleanup)
 */
export function stopAllDemoDeployments() {
  activeTimers.forEach((timer) => clearTimeout(timer));
  activeTimers.clear();
  console.log("[Demo Worker] Stopped all active deployments");
}

/**
 * Cancel a specific batch's deployments
 */
export function stopDemoDeployment(batchId: string) {
  let count = 0;
  activeTimers.forEach((timer, key) => {
    if (key.startsWith(batchId)) {
      clearTimeout(timer);
      activeTimers.delete(key);
      count++;
    }
  });
  console.log(`[Demo Worker] Stopped ${count} deployments for batch ${batchId}`);
}
