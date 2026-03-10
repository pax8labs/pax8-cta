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
 * Shared deployment data loading for demo mode
 * Ensures consistency between /api/stats and /api/deployments
 */

import { DeploymentJob, generateMockDeploymentHistory } from "@agentsync/core";
import { demoDeployments } from "./demo-store";

/**
 * Get all deployments for demo mode with consistent mock data generation
 *
 * This function ensures that both /api/stats and /api/deployments see the exact
 * same deployment data, preventing count mismatches.
 *
 * @param limit - Maximum number of deployments to return
 * @returns Array of deployments sorted by createdAt (newest first)
 */
export function getDemoDeployments(limit: number = 100): DeploymentJob[] {
  // Get live deployments from the persisted store
  const liveDeployments = Array.from(demoDeployments.values());
  const liveIds = new Set(liveDeployments.map((d) => d.id));

  // IMPORTANT: Always generate the FULL mock history first, then filter
  // This ensures consistent data even if demoDeployments.size changes between API calls
  // We generate a fixed set of historical deployments (demo-hist-000 through demo-hist-299)
  const FULL_HISTORY_SIZE = 300;
  const fullMockHistory = generateMockDeploymentHistory(FULL_HISTORY_SIZE).filter(
    (h) => !liveIds.has(h.id)
  ); // Remove any that conflict with live deployments

  // Combine live + mock, sort by date, and take the most recent `limit` deployments
  const allDeployments = [...liveDeployments, ...fullMockHistory]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return allDeployments;
}
