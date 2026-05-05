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
import type { DriftRecommendation, TenantVersionStatus } from "@agentsync/core";

/** Risk level for a tenant based on its drift state */
export type DriftRiskLevel = "low" | "medium" | "high";

/**
 * Calculate the drift risk level for a tenant based on its version status.
 *
 * - low: 1 minor version behind on all solutions
 * - medium: 2+ versions behind or multiple outdated solutions
 * - high: not deployed solutions or 3+ versions behind
 */
export function calculateDriftRisk(status: TenantVersionStatus): DriftRiskLevel {
  const outdated = status.solutions.filter((s) => s.status === "outdated");
  const notDeployed = status.solutions.filter((s) => s.status === "not_deployed");

  if (notDeployed.length > 0) return "high";

  if (outdated.length === 0) return "low";

  const maxDrift = Math.max(...outdated.map((s) => Math.abs(s.versionDrift)));

  if (maxDrift >= 3) return "high";
  if (maxDrift >= 2 || outdated.length >= 2) return "medium";
  return "low";
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
