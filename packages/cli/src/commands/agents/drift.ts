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

import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { createSpinner, isQuietMode } from "../../lib/spinner.js";
import {
  DEMO_TENANTS,
  getDemoVersionDriftSummary,
  getDemoTenantVersionStatus,
  loadConfig,
  TokenManager,
  DataverseClient,
  VersionChecker,
  DriftAnalyzer,
  TenantDeploymentHistory,
  getDemoUnmanagedCustomizations,
  getDemoCustomizationSummary,
} from "@agentsync/core";
import type { TenantVersionStatus } from "@agentsync/core";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { type DriftRiskLevel, riskLevelValue } from "./risk-calculator.js";
import { buildDriftFixPlan, type DriftFixResult } from "./fix-planner.js";
import {
  buildSummary,
  displayCustomizationDetails,
  displayCustomizationFleetSummary,
  displayFleetRiskAnalysis,
  displayFleetSummary,
  displayTenantRiskAnalysis,
  displayTenantStatus,
  generateDemoDeployHistory,
} from "./drift-analysis.js";

const driftAnalyzer = new DriftAnalyzer();

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
      await withDemoMode(
        async () => {
          spinner.stop();
          if (!isQuietMode()) {
            console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
          }

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
              const fixSpinner = createSpinner(`Updating ${entry.tenantName}...`).start();

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
        },
        async () => {
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
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to check version drift");
    }
  });
export { calculateDriftRisk } from "./risk-calculator.js";
export { buildDriftFixPlan } from "./fix-planner.js";
export type { DriftFixEntry, DriftFixResult } from "./fix-planner.js";
export type { DriftRiskLevel } from "./risk-calculator.js";
