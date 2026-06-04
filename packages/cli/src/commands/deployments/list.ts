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
  resolveDeploymentFormat,
  type HistoryEntry,
} from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";
import { output } from "../../lib/output.js";

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
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  deployments list                          Show recent import history
  deployments list -t Pax8CTA-Test2       History for a specific tenant
  deployments list -a TestDeploy            History for a specific solution
  deployments list --since 7d               Imports in the last 7 days
  deployments list --ids-only | xargs -I{} deployments show {}
`
  )
  .action(async (options, cmd) => {
    // Merge local options with global flags (e.g. --ids-only from root program)
    const opts = { ...options, ...cmd.optsWithGlobals() };
    const spinner = createSpinner("Loading deployment history...").start();

    try {
      await withDemoMode(
        async () => {
          // Demo mode — use mock data
          let deployments = await getDeployments(opts);
          deployments = filterDeployments(deployments, opts);

          // parseInt(undefined, 10) is NaN, and slice(NaN, NaN+limit) returns
          // []. The Commander option defaults ("20"/"0") cover normal CLI
          // invocations, but REPL state-resets and programmatic callers can
          // leave these undefined — fall back to safe numbers.
          const limit = Number.parseInt(opts.limit, 10) || 20;
          const offset = Number.parseInt(opts.offset, 10) || 0;
          const total = deployments.length;
          deployments = deployments.slice(offset, offset + limit);

          spinner.stop();

          const fmt = resolveDeploymentFormat(opts);
          if (fmt === "ids-only") {
            // id is the deployment job ID — useful for `deployments show <id>` pipelines
            output(deployments, { format: "ids-only", columns: [], idKey: "id" });
          } else if (fmt === "json") {
            outputJson(deployments, total, limit, offset);
          } else if (fmt !== "quiet") {
            outputTable(deployments, total, limit, offset);
          }
        },
        async () => {
          // Production mode — query Dataverse solution history
          let entries = await getDeploymentHistory(opts);
          entries = filterHistory(entries, opts);

          const limit = Number.parseInt(opts.limit, 10) || 20;
          const offset = Number.parseInt(opts.offset, 10) || 0;
          const total = entries.length;
          entries = entries.slice(offset, offset + limit);

          spinner.stop();

          const fmt = resolveDeploymentFormat(opts);
          if (fmt === "ids-only") {
            // id is the msdyn_solutionhistoryid — useful for querying specific history records
            output(entries as HistoryEntry[], { format: "ids-only", columns: [], idKey: "id" });
          } else if (fmt === "json") {
            outputHistoryJson(entries, total, limit, offset);
          } else if (fmt !== "quiet") {
            outputHistoryTable(entries, total, limit, offset);
          }
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load deployment history");
    }
  });
