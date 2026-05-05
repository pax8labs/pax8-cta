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
import chalk from "chalk";
import { createSpinner, isQuietMode } from "../lib/spinner.js";
import Table from "cli-table3";
import {
  riskAnalyzer,
  DEMO_TENANTS,
  DEMO_SOLUTIONS,
  WaveService,
  confidenceQualifierLabel,
  type RiskAnalysis,
  type DeploymentContext,
  type TenantConfig,
} from "@agentsync/core";
import { withResolvedDestinations } from "../lib/command-wrapper.js";
import { CliError, handleCommandError } from "../lib/errors.js";
import { isInteractivePrompt, pickFromList, printRunningCommand } from "../lib/picker.js";
import { showDemoBanner } from "../lib/demo-banner.js";

// Risk issue severity colors
const SEVERITY_COLORS = {
  critical: chalk.red,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
};

const SEVERITY_ICONS = {
  critical: "🚫",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

export const analyzeCommand = new Command("analyze")
  .description("Analyze deployment risk for a solution across your tenants")
  .argument("[solution]", "Solution name (e.g., TestDeploy) or path to solution zip file")
  .option("-s, --solution <path>", "Solution name or path to zip (alternative to argument)")
  .option("--agentPackage <path>", "Alias for --solution")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Analyze only tenants with these tags")
  .option("--all", "Analyze all tenants (default when no --tag specified)")
  .option("--json", "Output results as JSON")
  .addHelpText(
    "after",
    `
Examples:
  analyze TestDeploy                    Analyze risk across all tenants
  analyze TestDeploy --tag production   Analyze production tenants only
  analyze ./TestDeploy.zip              Analyze a pre-exported zip
`
  )
  .action(async (solutionArg: string | undefined, options, cmd) => {
    const spinner = createSpinner("Loading configuration...").start();

    // Merge global options (--json may be consumed by root program in Commander v12)
    const allOpts = cmd.optsWithGlobals();
    const jsonOutput = !!(allOpts.json || options.json);

    // Allow solution as positional arg or --solution flag
    if (solutionArg && !options.solution) {
      options.solution = solutionArg;
    }

    if (!options.solution) {
      spinner.fail(chalk.red("Solution name or path required."));
      if (!isQuietMode()) {
        console.error(chalk.gray("  Example: analyze TestDeploy"));
      }
      process.exit(2);
    }

    // Default to --all if no tag filter specified
    if (!options.all && (!options.tag || options.tag.length === 0)) {
      options.all = true;
    }

    try {
      await withResolvedDestinations(
        options,
        async (destinations) => {
          spinner.succeed("Demo fleet manifest loaded");
          if (!isQuietMode()) {
            showDemoBanner();
          }

          // Validate the solution argument against the demo catalog before we
          // run a synthetic risk analysis. Without this, demo mode happily
          // analyzes typo'd solution names (e.g. "CusteomrServiceAgent") and
          // prints a confident "READY TO DEPLOY" verdict — which is dangerous
          // during demos where a typo is the whole point of the exercise.
          // Mirrors the deploy fix in #379. ZIP path inputs ("./foo.zip")
          // still pretend-bypass without file existence checks (the existing
          // demo contract for paths).
          const solutionInput: string = options.agentPackage || options.solution;
          const isFilePath = solutionInput.endsWith(".zip");
          if (!isFilePath) {
            const knownDemoNames = DEMO_SOLUTIONS.map((sol) => sol.uniqueName);
            // Case-sensitive match — the CLI is case-sensitive about solution
            // names elsewhere (export/import use the uniqueName verbatim).
            if (!knownDemoNames.includes(solutionInput)) {
              const preview = knownDemoNames.slice(0, 5);
              const lines = [
                `Solution '${solutionInput}' not found in the demo catalog.`,
                "Available demo solutions:",
                ...preview.map((name) => `  - ${name}`),
                "Run 'solutions list' to see all available demo solutions.",
              ];
              throw new CliError(lines.join("\n"));
            }
          }

          if (destinations.length === 0) {
            spinner.fail(chalk.red("No destinations matched the selection criteria"));
            process.exit(1);
          }

          // Display destinations
          console.log(chalk.bold(`📊 Analyzing Risk for ${destinations.length} Destinations`));
          console.log();

          const table = new Table({
            head: ["Destination", "Tenant ID", "Port", "Tags"],
            style: { head: ["cyan"] },
          });

          destinations.forEach((tenant) => {
            table.push([
              tenant.name,
              tenant.tenantId.slice(0, 8) + "...",
              new URL(tenant.environmentUrl).hostname,
              tenant.tags?.join(", ") || "-",
            ]);
          });

          console.log(table.toString());
          console.log();

          // Run risk analysis directly via core
          spinner.start("Running risk analysis...");

          // Demo mode has no Config to draw waves from. Use a single wave
          // with the documented default parallelism (DEFAULT_MAX_PARALLEL=5)
          // so the duration estimate models real deploys, not a sequential
          // pessimization. Mirrors what `deploy --all` does at runtime when
          // no waves are configured.
          const context: DeploymentContext = {
            tenants: destinations.map((t) => ({
              id: t.tenantId,
              name: t.name,
              environmentUrl: t.environmentUrl,
              tags: t.tags,
            })),
            solutionFile: options.agentPackage || options.solution,
            isProduction: destinations.some((t) => t.tags?.includes("production")),
            maxParallel: 5,
          };

          const analysis = await riskAnalyzer.analyze(context);
          spinner.succeed(chalk.green("Risk analysis complete"));
          console.log();

          displayAnalysis(analysis, destinations.length, jsonOutput);

          if (analysis.canProceed) {
            await maybePromptTestDeploy({
              solution: options.agentPackage || options.solution,
              fullFleet: DEMO_TENANTS,
              isDemo: true,
              json: jsonOutput,
            });
          }
        },
        async ({ config, destinations }) => {
          spinner.succeed("Manifest loaded");

          if (destinations.length === 0) {
            spinner.fail(chalk.red("No destinations matched the selection criteria"));
            process.exit(1);
          }

          // Display destinations
          console.log();
          console.log(chalk.bold(`📊 Analyzing Risk for ${destinations.length} Destinations:`));

          const table = new Table({
            head: ["Destination", "Tenant ID", "Port", "Tags"],
            style: { head: ["cyan"] },
          });

          destinations.forEach((tenant) => {
            table.push([
              tenant.name,
              tenant.tenantId.slice(0, 8) + "...",
              new URL(tenant.environmentUrl).hostname,
              tenant.tags?.join(", ") || "-",
            ]);
          });

          console.log(table.toString());
          console.log();

          // Run risk analysis directly via core
          spinner.start("Running risk analysis...");

          const agentPackagePath = options.agentPackage || options.solution;

          // Plumb the actual wave plan through so the duration estimate
          // matches what `deploy` will run. Mirrors `deploy.ts`'s
          // `runDryRunPreview` flow.
          const waveService = new WaveService();
          const waves = waveService.createExecutionPlan(config, destinations);

          const context: DeploymentContext = {
            tenants: destinations.map((t) => ({
              id: t.tenantId,
              name: t.name,
              environmentUrl: t.environmentUrl,
              tags: t.tags,
            })),
            solutionFile: agentPackagePath,
            isProduction: destinations.some((t) => t.tags?.includes("production")),
            waves,
          };

          const analysis = await riskAnalyzer.analyze(context);
          spinner.succeed(chalk.green("Risk analysis complete"));
          console.log();

          displayAnalysis(analysis, destinations.length, jsonOutput);

          if (analysis.canProceed) {
            await maybePromptTestDeploy({
              solution: agentPackagePath,
              fullFleet: config.tenants,
              isDemo: false,
              json: jsonOutput,
            });
          }
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Risk analysis failed");
    }
  });

interface TestDeployPromptOptions {
  solution: string;
  fullFleet: TenantConfig[];
  isDemo: boolean;
  json: boolean;
}

/**
 * Offer to run a test deploy on a tenant tagged "test" right after a successful
 * analysis. Skipped when output is non-interactive (--json, --quiet, non-TTY)
 * so scripts and pipelines never hang waiting for input.
 */
async function maybePromptTestDeploy(opts: TestDeployPromptOptions): Promise<void> {
  const interactive = isInteractivePrompt({ json: opts.json });
  if (!interactive) return;

  const testTenants = opts.fullFleet.filter((t) => t.enabled && t.tags?.includes("test"));
  if (testTenants.length === 0) return;

  // pickFromList collapses to a y/N confirm when the list has one item, so the
  // single-test-tenant case and the multi-test-tenant case share one code path.
  const target = await pickFromList(testTenants, {
    prompt: "Try a test deploy first?",
    label: (t) => t.name,
    hint: (t) => (t.tags?.length ? t.tags.join(", ") : undefined),
    isInteractive: interactive,
  });
  if (!target) return;

  printRunningCommand(["deploy", opts.solution, "--tenant", target.name]);

  await runDeploy(opts.solution, target.name, opts.isDemo);
}

async function runDeploy(solution: string, tenantName: string, isDemo: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["deploy", solution, "--tenant", tenantName];
    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    const spawnArgs = isBundled ? args : [process.argv[1], ...args];
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (isDemo) env.DEMO_MODE = "true";
    // stdin ignored so the subprocess doesn't fight with the parent REPL's
    // shared readline; deploy doesn't need interactive input in the
    // analyze → test-deploy flow.
    const proc = spawn(process.execPath, spawnArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      env,
    });
    proc.on("close", () => resolve());
    proc.on("error", reject);
  });
}

