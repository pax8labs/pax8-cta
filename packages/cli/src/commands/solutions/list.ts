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
  loadConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  DEMO_SOLUTIONS,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List all solutions in source or a target environment")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tenant <name>", "Tenant name or ID to query (defaults to source environment)")
  .option("--json", "Output as JSON")
  .addHelpText("after", `
Examples:
  agentsync solutions list                             List solutions in source environment
  agentsync solutions list -t AgentSync-Test2          List solutions in a target tenant
  agentsync solutions list --json                      Output as JSON
`)
  .action(async (options) => {
    const spinner = createSpinner("Loading configuration...").start();

    try {
      await withDemoMode(
        () => listSolutionsDemo(spinner, options),
        () => listSolutionsReal(spinner, options),
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to list solutions");
    }
  });

function listSolutionsDemo(
  spinner: ReturnType<typeof createSpinner>,
  options: { json?: boolean },
) {
  spinner.succeed(`Found ${DEMO_SOLUTIONS.length} solutions in demo environment`);
  console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

  const solutions = DEMO_SOLUTIONS;

  if (options.json) {
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

  console.log();

  const table = new Table({
    head: ["Solution", "Version", "Type", "Unique Name"],
    style: { head: ["cyan"] },
  });

  solutions.forEach((solution) => {
    table.push([
      solution.friendlyName,
      solution.version,
      solution.isManaged ? "Managed" : "Unmanaged",
      solution.uniqueName,
    ]);
  });

  console.log(table.toString());
  console.log();
  console.log(chalk.gray(`Total: ${solutions.length} solutions`));
}

async function listSolutionsReal(
  spinner: ReturnType<typeof createSpinner>,
  options: { config: string; tenant?: string; json?: boolean },
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

  if (options.json) {
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

  console.log();

  const table = new Table({
    head: ["Solution", "Version", "Type", "Unique Name"],
    style: { head: ["cyan"] },
  });

  solutions.forEach((solution) => {
    table.push([
      solution.friendlyname,
      solution.version,
      solution.ismanaged ? "Managed" : "Unmanaged",
      solution.uniquename,
    ]);
  });

  console.log(table.toString());
  console.log();
  console.log(
    chalk.gray(`Total: ${solutions.length} solutions in ${environmentName} environment`)
  );
}
