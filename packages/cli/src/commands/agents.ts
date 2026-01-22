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
  DEMO_SOLUTIONS,
  DEMO_TENANTS,
  generateMockDeploymentHistory,
  getDemoVersionDriftSummary,
  getDemoTenantVersionStatus,
} from "@agentsync/core";
import { isDemoModeEnabled } from "./demo.js";
import { formatTimeAgo } from "../lib/formatters.js";

// Solution type from DEMO_SOLUTIONS
type Solution = typeof DEMO_SOLUTIONS[number];

function findSolution(solutions: Solution[], query: string): Solution | undefined {
  const q = query.toLowerCase();
  return solutions.find(s =>
    s.uniqueName.toLowerCase().includes(q) ||
    s.friendlyName.toLowerCase().includes(q)
  );
}

/**
 * Get tenant deployment status for an agent
 */
function getTenantDeploymentStatus(agentName: string): Array<{
  tenantName: string;
  tenantId: string;
  version: string | null;
  deployedAt: string | null;
  status: "current" | "outdated" | "not_deployed";
}> {
  const history = generateMockDeploymentHistory(50);
  const latestVersion = DEMO_SOLUTIONS.find(s => s.uniqueName === agentName)?.version;

  // Map of tenantId -> latest deployment info
  const tenantDeployments = new Map<string, { version: string; deployedAt: string }>();

  history
    .filter(d => d.status === "completed" && d.solutionName === agentName)
    .forEach(deployment => {
      deployment.tenantResults?.forEach(result => {
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
  return DEMO_TENANTS.map(tenant => {
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
      status: isCurrent ? "current" as const : "outdated" as const,
    };
  });
}

// ============================================================================
// Command definition
// ============================================================================

export const agentsCommand = new Command("agents")
  .description("Manage available agents/solutions");

// ============================================================================
// agents list
// ============================================================================

agentsCommand
  .command("list")
  .alias("ls")
  .description("List all available agents/solutions")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("-c, --category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading agents...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        let solutions = [...DEMO_SOLUTIONS];

        // Apply tag filter
        if (options.tag) {
          const tag = options.tag.toLowerCase();
          solutions = solutions.filter(s =>
            s.tags.some(t => t.toLowerCase().includes(tag))
          );
        }

        // Apply category filter
        if (options.category) {
          const cat = options.category.toLowerCase();
          solutions = solutions.filter(s =>
            s.category.toLowerCase().includes(cat)
          );
        }

        // JSON output
        if (options.json) {
          console.log(JSON.stringify(solutions, null, 2));
          return;
        }

        const table = new Table({
          head: ["Agent", "Version", "Category", "Tags", "Last Published"],
          style: { head: ["cyan"] },
        });

        solutions.forEach(solution => {
          table.push([
            solution.uniqueName,
            solution.version,
            solution.category,
            solution.tags.join(", "),
            formatTimeAgo(solution.lastPublished),
          ]);
        });

        console.log(table.toString());
        console.log();
        console.log(chalk.gray(`${solutions.length} agents available`));
        return;
      }

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to load agents"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// agents show <name>
// ============================================================================

agentsCommand
  .command("show <name>")
  .description("View agent details and tenant inventory")
  .option("--tenants", "Show tenant deployment status")
  .option("--json", "Output as JSON")
  .action(async (name: string, options) => {
    const spinner = ora("Loading agent...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        const solution = findSolution(DEMO_SOLUTIONS, name);

        if (!solution) {
          console.log(chalk.red(`Agent '${name}' not found`));
          console.log();
          console.log(chalk.gray("Available agents:"));
          DEMO_SOLUTIONS.forEach(s => {
            console.log(chalk.gray(`  - ${s.uniqueName} (${s.friendlyName})`));
          });
          process.exit(1);
        }

        // JSON output
        if (options.json) {
          const output: Record<string, unknown> = { ...solution };

          if (options.tenants) {
            output.tenantStatus = getTenantDeploymentStatus(solution.uniqueName);
          }

          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Standard output - agent details
        console.log(chalk.bold(`${solution.friendlyName} (${solution.uniqueName})`));
        console.log("━".repeat(60));
        console.log(`Version:     ${solution.version}`);
        console.log(`Category:    ${solution.category}`);
        console.log(`Publisher:   ${solution.publisherName}`);
        console.log(`Tags:        ${solution.tags.join(", ")}`);
        console.log();
        console.log(chalk.bold("Description:"));
        console.log(`  ${solution.description}`);
        console.log();
        console.log(chalk.bold("Capabilities:"));
        solution.capabilities.forEach(cap => {
          console.log(`  • ${cap}`);
        });
        console.log();
        console.log(chalk.bold("Dependencies:"));
        solution.dependencies.forEach(dep => {
          console.log(`  • ${dep}`);
        });
        console.log();
        console.log(`Last Published: ${formatTimeAgo(solution.lastPublished)}`);

        // Tenant deployment status
        if (options.tenants) {
          console.log();
          console.log(chalk.bold(`${solution.uniqueName} - Tenant Deployment Status`));
          console.log("━".repeat(60));

          const tenantStatus = getTenantDeploymentStatus(solution.uniqueName);

          const table = new Table({
            head: ["Tenant", "Version", "Status", "Last Deployed"],
            style: { head: ["cyan"] },
          });

          tenantStatus.forEach(t => {
            let statusIcon: string;
            switch (t.status) {
              case "current":
                statusIcon = chalk.green("✓ current");
                break;
              case "outdated":
                statusIcon = chalk.yellow("↑ outdated");
                break;
              case "not_deployed":
                statusIcon = chalk.gray("✗ not deployed");
                break;
            }

            table.push([
              t.tenantName,
              t.version || "-",
              statusIcon,
              t.deployedAt ? formatTimeAgo(t.deployedAt) : "-",
            ]);
          });

          console.log(table.toString());
          console.log();

          const deployed = tenantStatus.filter(t => t.status !== "not_deployed").length;
          const current = tenantStatus.filter(t => t.status === "current").length;
          const outdated = tenantStatus.filter(t => t.status === "outdated").length;

          console.log(chalk.gray(
            `${deployed}/${tenantStatus.length} tenants have this agent (${current} current, ${outdated} outdated)`
          ));
        }

        return;
      }

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to load agent"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// agents drift
// ============================================================================

agentsCommand
  .command("drift")
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
          const tenant = DEMO_TENANTS.find(t =>
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

          status.solutions.forEach(sol => {
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

          const overallIcon = status.overallStatus === "current"
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
          filteredSummary = filteredSummary.filter(s =>
            s.uniqueName.toLowerCase().includes(options.agent.toLowerCase()) ||
            s.friendlyName.toLowerCase().includes(options.agent.toLowerCase())
          );
        }

        filteredSummary.forEach(sol => {
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

          DEMO_TENANTS.filter(t => t.enabled).forEach(tenant => {
            const status = getDemoTenantVersionStatus(tenant.tenantId);
            if (!status) return;

            status.solutions
              .filter(s => s.status === "outdated")
              .forEach(sol => {
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

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to check version drift"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
