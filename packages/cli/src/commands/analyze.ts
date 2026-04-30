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
import chalk from "chalk";
import { createSpinner, formatCommandExample } from "../lib/spinner.js";
import Table from "cli-table3";
import { riskAnalyzer, type RiskAnalysis, type DeploymentContext } from "@agentsync/core";
import { withResolvedDestinations } from "../lib/command-wrapper.js";
import { handleCommandError } from "../lib/errors.js";

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
  agentsync analyze TestDeploy                    Analyze risk across all tenants
  agentsync analyze TestDeploy --tag production   Analyze production tenants only
  agentsync analyze ./TestDeploy.zip              Analyze a pre-exported zip
`
  )
  .action(async (solutionArg: string | undefined, options) => {
    const spinner = createSpinner("Loading configuration...").start();

    // Allow solution as positional arg or --solution flag
    if (solutionArg && !options.solution) {
      options.solution = solutionArg;
    }

    if (!options.solution) {
      spinner.fail(chalk.red("Solution name or path required."));
      console.error(chalk.gray("  Example: " + formatCommandExample("analyze TestDeploy")));
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
          console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing simulated analysis\n"));

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

          const context: DeploymentContext = {
            tenants: destinations.map((t) => ({
              id: t.tenantId,
              name: t.name,
              environmentUrl: t.environmentUrl,
              tags: t.tags,
            })),
            solutionFile: options.agentPackage || options.solution,
            isProduction: destinations.some((t) => t.tags?.includes("production")),
          };

          const analysis = await riskAnalyzer.analyze(context);
          spinner.succeed(chalk.green("Risk analysis complete"));
          console.log();

          displayAnalysis(analysis, destinations.length, options.json);
        },
        async ({ destinations }) => {
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

          const context: DeploymentContext = {
            tenants: destinations.map((t) => ({
              id: t.tenantId,
              name: t.name,
              environmentUrl: t.environmentUrl,
              tags: t.tags,
            })),
            solutionFile: agentPackagePath,
            isProduction: destinations.some((t) => t.tags?.includes("production")),
          };

          const analysis = await riskAnalyzer.analyze(context);
          spinner.succeed(chalk.green("Risk analysis complete"));
          console.log();

          displayAnalysis(analysis, destinations.length, options.json);
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Risk analysis failed");
    }
  });

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

  console.log(chalk.bold("📊 Overall Assessment"));
  console.log("─".repeat(70));
  console.log(`  Risk Score:           ${scoreColor(analysis.score.toUpperCase())}`);
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
    console.log(chalk.gray("Next step: " + formatCommandExample("deploy <solution> --all")));
  } else {
    console.log(
      chalk.gray(
        `Fix the blockers listed above, then run '${formatCommandExample("analyze")}' again`
      )
    );
  }
  console.log();
}
