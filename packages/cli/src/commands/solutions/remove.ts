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
import { loadConfig, TokenManager, DataverseClient, SolutionOperations } from "@agentsync/core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { question } from "../../lib/input.js";
import { handleCommandError } from "../../lib/errors.js";

export const removeCommand = new Command("remove")
  .alias("uninstall")
  .argument("<solution>", "Solution unique name to remove (e.g., TestDeploy)")
  .description("Uninstall a managed solution from a target environment")
  .requiredOption("-t, --tenant <name>", "Target tenant name or ID")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-y, --yes", "Skip confirmation prompt")
  .addHelpText(
    "after",
    `
Examples:
  solutions remove TestDeploy -t AgentSync-Test2       Uninstall with confirmation
  solutions remove TestDeploy -t AgentSync-Test2 -y    Uninstall without confirmation
`
  )
  .action(async (solutionName: string, options) => {
    const spinner = createSpinner("Loading configuration...").start();

    try {
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      const tenant = config.tenants.find(
        (t) =>
          t.name.toLowerCase() === options.tenant.toLowerCase() ||
          t.tenantId.toLowerCase() === options.tenant.toLowerCase()
      );

      if (!tenant) {
        spinner.fail(chalk.red(`Tenant '${options.tenant}' not found in config`));
        process.exit(1);
      }

      spinner.succeed(`Target: ${tenant.name} (${tenant.environmentUrl})`);

      // Confirm unless --yes
      if (!options.yes) {
        console.log();
        console.log(
          chalk.yellow(
            `  This will uninstall '${solutionName}' and remove all its components from ${tenant.name}.`
          )
        );
        const confirm = await question(chalk.red("  Are you sure? ") + chalk.gray("(yes/no) "));
        if (confirm.toLowerCase() !== "yes" && confirm.toLowerCase() !== "y") {
          console.log(chalk.gray("  Cancelled."));
          return;
        }
      }

      spinner.start("Authenticating...");
      const clientSecret = await getClientSecretWithFallback();
      const tokenManager = new TokenManager({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: tenant.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);

      spinner.start(`Uninstalling '${solutionName}' from ${tenant.name}...`);
      await solutionOps.deleteSolution(solutionName);
      spinner.succeed(chalk.green(`Uninstalled '${solutionName}' from ${tenant.name}`));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to remove solution");
    }
  });
