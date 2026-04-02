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
import { createSpinner } from "../../lib/spinner.js";
import { withDemoMode } from "../../lib/command-wrapper.js";
import {
  getDeployments,
  filterDeployments,
  getDeploymentHistory,
  filterHistory,
  outputJson,
  outputTable,
  outputHistoryJson,
  outputHistoryTable,
} from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List solution import history across your environments")
  .option("-s, --status <status>", "Filter by status (completed, failed, in_progress)")
  .option("-t, --tenant <name>", "Filter by tenant name")
  .option("-a, --agent <name>", "Filter by solution name")
  .option("-l, --limit <n>", "Limit number of results", "20")
  .option("-o, --offset <n>", "Skip first N results", "0")
  .option("--since <date>", "Show history since date (ISO format or relative like '7d', '24h')")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    `
Examples:
  agentsync deployments list                          Show recent import history
  agentsync deployments list -t AgentSync-Test2       History for a specific tenant
  agentsync deployments list -a TestDeploy            History for a specific solution
  agentsync deployments list --since 7d               Imports in the last 7 days
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Loading deployment history...").start();

    try {
      await withDemoMode(
        async () => {
          // Demo mode — use mock data
          let deployments = await getDeployments(options);
          deployments = filterDeployments(deployments, options);

          const limit = parseInt(options.limit, 10);
          const offset = parseInt(options.offset, 10);
          const total = deployments.length;
          deployments = deployments.slice(offset, offset + limit);

          spinner.stop();

          if (options.json) {
            outputJson(deployments, total, limit, offset);
          } else {
            outputTable(deployments, total, limit, offset);
          }
        },
        async () => {
          // Production mode — query Dataverse solution history
          let entries = await getDeploymentHistory(options);
          entries = filterHistory(entries, options);

          const limit = parseInt(options.limit, 10);
          const offset = parseInt(options.offset, 10);
          const total = entries.length;
          entries = entries.slice(offset, offset + limit);

          spinner.stop();

          if (options.json) {
            outputHistoryJson(entries, total, limit, offset);
          } else {
            outputHistoryTable(entries, total, limit, offset);
          }
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load deployment history");
    }
  });
