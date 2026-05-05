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

import { DEMO_SOLUTIONS, DEMO_TENANTS, generateMockDeploymentHistory } from "@agentsync/core";

// Solution type from DEMO_SOLUTIONS
export type Solution = (typeof DEMO_SOLUTIONS)[number];

export function findSolution(solutions: Solution[], query: string): Solution | undefined {
  const q = query.toLowerCase();
  return solutions.find(
    (s) => s.uniqueName.toLowerCase().includes(q) || s.friendlyName.toLowerCase().includes(q)
  );
}

/**
 * Get tenant deployment status for an agent
 */
export function getTenantDeploymentStatus(agentName: string): Array<{
  tenantName: string;
  tenantId: string;
  version: string | null;
  deployedAt: string | null;
  status: "current" | "outdated" | "not_deployed";
}> {
  const history = generateMockDeploymentHistory(50);
  const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agentName)?.version;

  // Map of tenantId -> latest deployment info
  const tenantDeployments = new Map<string, { version: string; deployedAt: string }>();

  history
    .filter((d) => d.status === "completed" && d.solutionName === agentName)
    .forEach((deployment) => {
      deployment.tenantResults?.forEach((result) => {
        if (result.status === "completed") {
          const existing = tenantDeployments.get(result.tenantId);
          if (!existing || new Date(deployment.createdAt) > new Date(existing.deployedAt)) {
            tenantDeployments.set(result.tenantId, {
              version: deployment.solutionVersion || "unknown",
              deployedAt: deployment.createdAt,
            });
          }
        }
      });
    });

  // Build result for all tenants
  return DEMO_TENANTS.map((tenant) => {
    const deployment = tenantDeployments.get(tenant.tenantId);

    if (!deployment) {
      return {
        tenantName: tenant.name,
        tenantId: tenant.tenantId,
        version: null,
        deployedAt: null,
        status: "not_deployed" as const,
      };
    }

    const isCurrent = deployment.version === latestVersion;
    return {
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      version: deployment.version,
      deployedAt: deployment.deployedAt,
      status: isCurrent ? ("current" as const) : ("outdated" as const),
    };
  });
}
