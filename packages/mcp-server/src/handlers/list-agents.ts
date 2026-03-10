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

export interface AgentsListResponse {
  agents: Array<{
    uniqueName: string;
    friendlyName: string;
    version: string;
    deployedTo?: string[];
  }>;
}

/**
 * List all available Copilot agents
 */
export async function handleListAgents(args: unknown) {
  logger.info("Handling list_agents request");

  // Validate input (no params expected)
  validate(NoParamsSchema, args || {});

  // Make API request
  const data = await get<AgentsListResponse>("/api/agents");

  logger.info("List agents successful", {
    count: data.agents?.length || 0,
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
