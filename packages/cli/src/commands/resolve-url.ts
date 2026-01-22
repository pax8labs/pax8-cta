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
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  AgentResolver,
} from "@agentsync/core";

export const resolveUrlCommand = new Command("resolve-url")
  .description("Resolve an M365 agent URL and export the containing solution")
  .requiredOption("-u, --url <url>", "M365 agent URL (e.g., https://m365.cloud.microsoft/chat/?titleId=...)")
  .option("-o, --output <path>", "Output directory for the solution", "./agent packages")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--unmanaged", "Export as unmanaged solution (default: managed)")
  .option("--list-bots", "List all bots in the environment instead of resolving")
  .option("--dry-run", "Parse URL and show info without exporting")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Configuration loaded");

      // Authenticate
      spinner.start("Authenticating...");
      const clientSecret = getClientSecret();

      const tokenManager = new TokenManager({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: config.source.environmentUrl,
        tokenManager,
      });

      const resolver = new AgentResolver(dataverseClient);
      spinner.succeed("Connected to source environment");

      // List bots mode
      if (options.listBots) {
        spinner.start("Fetching bots...");
        const botsWithSolutions = await resolver.listBotsWithSolutions();
        spinner.succeed(`Found ${botsWithSolutions.length} bot(s)`);

        console.log();
        const table = new Table({
          head: ["Bot Name", "Bot ID", "Solution", "Status", "Modified"],
          style: { head: ["cyan"] },
        });

        for (const { bot, solution } of botsWithSolutions) {
          table.push([
            bot.name || "(unnamed)",
            bot.botid.slice(0, 8) + "...",
            solution?.uniquename || chalk.gray("(no solution)"),
            bot.statecode === 0 ? chalk.green("Active") : chalk.gray("Inactive"),
            new Date(bot.modifiedon).toLocaleDateString(),
          ]);
        }

        console.log(table.toString());
        return;
      }

      // Parse URL
      spinner.start("Parsing agent URL...");
      const parsed = resolver.parseAgentUrl(options.url);
      spinner.succeed("URL parsed");

      console.log();
      console.log(chalk.bold("Parsed URL Info:"));
      console.log(`  Title ID:     ${chalk.cyan(parsed.titleId)}`);
      console.log(`  Prefix:       ${parsed.prefix || "(none)"}`);
      console.log(`  Possible Bot: ${parsed.possibleBotId || "(not a direct GUID)"}`);
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not resolving or exporting"));
        return;
      }

      // Resolve to solution
      spinner.start("Resolving agent to solution...");
      const resolved = await resolver.resolveUrlToSolution(options.url);
      spinner.succeed("Agent resolved");

      console.log(chalk.bold("Resolved Agent:"));
      console.log(`  Bot Name:     ${chalk.green(resolved.bot.name)}`);
      console.log(`  Bot ID:       ${resolved.bot.botid}`);
      console.log(`  Solution:     ${chalk.cyan(resolved.solution.uniquename)}`);
      console.log(`  Version:      ${resolved.solution.version}`);
      console.log(`  Managed:      ${resolved.solution.ismanaged ? "Yes" : "No"}`);
      console.log();

      // Export solution
      const solutionOps = new SolutionOperations(dataverseClient);
      const managed = !options.unmanaged;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const outputDir = resolve(options.output);
      const outputPath = `${outputDir}/${resolved.solution.uniquename}_${timestamp}_${suffix}.zip`;

      spinner.start(`Exporting solution '${resolved.solution.uniquename}'...`);
      const metadata = await solutionOps.exportSolution(resolved.solution.uniquename, {
        managed,
        outputPath,
      });
      spinner.succeed(`Solution exported: ${chalk.green(metadata.friendlyName)} v${metadata.version}`);

      console.log();
      console.log(chalk.bold("Export Complete:"));
      console.log(`  Solution:  ${metadata.friendlyName}`);
      console.log(`  Version:   ${metadata.version}`);
      console.log(`  Type:      ${managed ? "Managed" : "Unmanaged"}`);
      console.log(`  Output:    ${chalk.cyan(outputPath)}`);
      console.log();
      console.log(
        chalk.gray(`Use 'agentsync ship --agent package ${outputPath}' to deploy to your fleet`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
