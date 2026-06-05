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

import type { TenantVersionStatus } from "@pax8/cta-core";
import { calculateDriftRisk, type DriftRiskLevel } from "./risk-calculator.js";

/** A tenant's drift fix plan entry */
export interface DriftFixEntry {
  tenantName: string;
  tenantId: string;
  risk: DriftRiskLevel;
  outdatedSolutions: Array<{
    uniqueName: string;
    deployedVersion: string | null;
    expectedVersion: string;
    versionDrift: number;
  }>;
}

/** Result of a drift fix operation for a single tenant */
export interface DriftFixResult {
  tenantName: string;
  tenantId: string;
  status: "updated" | "skipped_risk" | "skipped_current" | "failed";
  risk: DriftRiskLevel;
  error?: string;
}

/**
 * Build the drift fix plan: identify outdated tenants and their risk levels.
 */
export function buildDriftFixPlan(
  tenantStatuses: Array<{ tenant: { name: string; tenantId: string }; status: TenantVersionStatus }>
): DriftFixEntry[] {
  const plan: DriftFixEntry[] = [];

  for (const { tenant, status } of tenantStatuses) {
    const outdatedSolutions = status.solutions.filter(
      (s) => s.status === "outdated" || s.status === "not_deployed"
    );

    if (outdatedSolutions.length === 0) continue;

    plan.push({
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      risk: calculateDriftRisk(status),
      outdatedSolutions: outdatedSolutions.map((s) => ({
        uniqueName: s.uniqueName,
        deployedVersion: s.deployedVersion,
        expectedVersion: s.expectedVersion,
        versionDrift: s.versionDrift,
      })),
    });
  }

  // Sort by risk: low first, then medium, then high
  const riskOrder: Record<DriftRiskLevel, number> = { low: 0, medium: 1, high: 2 };
  plan.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return plan;
}
