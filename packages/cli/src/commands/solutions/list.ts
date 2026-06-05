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
import { createSpinner, isQuietMode } from "../../lib/spinner.js";
import {
  loadConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  DEMO_SOLUTIONS,
} from "@pax8/cta-core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";
import { output, getDefaultFormat, type Column, type OutputFormat } from "../../lib/output.js";
import { showDemoBanner } from "../../lib/demo-banner.js";

interface SolutionRow {
  friendlyName: string;
  version: string;
  type: string;
  uniqueName: string;
}

const COLUMNS: Column<SolutionRow>[] = [
  { key: "friendlyName", header: "Solution" },
  { key: "version", header: "Version" },
  { key: "type", header: "Type" },
  { key: "uniqueName", header: "Unique Name" },
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
  .description("List all solutions in source or a target environment")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tenant <name>", "Tenant name or ID to query (defaults to source environment)")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  solutions list                             List solutions in source environment
  solutions list -t Pax8CTA-Test2          List solutions in a target tenant
  solutions list --json                      Output as JSON
  solutions list --ids-only | xargs -I{} deploy {} --all
`
  )
  .action(async (options, cmd) => {
    // Merge local options with global flags (e.g. --ids-only from root program)
    const opts = { ...options, ...cmd.optsWithGlobals() };
    const spinner = createSpinner("Loading configuration...").start();

    try {
      await withDemoMode(
        () => listSolutionsDemo(spinner, opts),
        () => listSolutionsReal(spinner, opts)
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to list solutions");
    }
  });

function listSolutionsDemo(
  spinner: ReturnType<typeof createSpinner>,
  options: { json?: boolean; quiet?: boolean; idsOnly?: boolean }
) {
  spinner.succeed(`Found ${DEMO_SOLUTIONS.length} solutions in demo environment`);
  if (!isQuietMode()) {
    showDemoBanner();
  }

  const solutions = DEMO_SOLUTIONS;
  const fmt = resolveFormat(options);

  if (fmt === "json") {
    console.log(
      JSON.stringify(
        {
          solutions: solutions.map((s) => ({
            uniqueName: s.uniqueName,
            friendlyName: s.friendlyName,
            version: s.version,
            isManaged: s.isManaged,
          })),
          total: solutions.length,
        },
        null,
        2
      )
    );
    return;
  }

  if (fmt === "quiet") return;

  const rows: SolutionRow[] = solutions.map((s) => ({
    friendlyName: s.friendlyName,
    version: s.version,
    type: s.isManaged ? "Managed" : "Unmanaged",
    // uniqueName is the stable identifier for deploy/import pipelines
    uniqueName: s.uniqueName,
  }));

  if (fmt === "ids-only") {
    output(rows, { format: "ids-only", columns: COLUMNS, idKey: "uniqueName" });
    return;
  }

  // table
  console.log();

  output(rows, { format: "table", columns: COLUMNS });
  console.log();
  console.log(chalk.gray(`Total: ${solutions.length} solutions`));
}

async function listSolutionsReal(
  spinner: ReturnType<typeof createSpinner>,
  options: { config: string; tenant?: string; json?: boolean; quiet?: boolean; idsOnly?: boolean }
) {
  const configPath = resolve(process.cwd(), options.config);
  const config = await loadConfig(configPath);
  spinner.succeed("Manifest loaded");

  spinner.start("Authenticating...");
  const clientSecret = await getClientSecretWithFallback();

  const tokenManager = new TokenManager({
    tenantId: config.partner.tenantId,
    clientId: config.partner.clientId,
    clientSecret,
  });

  let environmentUrl: string;
  let environmentName: string;

  if (options.tenant) {
    const tenant = config.tenants.find(
      (t) =>
        t.name.toLowerCase() === options.tenant!.toLowerCase() ||
        t.tenantId.toLowerCase() === options.tenant!.toLowerCase()
    );

    if (!tenant) {
      spinner.fail(chalk.red(`Tenant '${options.tenant}' not found in manifest`));
      process.exit(1);
    }

    environmentUrl = tenant.environmentUrl;
    environmentName = tenant.name;
  } else {
    environmentUrl = config.source.environmentUrl;
    environmentName = "source";
  }

  const dataverseClient = new DataverseClient({
    environmentUrl,
    tokenManager,
  });

  const solutionOps = new SolutionOperations(dataverseClient);
  spinner.succeed(`Connected to ${environmentName} environment`);

  spinner.start("Querying solutions...");
  const solutions = await solutionOps.listSolutions();
  spinner.succeed(`Found ${solutions.length} solutions`);

  const fmt = resolveFormat(options);

  if (fmt === "json") {
    console.log(
      JSON.stringify(
        {
          environment: environmentName,
          solutions: solutions.map((s) => ({
            solutionId: s.solutionid,
            uniqueName: s.uniquename,
            friendlyName: s.friendlyname,
            version: s.version,
            isManaged: s.ismanaged,
          })),
          total: solutions.length,
        },
        null,
        2
      )
    );
    return;
  }

  if (fmt === "quiet") return;

  const rows: SolutionRow[] = solutions.map((s) => ({
    friendlyName: s.friendlyname,
    version: s.version,
    type: s.ismanaged ? "Managed" : "Unmanaged",
    // uniqueName is the stable identifier for deploy/import pipelines
    uniqueName: s.uniquename,
  }));

  if (fmt === "ids-only") {
    output(rows, { format: "ids-only", columns: COLUMNS, idKey: "uniqueName" });
    return;
  }

  // table
  console.log();

  output(rows, { format: "table", columns: COLUMNS });
  console.log();
  console.log(chalk.gray(`Total: ${solutions.length} solutions in ${environmentName} environment`));
}
