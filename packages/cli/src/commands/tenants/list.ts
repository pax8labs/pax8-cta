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
import { resolve } from "node:path";
import chalk from "chalk";
import { createSpinner } from "../../lib/spinner.js";
import { loadConfig, DEMO_TENANTS } from "@agentsync/core";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { output, getDefaultFormat, type Column, type OutputFormat } from "../../lib/output.js";

// Row type for the tenants list table
interface TenantRow {
  name: string;
  tenantIdShort: string;
  environmentUrl: string;
  tags: string;
  active: string;
}

const COLUMNS: Column<TenantRow>[] = [
  { key: "name", header: "Destination" },
  { key: "tenantIdShort", header: "Tenant ID" },
  { key: "environmentUrl", header: "Port (Environment)" },
  { key: "tags", header: "Tags" },
  {
    key: "active",
    header: "Active",
    format: (v) => (v === "Yes" ? chalk.green("Yes") : chalk.red("No")),
  },
];

export const listCommand = new Command("list")
  .alias("ls")
  .description("List all configured target tenants")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("-s, --search <query>", "Search by name, ID, or environment URL")
  .option("--status <status>", "Filter by status (enabled|disabled|all)", "all")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  agentsync tenants list                              List all configured tenants
  agentsync tenants list -s enabled                   Show only enabled tenants
  agentsync tenants list -t production --json         Filter by tag and output as JSON
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Loading fleet manifest...").start();

    try {
      await withDemoMode(
        () => listDemo(spinner, options),
        () => listReal(spinner, options)
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load fleet manifest");
    }
  });

function applyFilters(
  destinations: typeof DEMO_TENANTS,
  options: { search?: string; tag?: string[]; status?: string }
) {
  let filtered = [...destinations];

  if (options.search) {
    const q = options.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tenantId.toLowerCase().includes(q) ||
        t.environmentUrl.toLowerCase().includes(q)
    );
  }

  if (options.tag && options.tag.length > 0) {
    filtered = filtered.filter((t) => options.tag!.every((tag: string) => t.tags?.includes(tag)));
  }

  if (options.status === "enabled") {
    filtered = filtered.filter((t) => t.enabled);
  } else if (options.status === "disabled") {
    filtered = filtered.filter((t) => !t.enabled);
  }

  return filtered;
}

function resolveFormat(options: { json?: boolean; quiet?: boolean }): OutputFormat {
  if (options.json) return "json";
  if (options.quiet) return "quiet";
  return getDefaultFormat();
}

function renderOutput(
  destinations: typeof DEMO_TENANTS,
  options: { json?: boolean; quiet?: boolean; search?: string; tag?: string[]; status?: string },
  totalActive: number
) {
  const fmt = resolveFormat(options);

  if (fmt === "json") {
    // Keep existing JSON envelope shape for backwards compatibility
    console.log(
      JSON.stringify(
        {
          tenants: destinations,
          total: destinations.length,
          active: destinations.filter((t) => t.enabled).length,
        },
        null,
        2
      )
    );
    return;
  }

  if (fmt === "quiet") return;

  // table (default)
  console.log();

  const rows: TenantRow[] = destinations.map((tenant) => ({
    name: tenant.name,
    tenantIdShort: tenant.tenantId.slice(0, 8) + "...",
    environmentUrl: tenant.environmentUrl,
    tags: tenant.tags?.join(", ") || "-",
    active: tenant.enabled ? "Yes" : "No",
  }));

  output(rows, { format: "table", columns: COLUMNS });
  console.log();

  const filterInfo: string[] = [];
  if (options.search) filterInfo.push(`matching "${options.search}"`);
  if (options.tag?.length) filterInfo.push(`with tags: ${options.tag.join(" AND ")}`);
  if (options.status !== "all") filterInfo.push(`status: ${options.status}`);

  if (filterInfo.length > 0) {
    console.log(chalk.gray(`${destinations.length} tenants ${filterInfo.join(", ")}`));
  } else {
    console.log(
      chalk.gray(`Fleet size: ${destinations.length} destinations (${totalActive} active)`)
    );
  }
}

function listDemo(
  spinner: ReturnType<typeof createSpinner>,
  options: { search?: string; tag?: string[]; status?: string; json?: boolean; quiet?: boolean }
) {
  spinner.succeed(`Loaded ${DEMO_TENANTS.length} destinations from demo fleet`);
  console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

  const destinations = applyFilters(DEMO_TENANTS, options);
  renderOutput(destinations, options, DEMO_TENANTS.filter((t) => t.enabled).length);
}

async function listReal(
  spinner: ReturnType<typeof createSpinner>,
  options: {
    config: string;
    search?: string;
    tag?: string[];
    status?: string;
    json?: boolean;
    quiet?: boolean;
  }
) {
  const configPath = resolve(process.cwd(), options.config);
  const config = await loadConfig(configPath);
  spinner.succeed(`Loaded ${config.tenants.length} destinations from manifest`);

  const destinations = applyFilters(config.tenants, options);
  renderOutput(destinations, options, config.tenants.filter((t) => t.enabled).length);
}
