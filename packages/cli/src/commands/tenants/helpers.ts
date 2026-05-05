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

import {
  TenantConfig,
  DEMO_SOLUTIONS,
  DEMO_TENANTS,
  type DemoTenantMetadata,
} from "@agentsync/core";

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
 * Get deployed agents for a tenant.
 *
 * Reads from `DEMO_TENANTS[].metadata.deployedSolutions` so the deployed-agent
 * versions match what `solutions drift` and `solutions show --tenants` display.
 */
export function getDeployedAgentsForTenant(tenantId: string): Array<{
  name: string;
  version: string;
  deployedAt: string;
}> {
  const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
  const meta = tenant?.metadata as DemoTenantMetadata | undefined;
  if (!meta?.deployedSolutions) {
    return [];
  }

  return meta.deployedSolutions
    .filter((s) => s.deployedVersion !== null)
    .map((s) => ({
      name: s.uniqueName,
      version: s.deployedVersion as string,
      deployedAt: s.deployedAt ?? new Date().toISOString(),
    }));
}

/**
 * Check if an agent version is current
 */
export function isAgentVersionCurrent(agentName: string, version: string): boolean {
  const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agentName)?.version;
  return version === latestVersion;
}
