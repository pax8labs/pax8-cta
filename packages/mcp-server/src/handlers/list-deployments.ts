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
import { validate, ListDeploymentsSchema, ListDeploymentsParams } from "../lib/validation.js";
import { logger } from "../lib/logger.js";

export interface DeploymentsListResponse {
  deployments: Array<{
    id: string;
    solutionName: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  }>;
  total?: number;
}

/**
 * List deployments with optional filtering
 */
export async function handleListDeployments(args: unknown) {
  logger.info("Handling list_deployments request", { args });

  // Validate input
  const params = validate(ListDeploymentsSchema, args || {});

  // Build query params
  const queryParams = new URLSearchParams();
  if (params.status) {
    queryParams.append("status", params.status);
  }
  if (params.limit) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params.offset) {
    queryParams.append("offset", params.offset.toString());
  }

  // Make API request
  const data = await get<DeploymentsListResponse>(`/api/deployments?${queryParams}`);

  logger.info("List deployments successful", {
    count: data.deployments?.length || 0,
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
