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
import Table from "cli-table3";
import type {
  FleetDriftAnalysis,
  SolutionVersionInfo,
  TenantConfig,
  TenantDeploymentHistory,
  TenantDriftAnalysis,
  TenantVersionStatus,
  VersionChecker,
  VersionDriftSummary,
} from "@agentsync/core";
import type { UnmanagedCustomizationResult } from "@agentsync/core";
import { formatRecommendation, formatRiskLevel } from "./risk-calculator.js";

export function displayTenantStatus(status: TenantVersionStatus): void {
  console.log(chalk.bold(`${status.tenantName} - Version Status`));
  console.log("━".repeat(60));

  if (status.error) {
    console.log(chalk.red(`  Error: ${status.error}`));
    console.log();
  }

  const table = new Table({
    head: ["Agent", "Expected", "Deployed", "Status"],
    style: { head: ["cyan"] },
  });

  status.solutions.forEach((sol) => {
    table.push([
      sol.uniqueName,
      sol.expectedVersion,
      sol.deployedVersion || "-",
      formatStatus(sol),
    ]);
  });

  console.log(table.toString());
  console.log();

  const overallIcon =
    status.overallStatus === "current"
      ? chalk.green("✓")
      : status.overallStatus === "outdated"
        ? chalk.yellow("⚠")
        : status.overallStatus === "mixed"
          ? chalk.yellow("⚠")
          : chalk.gray("?");
  console.log(`Overall: ${overallIcon} ${status.overallStatus}`);
}

function formatStatus(sol: SolutionVersionInfo): string {
  switch (sol.status) {
    case "current":
      return chalk.green("✓ current");
    case "outdated":
      return chalk.yellow(`↑ outdated (${sol.versionDrift})`);
    case "ahead":
      return chalk.blue(`↓ ahead (+${sol.versionDrift})`);
    case "not_deployed":
      return chalk.gray("✗ not deployed");
    default:
      return chalk.gray("? unknown");
  }
}

export function buildSummary(
  statuses: TenantVersionStatus[],
  expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>
): VersionDriftSummary {
  const solutionSummary = expectedSolutions.map((solution) => {
    let atVersion = 0;
    let behind = 0;
    let notDeployed = 0;

    for (const status of statuses) {
      const solStatus = status.solutions.find((s) => s.uniqueName === solution.uniqueName);
      if (!solStatus || solStatus.status === "unknown") continue;

      if (solStatus.status === "current" || solStatus.status === "ahead") {
        atVersion++;
      } else if (solStatus.status === "outdated") {
        behind++;
      } else if (solStatus.status === "not_deployed") {
        notDeployed++;
      }
    }

    return {
      uniqueName: solution.uniqueName,
      friendlyName: solution.friendlyName,
      expectedVersion: solution.version,
      tenantsAtVersion: atVersion,
      tenantsBehind: behind,
      tenantsNotDeployed: notDeployed,
    };
  });

  return {
    totalTenants: statuses.length,
    currentTenants: statuses.filter((s) => s.overallStatus === "current").length,
    outdatedTenants: statuses.filter(
      (s) => s.overallStatus === "outdated" || s.overallStatus === "mixed"
    ).length,
    unknownTenants: statuses.filter((s) => s.overallStatus === "unknown").length,
    solutionSummary,
  };
}

export function displayTenantRiskAnalysis(analysis: TenantDriftAnalysis): void {
  console.log(chalk.bold(`${analysis.tenantName} — Drift Risk Analysis`));
  console.log("━".repeat(70));
  console.log();

  console.log(
    `  Risk Score:       ${analysis.riskScore}/100 ${formatRiskLevel(analysis.riskLevel)}`
  );
  console.log(`  Recommendation:   ${formatRecommendation(analysis.recommendation)}`);
  console.log(`  Reason:           ${analysis.recommendationReason}`);
  console.log();

  if (analysis.factors.length > 0) {
    console.log(chalk.bold("Risk Factors"));
    console.log("─".repeat(70));

    const factorTable = new Table({
      head: ["Factor", "Level", "Weight", "Details"],
      style: { head: ["cyan"] },
    });

    analysis.factors.forEach((f) => {
      factorTable.push([
        f.name.replace(/_/g, " "),
        formatRiskLevel(f.level),
        `${f.weight}/10`,
        f.description,
      ]);
    });

    console.log(factorTable.toString());
    console.log();
  }

  if (analysis.outdatedSolutions.length > 0) {
    console.log(chalk.bold("Outdated Solutions"));
    console.log("─".repeat(70));

    const solTable = new Table({
      head: ["Solution", "Expected", "Deployed", "Drift"],
      style: { head: ["cyan"] },
    });

    analysis.outdatedSolutions.forEach((sol) => {
      solTable.push([
        sol.uniqueName,
        sol.expectedVersion,
        sol.deployedVersion || "-",
        chalk.yellow(`${sol.versionDrift} behind`),
      ]);
    });

    console.log(solTable.toString());
  }
}

