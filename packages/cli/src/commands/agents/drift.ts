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
  DriftAnalyzer,
  TenantDriftAnalysis,
  FleetDriftAnalysis,
  TenantDeploymentHistory,
  DriftRecommendation,
  getDemoUnmanagedCustomizations,
  getDemoCustomizationSummary,
} from "@agentsync/core";
import type { UnmanagedCustomizationResult } from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";

const driftAnalyzer = new DriftAnalyzer();

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
  .description("Compare solution versions across tenants to find outdated deployments")
  .option("-a, --agent <name>", "Check specific agent only")
  .option("-t, --tenant <name>", "Check specific tenant only")
  .option("--outdated", "Show only outdated tenants")
  .option("--risk [level]", "Show risk analysis (optionally filter by: low, medium, high)")
  .option("--json", "Output as JSON")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--fix", "Deploy current version to outdated tenants (risk-gated)")
  .option(
    "--max-risk <level>",
    "Maximum risk level to auto-fix: low, medium, or high (default: low)",
    "low"
  )
  .option("--force", "Fix all tenants regardless of risk (same as --max-risk high)")
  .option("--dry-run", "Show what would be fixed without executing")
  .option("-y, --yes", "Skip confirmation prompt")
  .addHelpText(
    "after",
    `
Examples:
  agentsync solutions drift                           Show fleet-wide version drift summary
  agentsync solutions drift -t AgentSync-Test2        Check drift for a specific tenant
  agentsync solutions drift --outdated                Show only outdated tenants
  agentsync solutions drift --risk                    Show drift with risk scores
  agentsync solutions drift --risk high               Show only high-risk tenants
  agentsync solutions drift --fix                     Fix low-risk outdated tenants
  agentsync solutions drift --fix --force             Fix all outdated tenants
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Checking version drift...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        const enabledTenants = DEMO_TENANTS.filter((t) => t.enabled);

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
          const tenant = enabledTenants.find(
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

          if (options.risk !== undefined) {
            const history = generateDemoDeployHistory(tenant.tenantId);
            const analysis = driftAnalyzer.analyzeTenant(tenant, status, history);

            if (options.json) {
              console.log(JSON.stringify(analysis, null, 2));
              return;
            }

            displayTenantRiskAnalysis(analysis);
            return;
          }

          if (options.json) {
            console.log(
              JSON.stringify({ ...status, customizations: customizationResult }, null, 2)
            );
            return;
          }

          displayTenantStatus(status);

          // Show unmanaged customizations section
          displayCustomizationDetails(customizationResult);
          return;
        }

        // Fleet-wide view
        if (options.risk !== undefined) {
          const statuses = enabledTenants.map((t) => getDemoTenantVersionStatus(t.tenantId)!);
          const histories = new Map<string, TenantDeploymentHistory>();
          for (const t of enabledTenants) {
            histories.set(t.tenantId, generateDemoDeployHistory(t.tenantId));
          }
          const fleetAnalysis = driftAnalyzer.analyzeFleet(enabledTenants, statuses, histories);

          if (options.json) {
            console.log(JSON.stringify(fleetAnalysis, null, 2));
            return;
          }

          displayFleetRiskAnalysis(fleetAnalysis, options.risk);
          return;
        }

        // Fleet-wide summary (no risk)
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

          enabledTenants.forEach((tenant) => {
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

        console.log();
        console.log(chalk.gray("Tip: Use --risk to see risk scores and update recommendations"));

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

      // Risk analysis mode
      if (options.risk !== undefined) {
        // Build deployment history from Dataverse solution history
        const histories = new Map<string, TenantDeploymentHistory>();
        // TODO (#258): Query real deployment history per tenant for richer risk scoring.
        // For now, risk scoring works with version drift + tags (no deploy history).

        if (options.tenant && statuses.length === 1) {
          const analysis = driftAnalyzer.analyzeTenant(
            tenants[0],
            statuses[0],
            histories.get(tenants[0].tenantId)
          );

          if (options.json) {
            console.log(JSON.stringify(analysis, null, 2));
            return;
          }

          displayTenantRiskAnalysis(analysis);
          return;
        }

        const fleetAnalysis = driftAnalyzer.analyzeFleet(tenants, statuses, histories);

        if (options.json) {
          console.log(JSON.stringify(fleetAnalysis, null, 2));
          return;
        }

        displayFleetRiskAnalysis(fleetAnalysis, options.risk);
        return;
      }

      // Single tenant mode (no risk)
      if (options.tenant && statuses.length === 1) {
        const status = statuses[0];
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }
        displayTenantStatus(status);
        return;
      }

      // Fleet-wide summary (no risk)
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

// ============================================================================
// Risk analysis display helpers
// ============================================================================

function formatRiskLevel(level: string): string {
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

function formatRecommendation(rec: DriftRecommendation): string {
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

function displayTenantRiskAnalysis(analysis: TenantDriftAnalysis): void {
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

function displayFleetRiskAnalysis(fleet: FleetDriftAnalysis, riskFilter?: string | true): void {
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

// ============================================================================
// Demo mode deployment history generator
// ============================================================================

function generateDemoDeployHistory(tenantId: string): TenantDeploymentHistory {
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

// ============================================================================
// Non-risk display helpers
// ============================================================================

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

// ============================================================================
// Customization display helpers
// ============================================================================

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
