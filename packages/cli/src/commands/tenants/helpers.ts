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

import { TenantConfig, generateMockDeploymentHistory, DEMO_SOLUTIONS } from "@agentsync/core";

export function findTenant(tenants: TenantConfig[], query: string): TenantConfig | undefined {
  const q = query.toLowerCase();
  return tenants.find(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.tenantId.toLowerCase().includes(q) ||
      t.environmentUrl.toLowerCase().includes(q)
  );
}

/**
 * Get deployed agents for a tenant from deployment history
 */
export function getDeployedAgentsForTenant(tenantId: string): Array<{
  name: string;
  version: string;
  deployedAt: string;
}> {
  const history = generateMockDeploymentHistory(50);

  // Find all completed deployments for this tenant
  const deployedAgents = new Map<string, { name: string; version: string; deployedAt: string }>();

  history
    .filter((d) => d.status === "completed")
    .forEach((deployment) => {
      const tenantResult = deployment.tenantResults?.find(
        (t) => t.tenantId === tenantId && t.status === "completed"
      );

      if (tenantResult) {
        // Keep the most recent deployment for each agent
        const existing = deployedAgents.get(deployment.solutionName);
        if (!existing || new Date(deployment.createdAt) > new Date(existing.deployedAt)) {
          deployedAgents.set(deployment.solutionName, {
            name: deployment.solutionName,
            version: deployment.solutionVersion || "unknown",
            deployedAt: deployment.createdAt,
          });
        }
      }
    });

  return Array.from(deployedAgents.values());
}

/**
 * Check if an agent version is current
 */
export function isAgentVersionCurrent(agentName: string, version: string): boolean {
  const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agentName)?.version;
  return version === latestVersion;
}