export function displayFleetRiskAnalysis(
  fleet: FleetDriftAnalysis,
  riskFilter?: string | true
): void {
  let analyses = fleet.tenants;

  // Filter by risk level if specified (e.g., --risk high)
  if (typeof riskFilter === "string") {
    const level = riskFilter.toLowerCase();
    analyses = analyses.filter((a) => a.riskLevel === level);
  }

  // Sort: do_not_update first, then update_risky, review_recommended, safe_to_update, current
  const recOrder: Record<string, number> = {
    do_not_update: 0,
    update_risky: 1,
    review_recommended: 2,
    safe_to_update: 3,
    current: 4,
  };
  analyses.sort((a, b) => (recOrder[a.recommendation] ?? 5) - (recOrder[b.recommendation] ?? 5));

  console.log(chalk.bold("Fleet Drift Risk Analysis"));
  console.log("━".repeat(80));
  console.log();

  // Summary
  const s = fleet.summary;
  console.log(`Tenants: ${s.total} total`);
  console.log(`  ${chalk.green("✓")} Current:            ${s.current}`);
  console.log(`  ${chalk.green("●")} Safe to update:     ${s.safeToUpdate}`);
  console.log(`  ${chalk.yellow("●")} Review recommended: ${s.reviewRecommended}`);
  console.log(`  ${chalk.red("●")} Update risky:       ${s.risky}`);
  if (s.doNotUpdate > 0) {
    console.log(`  ${chalk.red("⚠")} Do not update:      ${s.doNotUpdate}`);
  }
  console.log();

  if (analyses.length === 0) {
    console.log(chalk.gray("No tenants match the specified risk filter."));
    return;
  }

  // Detailed table
  const table = new Table({
    head: ["Tenant", "Score", "Risk", "Recommendation", "Top Factor"],
    style: { head: ["cyan"] },
    colWidths: [22, 8, 8, 22, 35],
    wordWrap: true,
  });

  analyses.forEach((a) => {
    const topFactor =
      a.factors.length > 0
        ? a.factors.filter((f) => f.level !== "low").sort((x, y) => y.weight - x.weight)[0]
            ?.description || "Minor risk"
        : "-";

    table.push([
      a.tenantName,
      `${a.riskScore}`,
      formatRiskLevel(a.riskLevel),
      formatRecommendation(a.recommendation),
      topFactor,
    ]);
  });

  console.log(table.toString());
}

export function generateDemoDeployHistory(tenantId: string): TenantDeploymentHistory {
  // Generate deterministic but varied history based on tenant ID
  const seed = parseInt(tenantId.replace(/-/g, "").slice(0, 8), 16) || 0;
  const total = 3 + (seed % 20);
  const successRate = 0.5 + (seed % 50) / 100; // 50-99%
  const successful = Math.min(total, Math.round(total * successRate));

  const daysAgo = 5 + (seed % 120);
  const lastDate = new Date();
  lastDate.setDate(lastDate.getDate() - daysAgo);

  const lastResult = successful === total ? "success" : seed % 3 === 0 ? "failure" : "success";

  return {
    tenantId,
    lastDeployResult: lastResult as "success" | "failure",
    lastDeployDate: lastDate.toISOString(),
    totalDeploys: total,
    successfulDeploys: successful,
  };
}