function displayAnalysis(analysis: RiskAnalysis, tenantCount: number, jsonOutput: boolean) {
  if (jsonOutput) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  // Overall summary
  const scoreColor =
    analysis.score === "critical" || analysis.score === "high"
      ? chalk.red
      : analysis.score === "medium"
        ? chalk.yellow
        : chalk.green;

  console.log(chalk.bold("═".repeat(70)));
  console.log(chalk.bold.cyan("                         RISK ANALYSIS REPORT"));
  console.log(chalk.bold("═".repeat(70)));
  console.log();

  // Surface the confidence qualifier next to the risk score so users see
  // "LOW (limited data)" or "HIGH (high confidence)" rather than treating
  // every risk score as equally trustworthy.
  const qualifierLabel = confidenceQualifierLabel(analysis.confidenceQualifier);
  const scoreLabel = `${analysis.score.toUpperCase()} (${qualifierLabel})`;

  console.log(chalk.bold("📊 Overall Assessment"));
  console.log("─".repeat(70));
  console.log(`  Risk Score:           ${scoreColor(scoreLabel)}`);
  console.log(`  Confidence:           ${analysis.confidence}%`);
  console.log(`  Success Probability:  ${analysis.successProbability}%`);
  console.log(
    `  Estimated Duration:   ${analysis.estimatedDuration.min}-${analysis.estimatedDuration.max} minutes`
  );
  console.log(
    `  Can Proceed:          ${analysis.canProceed ? chalk.green("YES") : chalk.red("NO")}`
  );
  console.log(
    `  Requires Approval:    ${analysis.requiresApproval ? chalk.yellow("YES") : chalk.green("NO")}`
  );
  console.log(`  Analyzed Tenants:     ${tenantCount}`);
  console.log();

  // Blockers
  if (analysis.blockers.length > 0) {
    console.log(chalk.bold.red(`🚫 BLOCKERS (${analysis.blockers.length})`));
    console.log(chalk.red("─".repeat(70)));
    console.log(chalk.red("These issues prevent deployment and MUST be fixed first:"));
    console.log();

    analysis.blockers.forEach((blocker, idx) => {
      console.log(chalk.red(`${idx + 1}. ${blocker.message}`));
      if (blocker.affectedTenants && blocker.affectedTenants.length > 0) {
        console.log(chalk.gray(`   Affected: ${blocker.affectedTenants.join(", ")}`));
      }
      if (blocker.resolution) {
        console.log(chalk.yellow(`   💡 ${blocker.resolution}`));
      }
      if (blocker.link) {
        console.log(chalk.blue(`   🔗 ${blocker.link}`));
      }
      console.log();
    });
  }

  // Critical & Error Issues
  const criticalIssues = analysis.issues.filter(
    (i) => i.severity === "critical" || i.severity === "error"
  );
  if (criticalIssues.length > 0 && analysis.blockers.length === 0) {
    console.log(chalk.bold.red(`❌ CRITICAL ISSUES (${criticalIssues.length})`));
    console.log(chalk.red("─".repeat(70)));

    criticalIssues.forEach((issue, idx) => {
      const icon = SEVERITY_ICONS[issue.severity];
      const colorFn = SEVERITY_COLORS[issue.severity];
      console.log(colorFn(`${icon} ${idx + 1}. ${issue.message}`));
      if (issue.affectedTenants && issue.affectedTenants.length > 0) {
        console.log(chalk.gray(`   Affected: ${issue.affectedTenants.join(", ")}`));
      }
      if (issue.resolution) {
        console.log(chalk.yellow(`   💡 ${issue.resolution}`));
      }
    });
    console.log();
  }

  // Warnings
  const warnings = analysis.issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    console.log(chalk.bold.yellow(`⚠️  WARNINGS (${warnings.length})`));
    console.log(chalk.yellow("─".repeat(70)));

    warnings.forEach((warning, idx) => {
      console.log(chalk.yellow(`${idx + 1}. ${warning.message}`));
      if (warning.affectedTenants && warning.affectedTenants.length > 0) {
        console.log(chalk.gray(`   Affected: ${warning.affectedTenants.join(", ")}`));
      }
      if (warning.resolution) {
        console.log(chalk.gray(`   💡 ${warning.resolution}`));
      }
    });
    console.log();
  }

  // Info
  const infos = analysis.issues.filter((i) => i.severity === "info");
  if (infos.length > 0) {
    console.log(chalk.bold.blue(`ℹ️  INFORMATION (${infos.length})`));
    console.log(chalk.blue("─".repeat(70)));

    infos.forEach((info, idx) => {
      console.log(chalk.blue(`${idx + 1}. ${info.message}`));
    });
    console.log();
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    console.log(chalk.bold.cyan("💡 RECOMMENDATIONS"));
    console.log(chalk.cyan("─".repeat(70)));

    analysis.recommendations.forEach((rec, idx) => {
      console.log(chalk.cyan(`${idx + 1}. ${rec}`));
    });
    console.log();
  }

  // Per-tenant breakdown — gives operators a fast scan over which
  // tenants are driving the aggregate risk.
  if (analysis.perTenantBreakdown && analysis.perTenantBreakdown.length > 0) {
    console.log(chalk.bold("🏢 PER-TENANT BREAKDOWN"));
    console.log("─".repeat(70));
    const breakdownTable = new Table({
      head: ["Tenant", "Risk", "Top Factor"],
      style: { head: ["cyan"] },
      colWidths: [28, 10, 32],
      wordWrap: true,
    });
    for (const row of analysis.perTenantBreakdown) {
      const rowColor =
        row.score === "critical" || row.score === "high"
          ? chalk.red
          : row.score === "medium"
            ? chalk.yellow
            : chalk.green;
      const factor = row.topFactor
        ? `[${row.topFactor.severity}] ${row.topFactor.message}`
        : "no issues";
      breakdownTable.push([row.tenantName, rowColor(row.score.toUpperCase()), factor]);
    }
    console.log(breakdownTable.toString());
    console.log();
  }

  // Final verdict
  console.log(chalk.bold("═".repeat(70)));
  if (analysis.canProceed) {
    if (analysis.blockers.length === 0 && criticalIssues.length === 0 && warnings.length === 0) {
      console.log(chalk.bold.green("✅ READY TO DEPLOY"));
      console.log(chalk.green("All checks passed. You can proceed with deployment."));
    } else {
      console.log(chalk.bold.yellow("⚠️  PROCEED WITH CAUTION"));
      console.log(chalk.yellow("Deployment can proceed, but there are warnings to consider."));
    }
  } else {
    console.log(chalk.bold.red("❌ DEPLOYMENT BLOCKED"));
    console.log(chalk.red(`Fix ${analysis.blockers.length} blocker(s) before proceeding.`));
  }
  console.log(chalk.bold("═".repeat(70)));
  console.log();

  // Next steps
  if (analysis.canProceed) {
    console.log(chalk.gray("Next step: deploy <solution> --all"));
  } else {
    console.log(chalk.gray("Fix the blockers listed above, then run 'analyze' again"));
  }
  console.log();
}
