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

import { post } from "../lib/api-client.js";
import { validate, RetryDeploymentSchema } from "../lib/validation.js";
import { logger } from "../lib/logger.js";

export interface RetryDeploymentResponse {
  deploymentId: string;
  status: string;
  message: string;
}

/**
 * Retry a failed deployment
 */
export async function handleRetryDeployment(args: unknown) {
  logger.info("Handling retry_deployment request", { args });

  // Validate input
  const params = validate(RetryDeploymentSchema, args);

  // Make API request
  const data = await post<RetryDeploymentResponse>(
    `/api/deployments/${params.deploymentId}/retry`,
    {}
  );

  logger.info("Retry deployment successful", {
    originalDeploymentId: params.deploymentId,
    newDeploymentId: data.deploymentId,
    status: data.status,
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