export function displayFleetSummary(
  summary: VersionDriftSummary,
  options: { agent?: string; outdated?: boolean },
  tenants: TenantConfig[],
  statuses: TenantVersionStatus[],
  _checker: VersionChecker,
  _expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>
): void {
  console.log(chalk.bold("Version Drift Summary"));
  console.log("━".repeat(60));
  console.log();

  const currentPct = Math.round((summary.currentTenants / summary.totalTenants) * 100);
  console.log(`Tenants: ${summary.totalTenants} total`);
  console.log(`  ${chalk.green("✓")} Current:  ${summary.currentTenants} (${currentPct}%)`);
  console.log(`  ${chalk.yellow("⚠")} Outdated: ${summary.outdatedTenants}`);
  if (summary.unknownTenants > 0) {
    console.log(`  ${chalk.gray("?")} Unknown:  ${summary.unknownTenants}`);
  }
  console.log();

  console.log(chalk.bold("Per-Agent Status"));
  console.log("─".repeat(60));

  const solutionTable = new Table({
    head: ["Agent", "Version", "Current", "Outdated", "Not Deployed"],
    style: { head: ["cyan"] },
  });

  let filteredSummary = summary.solutionSummary;
  if (options.agent) {
    filteredSummary = filteredSummary.filter(
      (s) =>
        s.uniqueName.toLowerCase().includes(options.agent!.toLowerCase()) ||
        s.friendlyName.toLowerCase().includes(options.agent!.toLowerCase())
    );
  }

  filteredSummary.forEach((sol) => {
    solutionTable.push([
      sol.uniqueName,
      sol.expectedVersion,
      chalk.green(sol.tenantsAtVersion.toString()),
      sol.tenantsBehind > 0 ? chalk.yellow(sol.tenantsBehind.toString()) : "0",
      sol.tenantsNotDeployed > 0 ? chalk.gray(sol.tenantsNotDeployed.toString()) : "0",
    ]);
  });

  console.log(solutionTable.toString());

  if (options.outdated) {
    console.log();
    console.log(chalk.bold("Outdated Tenants"));
    console.log("─".repeat(60));

    const outdatedTable = new Table({
      head: ["Tenant", "Agent", "Deployed", "Expected"],
      style: { head: ["cyan"] },
    });

    for (let i = 0; i < tenants.length; i++) {
      const status = statuses[i];
      status.solutions
        .filter((s) => s.status === "outdated")
        .forEach((sol) => {
          outdatedTable.push([
            tenants[i].name,
            sol.uniqueName,
            chalk.yellow(sol.deployedVersion || "-"),
            sol.expectedVersion,
          ]);
        });
    }

    console.log(outdatedTable.toString());
  }
}

/**
 * Display unmanaged customization details for a single tenant
 */
export function displayCustomizationDetails(result: UnmanagedCustomizationResult): void {
  console.log();

  if (result.totalCustomizations === 0) {
    console.log(chalk.green("Customizations: None detected - clean environment"));
    return;
  }

  const riskIcon =
    result.riskLevel === "high"
      ? chalk.red("⚠")
      : result.riskLevel === "medium"
        ? chalk.yellow("⚠")
        : chalk.blue("ℹ");

  console.log(chalk.bold("Unmanaged Customizations"));
  console.log("─".repeat(60));
  console.log(`${riskIcon} ${result.riskSummary}`);
  console.log();

  const custTable = new Table({
    head: ["Component", "Type", "Description"],
    style: { head: ["cyan"] },
    colWidths: [30, 15, 45],
    wordWrap: true,
  });

  result.customizations.forEach((c) => {
    const typeColor =
      c.componentType === "flow" ||
      c.componentType === "security_role" ||
      c.componentType === "plugin"
        ? chalk.red
        : chalk.yellow;

    custTable.push([c.displayName, typeColor(c.componentType), c.description]);
  });

  console.log(custTable.toString());

  // Type summary
  const nonZeroTypes = Object.entries(result.byType)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");

  console.log(chalk.gray(`\nBreakdown: ${nonZeroTypes}`));
}

/**
 * Display fleet-wide unmanaged customization summary
 */
export function displayCustomizationFleetSummary(summary: {
  totalTenants: number;
  tenantsWithCustomizations: number;
  tenantsClean: number;
  totalCustomizations: number;
  highRiskTenants: string[];
  results: UnmanagedCustomizationResult[];
}): void {
  console.log();
  console.log(chalk.bold("Unmanaged Customizations"));
  console.log("─".repeat(60));
  console.log(`  ${chalk.green("✓")} Clean:        ${summary.tenantsClean} tenants`);
  console.log(
    `  ${chalk.yellow("⚠")} Customized:   ${summary.tenantsWithCustomizations} tenants (${summary.totalCustomizations} total)`
  );

  if (summary.highRiskTenants.length > 0) {
    console.log(`  ${chalk.red("⚠")} High risk:    ${summary.highRiskTenants.join(", ")}`);
  }

  // Show per-tenant customization counts
  const tenantsWithCustomizations = summary.results.filter((r) => r.totalCustomizations > 0);
  if (tenantsWithCustomizations.length > 0) {
    console.log();

    const custTable = new Table({
      head: ["Tenant", "Count", "Risk", "Top Types"],
      style: { head: ["cyan"] },
    });

    tenantsWithCustomizations.forEach((r) => {
      const riskColor =
        r.riskLevel === "high" ? chalk.red : r.riskLevel === "medium" ? chalk.yellow : chalk.blue;

      const topTypes = Object.entries(r.byType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => `${count} ${type}`)
        .join(", ");

      custTable.push([
        r.tenantName,
        r.totalCustomizations.toString(),
        riskColor(r.riskLevel),
        topTypes,
      ]);
    });

    console.log(custTable.toString());
  }
}
