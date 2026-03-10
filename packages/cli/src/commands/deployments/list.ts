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
import { getDeployments, filterDeployments, outputJson, outputTable } from "./helpers.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List deployments with optional filtering")
  .option("-s, --status <status>", "Filter by status (pending, in_progress, completed, failed)")
  .option("-t, --tenant <id>", "Filter by tenant ID or name")
  .option("-a, --agent <name>", "Filter by agent/solution name")
  .option("-l, --limit <n>", "Limit number of results", "20")
  .option("-o, --offset <n>", "Skip first N results", "0")
  .option("--since <date>", "Show deployments since date (ISO format or relative like '7d', '24h')")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading deployments...").start();

    try {
      // Get deployments (demo or production)
      let deployments = await getDeployments(options);

      // Apply filters
      deployments = filterDeployments(deployments, options);

      // Apply pagination
      const limit = parseInt(options.limit, 10);
      const offset = parseInt(options.offset, 10);
      const total = deployments.length;
      deployments = deployments.slice(offset, offset + limit);

      spinner.stop();

      // Output format
      if (options.json) {
        outputJson(deployments, total, limit, offset);
      } else {
        outputTable(deployments, total, limit, offset);
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load deployments"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
