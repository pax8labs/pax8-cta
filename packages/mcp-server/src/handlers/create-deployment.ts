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

import { createDeployment, CreateDeploymentParams } from "@agentsync/core";
import { logger } from "../lib/logger.js";
import { ValidationError } from "../lib/errors.js";

/**
 * Create a new deployment using shared deployment tools
 */
export async function handleCreateDeployment(args: unknown) {
  logger.info("Handling create_deployment request", { args });

  // Manual validation since we need special handling
  const params = args as CreateDeploymentParams;

  if (!params.agentId || typeof params.agentId !== "string") {
    throw new ValidationError("agentId is required and must be a string");
  }

  if (!Array.isArray(params.tenantIds) || params.tenantIds.length === 0) {
    throw new ValidationError("tenantIds is required and must be a non-empty array");
  }

  // Use shared deployment tool
  const data = await createDeployment(params);

  logger.info("Deployment created", {
    deploymentId: data.deploymentId,
    tenantCount: data.tenantCount,
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
