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
import { createSpinner, isQuietMode } from "../../lib/spinner.js";
import {
  DEMO_SOLUTIONS,
  TokenManager,
  DataverseClient,
  AgentResolver,
} from "@agentsync/core";
import { withResolvedConfig } from "../../lib/command-wrapper.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { handleCommandError } from "../../lib/errors.js";
import { output, getDefaultFormat, type Column, type OutputFormat } from "../../lib/output.js";

// ============================================================================
// Demo-mode row type (DEMO_SOLUTIONS shape)
// ============================================================================

interface DemoAgentRow {
  uniqueName: string;
  version: string;
  category: string;
  tags: string;
  lastPublished: string;
}

const DEMO_COLUMNS: Column<DemoAgentRow>[] = [
  { key: "uniqueName", header: "Agent" },
  { key: "version", header: "Version" },
  { key: "category", header: "Category" },
  { key: "tags", header: "Tags" },
  { key: "lastPublished", header: "Last Published" },
];

// ============================================================================
// Production-mode row type (AgentResolver result)
// ============================================================================

interface LiveAgentRow {
  name: string;
  botId: string; // full bot GUID used as idKey for --ids-only pipeline use
  botIdShort: string;
  solution: string;
  status: string;
  modifiedon: string;
}

const LIVE_COLUMNS: Column<LiveAgentRow>[] = [
  { key: "name", header: "Agent Name" },
  { key: "botIdShort", header: "Bot ID" },
  { key: "solution", header: "Solution" },
  {
    key: "status",
    header: "Status",
    format: (v) => (v === "Active" ? chalk.green("Active") : chalk.gray("Inactive")),
  },
  { key: "modifiedon", header: "Last Modified" },
];

function resolveFormat(options: {
  json?: boolean;
  quiet?: boolean;
  idsOnly?: boolean;
}): OutputFormat {
  if (options.idsOnly) return "ids-only";
  if (options.json) return "json";
  if (options.quiet) return "quiet";
  return getDefaultFormat();
}

export const listCommand = new Command("list")
  .alias("ls")
  .description("List agents and solutions in your source environment")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tag>", "Filter by tag")
  .option("--category <category>", "Filter by category")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .action(async (options, cmd) => {
    // Merge local options with global flags (e.g. --ids-only from root program)
    const opts = { ...options, ...cmd.optsWithGlobals() };
    const spinner = createSpinner("Loading agents...").start();

    try {
      await withResolvedConfig(
        opts,
        async () => {
          spinner.stop();
          if (!isQuietMode()) {
            console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
          }

          let solutions = [...DEMO_SOLUTIONS];

          // Apply tag filter
          if (opts.tag) {
            const tag = opts.tag.toLowerCase();
            solutions = solutions.filter((s) => s.tags.some((t) => t.toLowerCase().includes(tag)));
          }

          // Apply category filter
          if (opts.category) {
            const cat = opts.category.toLowerCase();
            solutions = solutions.filter((s) => s.category.toLowerCase().includes(cat));
          }

          const fmt = resolveFormat(opts);

          if (fmt === "json") {
            console.log(JSON.stringify(solutions, null, 2));
            return;
          }

          if (fmt === "quiet") return;

          // table
          const rows: DemoAgentRow[] = solutions.map((s) => ({
            uniqueName: s.uniqueName,
            version: s.version,
            category: s.category,
            tags: s.tags.join(", "),
            lastPublished: formatTimeAgo(s.lastPublished),
          }));

          if (fmt === "ids-only") {
            // uniqueName is the pipeline-friendly identifier for demo agents
            output(rows, { format: "ids-only", columns: DEMO_COLUMNS, idKey: "uniqueName" });
            return;
          }

          output(rows, { format: "table", columns: DEMO_COLUMNS });
          console.log();
          console.log(chalk.gray(`${solutions.length} agents available`));
        },
        async (config) => {
          // Production mode - query source environment
          if (!config.source || !config.source.environmentUrl) {
            spinner.fail(chalk.red("Source environment not configured"));
            if (!isQuietMode()) {
              console.error(chalk.gray("\nConfigure a source environment in your config file:"));
              console.error(chalk.gray("  source:"));
              console.error(chalk.gray("    tenantId: <tenant-id>"));
              console.error(chalk.gray("    environmentUrl: <environment-url>"));
            }
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

          const fmt = resolveFormat(opts);

          if (fmt === "json") {
            console.log(JSON.stringify(botsWithSolutions, null, 2));
            return;
          }

          if (fmt === "quiet") return;

          // table / ids-only
          const rows: LiveAgentRow[] = botsWithSolutions.map(({ bot, solution }) => ({
            name: bot.name,
            // botIdShort shown in table; full botId used as idKey for --ids-only pipeline use
            botIdShort: bot.botid.slice(0, 8) + "...",
            botId: bot.botid,
            solution: solution?.uniquename || "(no solution)",
            status: bot.statecode === 0 ? "Active" : "Inactive",
            modifiedon: formatTimeAgo(bot.modifiedon),
          }));

          if (fmt === "ids-only") {
            // botId is the Dataverse bot GUID — most useful for API calls downstream
            output(rows, { format: "ids-only", columns: LIVE_COLUMNS, idKey: "botId" });
            return;
          }

          console.log();
          output(rows, { format: "table", columns: LIVE_COLUMNS });
          console.log();
          console.log(
            chalk.gray(`Total: ${botsWithSolutions.length} agent(s) in source environment`)
          );
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load agents");
    }
  });
