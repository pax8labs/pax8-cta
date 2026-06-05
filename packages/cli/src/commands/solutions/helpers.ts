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
  DEMO_SOLUTIONS,
  DEMO_TENANTS,
  type DemoTenantMetadata,
  type DemoDeployedSolution,
} from "@pax8/cta-core";

// Solution type from DEMO_SOLUTIONS
export type Solution = (typeof DEMO_SOLUTIONS)[number];

export function findSolution(solutions: Solution[], query: string): Solution | undefined {
  const q = query.toLowerCase();
  return solutions.find(
    (s) => s.uniqueName.toLowerCase().includes(q) || s.friendlyName.toLowerCase().includes(q)
  );
}

/**
 * Get tenant deployment status for an agent.
 *
 * Reads from `DEMO_TENANTS[].metadata.deployedSolutions` so the per-tenant
 * version this command displays always agrees with what `solutions drift
 * --risk` reports. Previously this derived from `generateMockDeploymentHistory`
 * which produced contradictory verdicts (e.g. drift said "2 versions behind",
 * show said "✓ current") — see Issue #1 in the demo-data sweep.
 */
export function getTenantDeploymentStatus(agentName: string): Array<{
  tenantName: string;
  tenantId: string;
  version: string | null;
  deployedAt: string | null;
  status: "current" | "outdated" | "not_deployed";
}> {
  const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agentName)?.version;

  return DEMO_TENANTS.map((tenant) => {
    const meta = tenant.metadata as DemoTenantMetadata | undefined;
    const deployed: DemoDeployedSolution | undefined = meta?.deployedSolutions?.find(
      (s) => s.uniqueName === agentName
    );

    if (!deployed || deployed.deployedVersion === null) {
      return {
        tenantName: tenant.name,
        tenantId: tenant.tenantId,
        version: null,
        deployedAt: null,
        status: "not_deployed" as const,
      };
    }

    const isCurrent = deployed.deployedVersion === latestVersion;
    return {
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      version: deployed.deployedVersion,
      deployedAt: deployed.deployedAt ?? null,
      status: isCurrent ? ("current" as const) : ("outdated" as const),
    };
  });
}
