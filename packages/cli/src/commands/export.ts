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
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import chalk from "chalk";
import { createSpinner } from "../lib/spinner.js";
import { loadConfig, TokenManager, DataverseClient, SolutionOperations } from "@agentsync/core";
import { isDemo } from "../lib/command-wrapper.js";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { handleCommandError } from "../lib/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const exportCommand = new Command("export")
  .description("Export a solution from your source environment as a zip file")
  .argument("[solution]", "Solution name (e.g., TestDeploy)")
  .option("-s, --solution <name>", "Solution name (alternative to argument)")
  .option("-o, --output <path>", "Output directory for the zip file", "./agent packages")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--unmanaged", "Export as unmanaged (default: managed)")
  .addHelpText("after", `
Examples:
  agentsync export TestDeploy                     Export as managed solution
  agentsync export TestDeploy --unmanaged         Export as unmanaged
  agentsync export TestDeploy -o ./my-exports     Export to custom directory
`)
  .action(async (solutionArg: string | undefined, options) => {
    if (solutionArg && !options.solution) options.solution = solutionArg;
    if (!options.solution) {
      console.error(chalk.red("Error: solution name required."));
      console.error(chalk.gray("  Example: agentsync export TestDeploy"));
      process.exit(2);
    }
    const spinner = createSpinner("Loading manifest...").start();

    try {
      // Check for demo mode
      if (isDemo()) {
        spinner.succeed("Demo mode - using sample agent package");
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        // Create output directory
        const outputDir = resolve(options.output);
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        // Copy demo solution
        const managed = !options.unmanaged;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const suffix = managed ? "managed" : "unmanaged";
        const outputPath = join(outputDir, `${options.solution}_${timestamp}_${suffix}.zip`);

        // Find demo solution (relative to CLI dist or source)
        const demoSolutionPath = join(
          __dirname,
          "../../demo-data/solutions/ProductQADemo_1_0_0_2_managed.zip"
        );

        if (existsSync(demoSolutionPath)) {
          copyFileSync(demoSolutionPath, outputPath);
        } else {
          // Fallback - create a simple message
          console.log(
            chalk.yellow("Note: Demo solution file not found, but in production this would create:")
          );
          console.log(chalk.cyan(`  ${outputPath}`));
        }

        console.log(chalk.bold("\n📦 Agent Package Packed:"));
        console.log(`  Agent:    ${chalk.green(options.solution)} (Demo)`);
        console.log(`  Version:  1.0.0.2`);
        console.log(`  Type:     ${managed ? "Managed" : "Unmanaged"}`);
        console.log(`  Package:  ${chalk.cyan(outputPath)}`);
        console.log();
        console.log(
          chalk.gray(`Use 'agentsync ship --solution ${outputPath} --all' to ship to your fleet`)
        );
        return;
      }

      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Manifest loaded");

      // Get client secret
      spinner.start("Authenticating with directory...");
      const clientSecret = await getClientSecretWithFallback();

      const tokenManager = new TokenManager({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: config.source.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);
      spinner.succeed("Connected to source directory");

      // Build output path
      const managed = !options.unmanaged;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const outputDir = resolve(options.output);

      // Create output directory if it doesn't exist
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = join(outputDir, `${options.solution}_${timestamp}_${suffix}.zip`);

      // Export solution
      spinner.start(`Packing solution '${options.solution}' into agent package...`);
      const metadata = await solutionOps.exportSolution(options.solution, {
        managed,
        outputPath,
      });

      spinner.succeed(
        `Agent package packed: ${chalk.green(metadata.friendlyName)} v${metadata.version}`
      );

      console.log();
      console.log(chalk.bold("Agent package Contents:"));
      console.log(`  Agent:    ${metadata.friendlyName}`);
      console.log(`  Version:  ${metadata.version}`);
      console.log(`  Type:     ${managed ? "Managed" : "Unmanaged"}`);
      console.log(`  Agent package:    ${chalk.cyan(outputPath)}`);
      console.log();
      console.log(
        chalk.gray(`Use 'agentsync ship --agent package ${outputPath}' to ship to your fleet`)
      );
    } catch (error) {
      handleCommandError(error, spinner, "Packing failed");
    }
  });
