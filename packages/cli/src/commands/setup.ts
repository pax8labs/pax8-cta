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
import { createSpinner } from "../lib/spinner.js";
import Table from "cli-table3";
import {
  loadConfig,
  TenantConfig,
  TokenManager,
  DataverseClient,
  environmentSetupService,
  type SetupStatus,
} from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { UsageError, CliError, handleCommandError } from "../lib/errors.js";

export const setupCommand = new Command("setup")
  .description("Register your app as an application user in tenant environments")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--check", "Check setup status without making changes")
  .option("--all", "Setup all environments")
  .option("-t, --tenant <name>", "Setup specific environment by name")
  .addHelpText(
    "after",
    `
Examples:
  agentsync setup --check                             Check setup status without making changes
  agentsync setup --all                               Register app user in all environments
  agentsync setup -t AgentSync-Test2                  Setup a specific tenant environment
`
  )
  .action(async (options) => {
    const spinner = createSpinner("Loading configuration...").start();

    try {
      // Validate options
      if (!options.check && !options.all && !options.tenant) {
        spinner.stop();
        throw new UsageError(
          "Must specify --check, --all, or --tenant <name>. Run 'agentsync setup --help' for usage."
        );
      }

      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Configuration loaded");

      // Get target tenants
      let targets: TenantConfig[];
      if (options.all) {
        targets = config.tenants.filter((t) => t.enabled);
      } else if (options.tenant) {
        const tenant = config.tenants.find(
          (t) => t.name.toLowerCase() === options.tenant.toLowerCase()
        );
        if (!tenant) {
          spinner.stop();
          throw new CliError(
            `Tenant '${options.tenant}' not found in configuration. Run 'agentsync tenants list' to see available tenants.`
          );
        }
        targets = [tenant];
      } else {
        // Check mode - check all enabled tenants
        targets = config.tenants.filter((t) => t.enabled);
      }

      if (targets.length === 0) {
        spinner.fail(chalk.red("No environments matched the selection criteria"));
        process.exit(1);
      }

      console.log();
      console.log(chalk.bold(`Checking ${targets.length} environment(s)...`));
      console.log();

      // Check setup status for each tenant
      const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");
      const statuses: SetupStatus[] = [];
      for (const tenant of targets) {
        const tokenManager = new TokenManager({
          tenantId: tenant.tenantId,
          clientId: config.partner.clientId,
          clientSecret,
        });
        const client = new DataverseClient({
          environmentUrl: tenant.environmentUrl,
          tokenManager,
        });
        const status = await environmentSetupService.checkSetupStatus(
          client,
          config.partner.clientId,
          tenant.name,
          tenant.environmentUrl
        );
        statuses.push(status);
      }

      // Display results
      displaySetupStatus(statuses);

      // If in check mode, we're done
      if (options.check) {
        const needsSetup = statuses.filter(
          (s) => s.status === "needs_setup" || s.status === "partial"
        ).length;
        if (needsSetup > 0) {
          console.log();
          console.log(
            chalk.yellow(
              `${needsSetup} environment(s) need setup. Run 'agentsync setup --all' to configure them.`
            )
          );
        }
        return;
      }

      // Setup environments that need it
      const needsSetup = statuses.filter(
        (s) => s.status === "needs_setup" || s.status === "partial"
      );

      if (needsSetup.length === 0) {
        console.log();
        console.log(chalk.green("All environments are properly configured!"));
        return;
      }

      console.log();
      console.log(chalk.bold(`Setting up ${needsSetup.length} environment(s)...`));
      console.log();

      let successCount = 0;
      let errorCount = 0;

      for (const status of needsSetup) {
        const tenant = targets.find((t) => t.name === status.tenantName);
        if (!tenant) continue;

        const setupSpinner = createSpinner(`Setting up ${status.tenantName}...`).start();

        try {
          const tokenManager = new TokenManager({
            tenantId: tenant.tenantId,
            clientId: config.partner.clientId,
            clientSecret,
          });
          const client = new DataverseClient({
            environmentUrl: tenant.environmentUrl,
            tokenManager,
          });
          await environmentSetupService.setupTenant(
            client,
            config.partner.clientId,
            tenant.environmentUrl,
            status
          );
          setupSpinner.succeed(chalk.green(`Setup completed: ${status.tenantName}`));
          successCount++;
        } catch (error) {
          setupSpinner.fail(chalk.red(`Setup failed: ${status.tenantName}`));
          console.error(
            chalk.red(`  Error: ${error instanceof Error ? error.message : String(error)}`)
          );
          errorCount++;
        }
      }

      console.log();
      console.log(chalk.bold("Setup Summary:"));
      console.log(`  ${chalk.green(`✓ ${successCount} successful`)}`);
      if (errorCount > 0) {
        console.log(`  ${chalk.red(`✗ ${errorCount} failed`)}`);
      }
    } catch (error) {
      handleCommandError(error, spinner, "Setup failed");
    }
  });

/**
 * Display setup status in a table
 */
function displaySetupStatus(statuses: SetupStatus[]): void {
  const table = new Table({
    head: ["Environment", "App Registered", "Role", "Status"],
    style: { head: ["cyan"] },
  });

  for (const status of statuses) {
    const appRegistered = status.appRegistered ? chalk.green("✓") : chalk.red("✗");
    const roleAssigned = status.roleAssigned
      ? chalk.green("System Admin")
      : status.appRegistered
        ? chalk.yellow("None")
        : chalk.gray("-");

    let statusText: string;
    if (status.status === "ready") {
      statusText = chalk.green("Ready");
    } else if (status.status === "needs_setup") {
      statusText = chalk.yellow("Needs setup");
    } else if (status.status === "partial") {
      statusText = chalk.yellow("Needs role");
    } else {
      statusText = chalk.red("Error");
    }

    const row = [status.tenantName, appRegistered, roleAssigned, statusText];

    table.push(row);
  }

  console.log(table.toString());

  // Show errors if any
  const errors = statuses.filter((s) => s.error);
  if (errors.length > 0) {
    console.log();
    console.log(chalk.bold("Notes:"));
    for (const status of errors) {
      console.log(chalk.yellow(`  ${status.tenantName}: ${status.error}`));
    }
  }

  // Show bootstrap message if needed
  const needsBootstrap = statuses.filter(
    (s) => s.status === "needs_setup" && s.error?.includes("bootstrap")
  );
  if (needsBootstrap.length > 0) {
    console.log();
    console.log(chalk.bold("Bootstrap Required:"));
    console.log(
      chalk.gray("  Some environments require manual app user setup first (one-time bootstrap).")
    );
    console.log(chalk.gray("  Go to: https://admin.powerplatform.microsoft.com"));
    console.log(chalk.gray("  → Environment → Settings → Users + permissions → Application users"));
    console.log(chalk.gray(`  → Add app: ${statuses[0]?.environmentUrl ? "your app ID" : ""}`));
  }
}
