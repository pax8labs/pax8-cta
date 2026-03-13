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
  type TenantVersionStatus,
} from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";

/** Risk level for a tenant based on its drift state */
export type DriftRiskLevel = "low" | "medium" | "high";

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

/**
 * Parse the --max-risk option into a numeric threshold.
 */
function riskLevelValue(level: DriftRiskLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}

export const driftCommand = new Command("drift")
  .description("Check for version drift across tenants")
  .option("-a, --agent <name>", "Check specific agent only")
  .option("-t, --tenant <name>", "Check specific tenant only")
  .option("--outdated", "Show only outdated tenants")
  .option("--json", "Output as JSON")
  .option("--fix", "Deploy current version to outdated tenants (risk-gated)")
  .option(
    "--max-risk <level>",
    "Maximum risk level to auto-fix: low, medium, or high (default: low)",
    "low"
  )
  .option("--force", "Fix all tenants regardless of risk (same as --max-risk high)")
  .option("--dry-run", "Show what would be fixed without executing")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (options) => {
    const spinner = ora("Checking version drift...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        // --fix mode: deploy current version to outdated tenants
        if (options.fix) {
          const maxRisk: DriftRiskLevel = options.force ? "high" : options.maxRisk;

          if (!["low", "medium", "high"].includes(maxRisk)) {
            console.log(
              chalk.red(`Invalid --max-risk value: '${maxRisk}'. Use low, medium, or high.`)
            );
            process.exit(1);
          }

          // Build tenant version statuses
          let enabledTenants = DEMO_TENANTS.filter((t) => t.enabled);

          // Filter to specific tenant if requested
          if (options.tenant) {
            enabledTenants = enabledTenants.filter(
              (t) =>
                t.name.toLowerCase().includes(options.tenant.toLowerCase()) ||
                t.tenantId.toLowerCase().includes(options.tenant.toLowerCase())
            );

            if (enabledTenants.length === 0) {
              console.log(chalk.red(`Tenant '${options.tenant}' not found`));
              process.exit(1);
            }
          }

          const tenantStatuses = enabledTenants.map((tenant) => ({
            tenant,
            status: getDemoTenantVersionStatus(tenant.tenantId)!,
          }));

          const plan = buildDriftFixPlan(tenantStatuses);

          if (plan.length === 0) {
            console.log(chalk.green("All tenants are up to date. Nothing to fix."));
            return;
          }

          const maxRiskValue = riskLevelValue(maxRisk);

          // Categorize entries
          const willFix = plan.filter((e) => riskLevelValue(e.risk) <= maxRiskValue);
          const willSkip = plan.filter((e) => riskLevelValue(e.risk) > maxRiskValue);

          // Display the fix plan
          console.log(chalk.bold("Drift Fix Plan:"));

          for (const entry of plan) {
            const riskVal = riskLevelValue(entry.risk);
            const included = riskVal <= maxRiskValue;

            const versions = entry.outdatedSolutions
              .map((s) => `${s.deployedVersion || "none"} -> ${s.expectedVersion}`)
              .join(", ");

            if (included) {
              if (entry.risk === "low") {
                console.log(
                  chalk.green(`  ✓ ${entry.tenantName}  ${versions}  (low risk -- safe)`)
                );
              } else if (entry.risk === "medium") {
                console.log(
                  chalk.yellow(`  ⚠ ${entry.tenantName}  ${versions}  (medium risk -- included)`)
                );
              } else {
                console.log(
                  chalk.red(`  ✗ ${entry.tenantName}  ${versions}  (high risk -- included)`)
                );
              }
            } else {
              if (entry.risk === "medium") {
                console.log(
                  chalk.yellow(`  ⚠ ${entry.tenantName}  ${versions}  (medium risk -- SKIPPED)`)
                );
              } else {
                console.log(
                  chalk.red(`  ✗ ${entry.tenantName}  ${versions}  (high risk -- SKIPPED)`)
                );
              }
            }
          }

          console.log();

          if (willFix.length === 0) {
            console.log(
              chalk.yellow(
                `No tenants within --max-risk=${maxRisk} threshold. Use --max-risk medium or --force to include higher-risk tenants.`
              )
            );
            return;
          }

          console.log(
            `Will update ${willFix.length} of ${plan.length} outdated tenant${plan.length !== 1 ? "s" : ""}.` +
              (willSkip.length > 0 ? ` ${willSkip.length} skipped (risk above ${maxRisk}).` : "")
          );

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  plan,
                  willFix: willFix.map((e) => e.tenantName),
                  willSkip: willSkip.map((e) => ({ tenantName: e.tenantName, risk: e.risk })),
                  maxRisk,
                  dryRun: !!options.dryRun,
                },
                null,
                2
              )
            );
            return;
          }

          if (options.dryRun) {
            console.log(chalk.gray("\n--dry-run: No changes were made."));
            return;
          }

          // Confirmation prompt (skip if --yes)
          if (!options.yes) {
            // In demo mode tests, we skip the interactive prompt.
            // The readline import is deferred to avoid issues in test environments.
            const readline = await import("node:readline");
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            const answer = await new Promise<string>((resolve) => {
              rl.question("Continue? [y/N] ", (ans) => {
                rl.close();
                resolve(ans.trim().toLowerCase());
              });
            });

            if (answer !== "y" && answer !== "yes") {
              console.log(chalk.gray("Aborted."));
              return;
            }
          }

          // Execute fixes (simulated in demo mode)
          console.log();
          const results: DriftFixResult[] = [];

          for (const entry of willFix) {
            const fixSpinner = ora(`Updating ${entry.tenantName}...`).start();

            // Simulate deployment delay
            await new Promise((resolve) => setTimeout(resolve, 100));

            // In demo mode, simulate success
            fixSpinner.succeed(`${entry.tenantName} updated successfully`);
            results.push({
              tenantName: entry.tenantName,
              tenantId: entry.tenantId,
              status: "updated",
              risk: entry.risk,
            });
          }

          // Add skipped entries to results
          for (const entry of willSkip) {
            results.push({
              tenantName: entry.tenantName,
              tenantId: entry.tenantId,
              status: "skipped_risk",
              risk: entry.risk,
            });
          }

          // Summary
          console.log();
          console.log(chalk.bold("Results:"));
          const updated = results.filter((r) => r.status === "updated").length;
          const skippedRisk = results.filter((r) => r.status === "skipped_risk").length;
          const failed = results.filter((r) => r.status === "failed").length;

          console.log(chalk.green(`  Updated:        ${updated}`));
          if (skippedRisk > 0) {
            console.log(chalk.yellow(`  Skipped (risk): ${skippedRisk}`));
          }
          if (failed > 0) {
            console.log(chalk.red(`  Failed:         ${failed}`));
          }

          return;
        }

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

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to check version drift"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
