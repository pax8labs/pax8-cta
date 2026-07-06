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

import chalk from "chalk";
import type { DriftRecommendation, TenantVersionStatus } from "@pax8/cta-core";

/** Risk level for a tenant based on its drift state */
export type DriftRiskLevel = "low" | "medium" | "high";

/** Assessment of a tenant's drift risk — level + human-readable "why". */
export interface DriftRiskAssessment {
  level: DriftRiskLevel;
  /**
   * Short (≤40 char) explanation of what pushed this tenant into `level`.
   * Rendered inline next to the risk label so users can see why a tenant
   * was included / skipped without running `analyze` on each one (issue #464).
   */
  reason: string;
}

/**
 * Assess a tenant's drift risk. Returns level + reason.
 *
 * - low: 1 minor version behind on all solutions
 * - medium: 2+ versions behind or multiple outdated solutions
 * - high: not deployed solutions or 3+ versions behind
 */
export function assessDriftRisk(status: TenantVersionStatus): DriftRiskAssessment {
  const outdated = status.solutions.filter((s) => s.status === "outdated");
  const notDeployed = status.solutions.filter((s) => s.status === "not_deployed");

  if (notDeployed.length > 0) {
    if (notDeployed.length === 1) {
      return { level: "high", reason: `${notDeployed[0].uniqueName} not deployed` };
    }
    return { level: "high", reason: `${notDeployed.length} solutions not deployed` };
  }

  if (outdated.length === 0) {
    return { level: "low", reason: "all solutions current" };
  }

  const maxDrift = Math.max(...outdated.map((s) => Math.abs(s.versionDrift)));
  const worst = outdated.reduce((a, b) =>
    Math.abs(b.versionDrift) > Math.abs(a.versionDrift) ? b : a
  );

  if (maxDrift >= 3) {
    return { level: "high", reason: `${maxDrift} versions behind on ${worst.uniqueName}` };
  }
  if (maxDrift >= 2) {
    return { level: "medium", reason: `2 versions behind on ${worst.uniqueName}` };
  }
  if (outdated.length >= 2) {
    return { level: "medium", reason: `${outdated.length} solutions outdated` };
  }
  return { level: "low", reason: `1 version behind on ${worst.uniqueName}` };
}

/**
 * Backwards-compat wrapper — returns just the level. Prefer `assessDriftRisk`
 * for new callers so the "why" is available.
 */
export function calculateDriftRisk(status: TenantVersionStatus): DriftRiskLevel {
  return assessDriftRisk(status).level;
}

/**
 * Parse the --max-risk option into a numeric threshold.
 */
export function riskLevelValue(level: DriftRiskLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

export function formatRiskLevel(level: string): string {
  switch (level) {
    case "high":
      return chalk.red("HIGH");
    case "medium":
      return chalk.yellow("MED");
    case "low":
      return chalk.green("LOW");
    default:
      return chalk.gray(level);
  }
}

export function formatRecommendation(rec: DriftRecommendation): string {
  switch (rec) {
    case "current":
      return chalk.green("✓ current");
    case "safe_to_update":
      return chalk.green("safe to update");
    case "review_recommended":
      return chalk.yellow("review recommended");
    case "update_risky":
      return chalk.red("update risky");
    case "do_not_update":
      return chalk.red("⚠ do not update");
    default:
      return chalk.gray(rec);
  }
}
