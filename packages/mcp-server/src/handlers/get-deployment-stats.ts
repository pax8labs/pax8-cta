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
import { validate, NoParamsSchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";

export interface DeploymentStatsResponse {
  totalDeployments: number;
  activeDeployments: number;
  completedToday: number;
  totalTenants: number;
  successRate?: number;
}

/**
 * Get overall deployment statistics
 */
export async function handleGetDeploymentStats(args: unknown) {
  logger.info("Handling get_deployment_stats request");

  // Validate input (no params expected)
  validate(NoParamsSchema, args || {});

  // Make API request
  const data = await get<DeploymentStatsResponse>("/api/stats");

  logger.info("Get deployment stats successful", {
    totalDeployments: data.totalDeployments,
    activeDeployments: data.activeDeployments,
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
