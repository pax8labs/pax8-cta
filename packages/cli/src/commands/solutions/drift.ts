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
import { spawn } from "node:child_process";
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
  type FleetDriftAnalysis,
  type TenantDriftAnalysis,
} from "@agentsync/core";
import type { TenantVersionStatus } from "@agentsync/core";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { isInteractivePrompt, printRunningCommand } from "../../lib/picker.js";
import { question } from "../../lib/input.js";
import { resolveFormat, type OutputFormat } from "../../lib/output.js";
import { type DriftRiskLevel, riskLevelValue, formatRiskLevel } from "./risk-calculator.js";
import { buildDriftFixPlan, type DriftFixResult } from "./fix-planner.js";
import {
  buildAfterActionHint,
  buildSummary,
  displayCustomizationDetails,
  displayCustomizationFleetSummary,
  displayFleetRiskAnalysis,
  displayFleetSummary,
  displayTenantRiskAnalysis,
  displayTenantStatus,
  generateDemoDeployHistory,
  selectOutdated,
} from "./drift-analysis.js";

// ============================================================================
// Fleet drift risk row schema (issue #401)
// ----------------------------------------------------------------------------
// The fleet `--risk` view is the headline list-style output of the drift
// command. We expose it as a typed row so the JSON envelope is stable and
// machine-parseable for agent / pipeline callers, mirroring the Column<Row>
// pattern used by tenants/list.ts and tenants/health.ts.
// ============================================================================

interface DriftRow {
  tenantName: string;
  tenantId: string;
  score: number;
  risk: DriftRiskLevel;
  recommendation: string;
  topFactor: string;
}

function buildDriftRows(analyses: TenantDriftAnalysis[]): DriftRow[] {
  return analyses.map((a) => {
    const topFactor =
      a.factors.length > 0
        ? a.factors.filter((f) => f.level !== "low").sort((x, y) => y.weight - x.weight)[0]
            ?.description || "Minor risk"
        : "-";

    return {
      tenantName: a.tenantName,
      tenantId: a.tenantId,
      score: a.riskScore,
      risk: a.riskLevel,
      recommendation: a.recommendation,
      topFactor,
    };
  });
}

/**
 * Apply the same filter + ordering used by `displayFleetRiskAnalysis` so the
 * JSON envelope's `tenants[]` matches what the human-readable table shows.
 */
function shapeFleetForOutput(
  fleet: FleetDriftAnalysis,
  riskFilter: string | true | undefined
): TenantDriftAnalysis[] {
  let analyses = fleet.tenants;
  if (typeof riskFilter === "string") {
    const level = riskFilter.toLowerCase();
    analyses = analyses.filter((a) => a.riskLevel === level);
  }
  const recOrder: Record<string, number> = {
    do_not_update: 0,
    update_risky: 1,
    review_recommended: 2,
    safe_to_update: 3,
    current: 4,
  };
  return [...analyses].sort(
    (a, b) => (recOrder[a.recommendation] ?? 5) - (recOrder[b.recommendation] ?? 5)
  );
}

function emitFleetRiskJson(fleet: FleetDriftAnalysis, riskFilter: string | true | undefined): void {
  const ordered = shapeFleetForOutput(fleet, riskFilter);
  const envelope = {
    tenants: buildDriftRows(ordered),
    summary: fleet.summary,
  };
  console.log(JSON.stringify(envelope, null, 2));
}

const driftAnalyzer = new DriftAnalyzer();

export const driftCommand = new Command("drift")
  .description("Compare solution versions across tenants to find outdated deployments")
  .option("-a, --agent <name>", "Check specific agent only")
  .option("-t, --tenant <name>", "Check specific tenant only")
  .option("--outdated", "Show only outdated tenants")
  .option("--risk [level]", "Show risk analysis (optionally filter by: low, medium, high)")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output (exit code only)")
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
  solutions drift                           Show fleet-wide version drift summary
  solutions drift -t AgentSync-Test2        Check drift for a specific tenant
  solutions drift --outdated                Show only outdated tenants
  solutions drift --risk                    Show drift with risk scores
  solutions drift --risk high               Show only high-risk tenants
  solutions drift --fix                     Fix low-risk outdated tenants
  solutions drift --fix --force             Fix all outdated tenants
