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

import { get } from "../lib/api-client.js";
import { validate, MonitorDeploymentSchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";
import { DeploymentStatusResponse } from "./get-deployment-status.js";

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Monitor a deployment until completion
 */
export async function handleMonitorDeployment(args: unknown) {
  logger.info("Handling monitor_deployment request", { args });

  // Validate input
  const params = validate(MonitorDeploymentSchema, args);

  const maxWaitMs = params.pollIntervalMs || 60000;
  const pollIntervalMs = 2000; // Poll every 2 seconds
  const startTime = Date.now();

  logger.info("Starting deployment monitoring", {
    deploymentId: params.deploymentId,
    maxWaitMs,
    pollIntervalMs,
  });

  let attempts = 0;

  while (true) {
    attempts++;

    // Get current status
    const data = await get<DeploymentStatusResponse>(`/api/deployments/${params.deploymentId}`);

    const status = data.status;

    logger.debug("Monitoring poll", {
      deploymentId: params.deploymentId,
      attempt: attempts,
      status,
    });

    // Check if deployment is in terminal state
    if (status === "completed" || status === "failed" || status === "cancelled") {
      logger.info("Deployment reached terminal state", {
        deploymentId: params.deploymentId,
        status,
        attempts,
        durationMs: Date.now() - startTime,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Check if we've exceeded max wait time
    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      logger.warn("Deployment monitoring timed out", {
        deploymentId: params.deploymentId,
        status,
        elapsedMs: elapsed,
        maxWaitMs,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ...data,
                message: `Deployment still in progress after ${Math.round(elapsed / 1000)}s. Check status later.`,
                timedOut: true,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Wait before next poll
    await sleep(pollIntervalMs);
  }
}
