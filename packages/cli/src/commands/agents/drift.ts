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
import { resolve } from "node:path";
import chalk from "chalk";
import { createSpinner } from "../../lib/spinner.js";
import Table from "cli-table3";
import {
  DEMO_TENANTS,
  getDemoVersionDriftSummary,
  getDemoTenantVersionStatus,
  loadConfig,
  TokenManager,
  DataverseClient,
  VersionChecker,
  TenantConfig,
  TenantVersionStatus,
  VersionDriftSummary,
  SolutionVersionInfo,
} from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";

export const driftCommand = new Command("drift")
  .description("Compare solution versions across tenants to find outdated deployments")
  .option("-a, --agent <name>", "Check specific agent only")
  .option("-t, --tenant <name>", "Check specific tenant only")
  .option("--outdated", "Show only outdated tenants")
  .option("--json", "Output as JSON")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .addHelpText(
    "after",
    `
Examples:
  agentsync solutions drift                           Show fleet-wide version drift summary
  agentsync solutions drift -t AgentSync-Test2        Check drift for a specific tenant
  agentsync solutions drift --outdated                Show only outdated tenants
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Checking version drift...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

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

          if (options.json) {
            console.log(JSON.stringify(status, null, 2));
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
          return;
        }

        // Fleet-wide summary
        const summary = getDemoVersionDriftSummary();

        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
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

        return;
      }

      // Production mode — query real environments
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      const clientSecret = await getClientSecretWithFallback();

      // Get expected solutions from source environment
      const sourceTokenManager = new TokenManager({
        tenantId: config.source?.tenantId || config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });
      const sourceClient = new DataverseClient({
        environmentUrl: config.source?.environmentUrl || config.tenants[0]?.environmentUrl,
        tokenManager: sourceTokenManager,
        clientId: config.partner.clientId,
      });

      spinner.text = "Querying source environment for solution versions...";
      const sourceSolutions = await sourceClient.querySolutions();

      // Filter to non-system solutions (visible, non-default)
      const expectedSolutions = sourceSolutions
        .filter(
          (s) =>
            s.uniquename !== "Default" &&
            s.uniquename !== "Active" &&
            !s.uniquename.startsWith("msdyn_") &&
            !s.uniquename.startsWith("msft_") &&
            !s.uniquename.startsWith("mspcat_")
        )
        .map((s) => ({
          uniqueName: s.uniquename,
          friendlyName: s.friendlyname,
          version: s.version,
        }));

      if (expectedSolutions.length === 0) {
        spinner.warn("No custom solutions found in source environment");
        return;
      }

      // Determine which tenants to check
      let tenants = config.tenants.filter((t) => t.enabled);
      if (options.tenant) {
        const match = tenants.find(
          (t) =>
            t.name.toLowerCase().includes(options.tenant.toLowerCase()) ||
            t.tenantId.toLowerCase().includes(options.tenant.toLowerCase())
        );
        if (!match) {
          spinner.fail(chalk.red(`Tenant '${options.tenant}' not found`));
          process.exit(1);
        }
        tenants = [match];
      }

      spinner.text = `Checking ${tenants.length} tenant(s) for version drift...`;

      // Check each tenant
      const checker = new VersionChecker();
      const statuses: TenantVersionStatus[] = [];

      for (const tenant of tenants) {
        spinner.text = `Checking ${tenant.name}...`;
        const tm = new TokenManager({
          tenantId: tenant.tenantId,
          clientId: config.partner.clientId,
          clientSecret,
        });
        const status = await checker.checkTenantVersions(tenant, expectedSolutions, tm, true);
        statuses.push(status);
      }

      spinner.stop();

      // Single tenant mode
      if (options.tenant && statuses.length === 1) {
        const status = statuses[0];
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        displayTenantStatus(status);
        return;
      }

      // Fleet-wide summary
      const summary = buildSummary(statuses, expectedSolutions);

      if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      displayFleetSummary(summary, options, tenants, statuses, checker, expectedSolutions);
    } catch (error) {
      handleCommandError(error, spinner, "Failed to check version drift");
    }
  });

// ============================================================================
// Display helpers (shared between demo and production)
// ============================================================================

function displayTenantStatus(status: TenantVersionStatus): void {
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

function buildSummary(
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

function displayFleetSummary(
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