`
  )
  .action(async (options, cmd) => {
    // Merge local opts with globals so root-level `--json` / `--quiet`
    // (`agentsync --json solutions drift ...`) reach this command. Then
    // resolve the effective output format up-front so every branch below
    // can branch on a single `fmt` value (issue #401).
    const merged = { ...options, ...cmd.optsWithGlobals() };
    const fmt: OutputFormat = resolveFormat({
      json: !!merged.json,
      quiet: !!merged.quiet,
    });
    // Back-compat shim for the after-action helper, which only inspects
    // `options.json`. Treat `fmt === "json"` as "JSON requested" so piped
    // (non-TTY) callers also suppress the picker chrome.
    const jsonOutput = fmt === "json" || fmt === "quiet";
    options = { ...options, json: jsonOutput };

    const spinner = createSpinner("Checking version drift...").start();

    try {
      await withDemoMode(
        async () => {
          spinner.stop();
          if (fmt === "table") {
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

            if (fmt === "json") {
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

              if (fmt === "json") {
                console.log(JSON.stringify(analysis, null, 2));
                return;
              }
              if (fmt === "quiet") return;

              displayTenantRiskAnalysis(analysis);
              return;
            }

            if (fmt === "json") {
              console.log(
                JSON.stringify({ ...status, customizations: customizationResult }, null, 2)
              );
              return;
            }
            if (fmt === "quiet") return;

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

            if (fmt === "json") {
              emitFleetRiskJson(fleetAnalysis, options.risk);
              return;
            }
            if (fmt === "quiet") return;

            displayFleetRiskAnalysis(fleetAnalysis, options.risk);
            await afterDriftReport(
              fleetAnalysis,
              { ...options, json: jsonOutput },
              /* isDemo */ true
            );
            return;
          }

          // Fleet-wide summary (no risk)
          const summary = getDemoVersionDriftSummary();
          const customizationSummary = getDemoCustomizationSummary("CustomerServiceAgent");

          if (fmt === "json") {
            console.log(
              JSON.stringify({ ...summary, customizations: customizationSummary }, null, 2)
            );
            return;
          }
          if (fmt === "quiet") return;

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

              if (fmt === "json") {
                console.log(JSON.stringify(analysis, null, 2));
                return;
              }
              if (fmt === "quiet") return;

              displayTenantRiskAnalysis(analysis);
              return;
            }

            const fleetAnalysis = driftAnalyzer.analyzeFleet(tenants, statuses, histories);

            if (fmt === "json") {
              emitFleetRiskJson(fleetAnalysis, options.risk);
              return;
            }
            if (fmt === "quiet") return;

            displayFleetRiskAnalysis(fleetAnalysis, options.risk);
            await afterDriftReport(
              fleetAnalysis,
              { ...options, json: jsonOutput },
              /* isDemo */ false
            );
            return;
          }

          // Single tenant mode (no risk)
          if (options.tenant && statuses.length === 1) {
            const status = statuses[0];
            if (fmt === "json") {
              console.log(JSON.stringify(status, null, 2));
              return;
            }
            if (fmt === "quiet") return;
            displayTenantStatus(status);
            return;
          }

          // Fleet-wide summary (no risk)
          const summary = buildSummary(statuses, expectedSolutions);

          if (fmt === "json") {
            console.log(JSON.stringify(summary, null, 2));
            return;
          }
          if (fmt === "quiet") return;

          displayFleetSummary(summary, options, tenants, statuses, checker, expectedSolutions);
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to check version drift");
    }
  });

// ============================================================================
// After-action hint + picker (issue #377)
// ----------------------------------------------------------------------------
// Mirrors the analyze → test-deploy nudge from `analyze.ts`. The drift report
// already lists outdated tenants and their risk; the missing piece was a hint
// telling the user *what to do next* and an interactive picker that runs the
// suggested command. We reuse `isInteractivePrompt` / `printRunningCommand`
// from `lib/picker.ts` so `--json`, `--quiet`, and non-TTY callers never
// hang. The picker is hand-rolled (rather than `pickFromList`) because we
// need an extra non-numeric "F = fix all" option.
// ============================================================================

interface DriftAfterActionOptions {
  json?: boolean;
  fix?: boolean;
  agent?: string;
}

/**
 * Pick a stable label for the solution we'd suggest the user act on. Drift
 * is per-fleet today, so when the user didn't scope with `-a/--agent` we try
 * to learn it from the analysis (the riskiest tenant's first outdated
 * solution) and otherwise fall back to `<solution>` so the printed hint is
 * still readable as a template.
 */
function resolveSolutionLabel(fleet: FleetDriftAnalysis, options: DriftAfterActionOptions): string {
  if (options.agent && options.agent.trim().length > 0) {
    return options.agent;
  }
  for (const t of fleet.tenants) {
    const first = t.outdatedSolutions[0];
    if (first?.uniqueName) return first.uniqueName;
  }
  return "<solution>";
}

/**
 * Sort outdated tenants for display: highest risk score first, ties broken
 * alphabetically so the picker is deterministic across runs.
 */
function sortOutdated(outdated: TenantDriftAnalysis[]): TenantDriftAnalysis[] {
  return [...outdated].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return a.tenantName.localeCompare(b.tenantName);
  });
}

function maxVersionDrift(t: TenantDriftAnalysis): number {
  if (t.outdatedSolutions.length === 0) return 0;
  return Math.max(...t.outdatedSolutions.map((s) => Math.abs(s.versionDrift)));
}

async function afterDriftReport(
  fleet: FleetDriftAnalysis,
  options: DriftAfterActionOptions,
  isDemo: boolean
): Promise<void> {
  // --json and --quiet suppress all post-report chrome: callers rely on a
  // clean machine-parseable stream (or no stream at all).
  if (options.json) return;
  if (isQuietMode()) return;

  const outdated = selectOutdated(fleet);
  const solutionLabel = resolveSolutionLabel(fleet, options);

  // Hint always renders (including the "fleet is current" case) — it's the
  // discoverable nudge at the bottom of the report.
  const hint = buildAfterActionHint(outdated, solutionLabel);
  console.log();
  console.log(chalk.gray(hint));

  // Picker only fires when we have something to act on, the caller is a real
  // human in a TTY, and they didn't already pass `--fix` (we don't want to
  // double-prompt for an explicit fix run).
  if (outdated.length === 0) return;
  if (options.fix) return;
  if (!isInteractivePrompt({ json: options.json })) return;

  await promptDriftPicker(sortOutdated(outdated), solutionLabel, isDemo);
}

async function promptDriftPicker(
  outdated: TenantDriftAnalysis[],
  solutionLabel: string,
  isDemo: boolean
): Promise<void> {
  console.log();
  console.log(chalk.cyan("Update an outdated tenant now? Pick:"));

  // Pad tenant names so the [risk — N versions behind] hint lines up.
  const widest = outdated.reduce((m, t) => Math.max(m, t.tenantName.length), 0);

  outdated.forEach((t, i) => {
    const drift = maxVersionDrift(t);
    const driftLabel = drift === 1 ? "1 version behind" : `${drift} versions behind`;
    const riskLabel = formatRiskLevel(t.riskLevel).padEnd(4);
    const padded = t.tenantName.padEnd(widest);
    console.log(`  ${i + 1}) ${padded}  ${chalk.gray(`[${riskLabel} — ${driftLabel}]`)}`);
  });
  console.log(`  ${chalk.bold("F")}) fix all outdated (runs solutions drift --fix)`);
  console.log(chalk.gray("  0) skip"));

  const answer = (await question(chalk.cyan("> "))).trim();
  if (answer === "" || answer === "0") return;

  if (answer.toLowerCase() === "f") {
    printRunningCommand(["solutions", "drift", "--fix"]);
    await runDriftFix(isDemo);
    return;
  }

  const choice = parseInt(answer, 10);
  if (!Number.isInteger(choice) || choice < 1 || choice > outdated.length) return;

  const target = outdated[choice - 1];
  printRunningCommand(["deploy", solutionLabel, "--tenant", target.tenantName]);
  await runDeploy(solutionLabel, target.tenantName, isDemo);
}

function spawnSelf(args: string[], isDemo: boolean): Promise<void> {
  // Mirrors `runDeploy` in analyze.ts: re-invoke the same CLI binary as a
  // child process so the spawned command gets its own commander parse and
  // we don't tangle commander state with the active drift run. stdin is
  // ignored — neither deploy nor `drift --fix` need user input in this
  // post-report flow (and `--fix` defaults to confirm-prompted, but the user
  // can re-run with `--yes` themselves if they want non-interactive).
  return new Promise((resolveSpawn, reject) => {
    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    const spawnArgs = isBundled ? args : [process.argv[1], ...args];
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (isDemo) env.DEMO_MODE = "true";
    const proc = spawn(process.execPath, spawnArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      env,
    });
    proc.on("close", () => resolveSpawn());
    proc.on("error", reject);
  });
}

async function runDeploy(solution: string, tenantName: string, isDemo: boolean): Promise<void> {
  return spawnSelf(["deploy", solution, "--tenant", tenantName], isDemo);
}

async function runDriftFix(isDemo: boolean): Promise<void> {
  return spawnSelf(["solutions", "drift", "--fix"], isDemo);
}

export { buildAfterActionHint } from "./drift-analysis.js";
export { calculateDriftRisk } from "./risk-calculator.js";
export { buildDriftFixPlan } from "./fix-planner.js";
export type { DriftFixEntry, DriftFixResult } from "./fix-planner.js";
export type { DriftRiskLevel } from "./risk-calculator.js";
