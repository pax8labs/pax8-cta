/**
 * Copyright 2024 Pax8, Inc.
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
 * Client-safe exports from the config module.
 *
 * This file only exports types and constants that don't require Node.js APIs,
 * making them safe to import in client-side (browser) code.
 */

// Re-export types
export type {
  DeploymentStatus,
  TenantDeploymentResult,
  DeploymentTrigger,
  DeploymentJob,
  Deployment,
  DeploymentBatch,
  StatusCategory,
} from "./schema.js";

// Re-export status constants and utilities
export { DEPLOYMENT_STATUS_CATEGORIES, calculateDeploymentStatus } from "./schema.js";
