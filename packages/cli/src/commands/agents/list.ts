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
  DEMO_SOLUTIONS,
  loadConfig,
  TokenManager,
  DataverseClient,
  AgentResolver,
} from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { handleCommandError } from "../../lib/errors.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List agents and solutions in your source environment")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("--category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = createSpinner("Loading agents...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        let solutions = [...DEMO_SOLUTIONS];

        // Apply tag filter
        if (options.tag) {
          const tag = options.tag.toLowerCase();
          solutions = solutions.filter((s) => s.tags.some((t) => t.toLowerCase().includes(tag)));
        }

        // Apply category filter
        if (options.category) {
          const cat = options.category.toLowerCase();
          solutions = solutions.filter((s) => s.category.toLowerCase().includes(cat));
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

        solutions.forEach((solution) => {
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

      // Production mode - load config and query source environment
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      if (!config.source || !config.source.environmentUrl) {
        spinner.fail(chalk.red("Source environment not configured"));
        console.error(chalk.gray("\nConfigure a source environment in your config file:"));
        console.error(chalk.gray("  source:"));
        console.error(chalk.gray("    tenantId: <tenant-id>"));
        console.error(chalk.gray("    environmentUrl: <environment-url>"));
        process.exit(1);
      }

      spinner.text = "Authenticating...";
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

      spinner.text = "Querying agents from source environment...";
      const agentResolver = new AgentResolver(dataverseClient);
      const botsWithSolutions = await agentResolver.listBotsWithSolutions();

      spinner.succeed(`Found ${botsWithSolutions.length} agent(s)`);

      if (botsWithSolutions.length === 0) {
        console.log(chalk.gray("\nNo agents found in source environment."));
        console.log(
          chalk.gray("Agents (Copilots/bots) are discovered from the source environment.")
        );
        return;
      }

      // JSON output
      if (options.json) {
        console.log(JSON.stringify(botsWithSolutions, null, 2));
        return;
      }

      const table = new Table({
        head: ["Agent Name", "Bot ID", "Solution", "Status", "Last Modified"],
        style: { head: ["cyan"] },
      });

      botsWithSolutions.forEach(({ bot, solution }) => {
        const status = bot.statecode === 0 ? chalk.green("Active") : chalk.gray("Inactive");
        table.push([
          bot.name,
          bot.botid.slice(0, 8) + "...",
          solution?.uniquename || chalk.gray("(no solution)"),
          status,
          formatTimeAgo(bot.modifiedon),
        ]);
      });

      console.log();
      console.log(table.toString());
      console.log();
      console.log(chalk.gray(`Total: ${botsWithSolutions.length} agent(s) in source environment`));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load agents");
    }
  });
