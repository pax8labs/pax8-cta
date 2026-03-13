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

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  isDemoMode as isDemoModeCore,
  DEMO_TENANTS,
  getDemoVersionDriftSummary,
  getDemoTenantVersionStatus,
  getDemoUnmanagedCustomizations,
  getDemoCustomizationSummary,
} from "@agentsync/core";
import type { UnmanagedCustomizationResult } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";

export const driftCommand = new Command("drift")
  .description("Check for version drift across tenants")
  .option("-a, --agent <name>", "Check specific agent only")
  .option("-t, --tenant <name>", "Check specific tenant only")
  .option("--outdated", "Show only outdated tenants")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Checking version drift...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        // Single tenant mode
        if (options.tenant) {
          const tenant = DEMO_TENANTS.find(
            (t) =>
              t.name.toLowerCase().includes(options.tenant.toLowerCase()) ||
              t.tenantId.toLowerCase().includes(options.tenant.toLowerCase())
          );

          if (!tenant) {
            console.log(chalk.red(`Tenant '${options.tenant}' not found`));
            process.exit(1);
          }

          const status = getDemoTenantVersionStatus(tenant.tenantId);
          if (!status) {
            console.log(chalk.red(`Could not get version status for tenant`));
            process.exit(1);
          }

          // Also get unmanaged customizations for this tenant
          const customizationResult = getDemoUnmanagedCustomizations(
            tenant.tenantId,
            "CustomerServiceAgent"
          );

          if (options.json) {
            console.log(
              JSON.stringify({ ...status, customizations: customizationResult }, null, 2)
            );
            return;
          }

          console.log(chalk.bold(`${status.tenantName} - Version Status`));
          console.log("━".repeat(60));

          const table = new Table({
            head: ["Agent", "Expected", "Deployed", "Status"],
            style: { head: ["cyan"] },
          });

          status.solutions.forEach((sol) => {
            let statusIcon: string;
            switch (sol.status) {
              case "current":
                statusIcon = chalk.green("✓ current");
                break;
              case "outdated":
                statusIcon = chalk.yellow(`↑ outdated (${sol.versionDrift})`);
                break;
              case "ahead":
                statusIcon = chalk.blue(`↓ ahead (+${sol.versionDrift})`);
                break;
              case "not_deployed":
                statusIcon = chalk.gray("✗ not deployed");
                break;
              default:
                statusIcon = chalk.gray("? unknown");
            }

            table.push([
              sol.uniqueName,
              sol.expectedVersion,
              sol.deployedVersion || "-",
              statusIcon,
            ]);
          });

          console.log(table.toString());
          console.log();

          const overallIcon =
            status.overallStatus === "current"
              ? chalk.green("✓")
              : status.overallStatus === "outdated"
                ? chalk.yellow("⚠")
                : chalk.gray("?");
          console.log(`Overall: ${overallIcon} ${status.overallStatus}`);

          // Show unmanaged customizations section
          displayCustomizationDetails(customizationResult);
          return;
        }

        // Fleet-wide summary
        const summary = getDemoVersionDriftSummary();
        const customizationSummary = getDemoCustomizationSummary("CustomerServiceAgent");

        if (options.json) {
          console.log(
            JSON.stringify({ ...summary, customizations: customizationSummary }, null, 2)
          );
          return;
        }

        console.log(chalk.bold("Version Drift Summary"));
        console.log("━".repeat(60));
        console.log();

        // Fleet overview
        const currentPct = Math.round((summary.currentTenants / summary.totalTenants) * 100);
        console.log(`Tenants: ${summary.totalTenants} total`);
        console.log(`  ${chalk.green("✓")} Current:  ${summary.currentTenants} (${currentPct}%)`);
        console.log(`  ${chalk.yellow("⚠")} Outdated: ${summary.outdatedTenants}`);
        if (summary.unknownTenants > 0) {
          console.log(`  ${chalk.gray("?")} Unknown:  ${summary.unknownTenants}`);
        }
        console.log();

        // Per-solution breakdown
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
              s.uniqueName.toLowerCase().includes(options.agent.toLowerCase()) ||
              s.friendlyName.toLowerCase().includes(options.agent.toLowerCase())
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

        // Show outdated tenants if requested
        if (options.outdated) {
          console.log();
          console.log(chalk.bold("Outdated Tenants"));
          console.log("─".repeat(60));

          const outdatedTable = new Table({
            head: ["Tenant", "Agent", "Deployed", "Expected"],
            style: { head: ["cyan"] },
          });

          DEMO_TENANTS.filter((t) => t.enabled).forEach((tenant) => {
            const status = getDemoTenantVersionStatus(tenant.tenantId);
            if (!status) return;

            status.solutions
              .filter((s) => s.status === "outdated")
              .forEach((sol) => {
                outdatedTable.push([
                  tenant.name,
                  sol.uniqueName,
                  chalk.yellow(sol.deployedVersion || "-"),
                  sol.expectedVersion,
                ]);
              });
          });

          console.log(outdatedTable.toString());
        }

        // Show unmanaged customizations fleet summary
        displayCustomizationFleetSummary(customizationSummary);

        return;
      }

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to check version drift"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Display unmanaged customization details for a single tenant
 */
function displayCustomizationDetails(result: UnmanagedCustomizationResult): void {
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
function displayCustomizationFleetSummary(summary: {
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
