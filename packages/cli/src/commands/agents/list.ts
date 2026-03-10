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
import { isDemoMode as isDemoModeCore, DEMO_SOLUTIONS } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";
import { formatTimeAgo } from "../../lib/formatters.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List all available agents/solutions")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("-c, --category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading agents...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

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

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to load agents"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
