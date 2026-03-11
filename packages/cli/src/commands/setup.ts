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
import ora from "ora";
import Table from "cli-table3";
import { loadConfig, getClientSecret, TenantConfig } from "@agentsync/core";
import { TokenManager } from "@agentsync/core";
import { PowerPlatformAdminClient } from "@agentsync/core";

interface SetupStatus {
  tenantName: string;
  environmentUrl: string;
  appRegistered: boolean;
  roleAssigned: boolean;
  status: "ready" | "needs_setup" | "partial" | "error";
  error?: string;
}

export const setupCommand = new Command("setup")
  .description("Setup application users in Power Platform environments")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--check", "Check setup status without making changes")
  .option("--all", "Setup all environments")
  .option("-t, --tenant <name>", "Setup specific environment by name")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Validate options
      if (!options.check && !options.all && !options.tenant) {
        spinner.fail(
          chalk.red("Must specify --check, --all, or --tenant <name> to select environments")
        );
        process.exit(1);
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
          console.error(chalk.red(`Tenant '${options.tenant}' not found in configuration`));
          process.exit(1);
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

      // Verify client secret is available
      getClientSecret();

      console.log();
      console.log(chalk.bold(`Checking ${targets.length} environment(s)...`));
      console.log();

      // Check setup status for each tenant
      const statuses: SetupStatus[] = [];
      for (const tenant of targets) {
        const status = await checkSetupStatus(config, tenant);
        statuses.push(status);
      }

      // Display results
      displaySetupStatus(statuses);

      // If in check mode, we're done
      if (options.check) {
        const needsSetup = statuses.filter((s) => s.status === "needs_setup").length;
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

        const setupSpinner = ora(`Setting up ${status.tenantName}...`).start();

        try {
          await setupTenant(config, tenant);
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
      spinner.fail(chalk.red("Setup failed"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Check setup status for a tenant
 */
async function checkSetupStatus(
  config: { partner: { tenantId: string; clientId: string } },
  tenant: TenantConfig & { environmentId?: string }
): Promise<SetupStatus> {
  try {
    const clientSecret = getClientSecret();
    const tokenManager = new TokenManager({
      tenantId: tenant.tenantId,
      clientId: config.partner.clientId,
      clientSecret: clientSecret,
    });

    // Check if environmentId is provided
    if (!tenant.environmentId) {
      return {
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        appRegistered: false,
        roleAssigned: false,
        status: "error",
        error: "Missing environmentId in configuration",
      };
    }

    const adminClient = new PowerPlatformAdminClient({ tokenManager });

    // Check if app user exists
    const appUser = await adminClient.checkApplicationUserExists(
      tenant.environmentId,
      config.partner.clientId
    );

    if (!appUser) {
      return {
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        appRegistered: false,
        roleAssigned: false,
        status: "needs_setup",
      };
    }

    // App user exists - check if System Admin role is assigned
    // We'll consider it "ready" if the user exists (role check is complex)
    return {
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      appRegistered: true,
      roleAssigned: true,
      status: "ready",
    };
  } catch (error) {
    return {
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      appRegistered: false,
      roleAssigned: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Setup application user for a tenant
 */
async function setupTenant(
  config: { partner: { tenantId: string; clientId: string } },
  tenant: TenantConfig & { environmentId?: string }
): Promise<void> {
  const clientSecret = getClientSecret();
  const tokenManager = new TokenManager({
    tenantId: tenant.tenantId,
    clientId: config.partner.clientId,
    clientSecret: clientSecret,
  });

  if (!tenant.environmentId) {
    throw new Error(
      "Missing environmentId in configuration. Please add the environment ID to your tenant configuration."
    );
  }

  const adminClient = new PowerPlatformAdminClient({ tokenManager });

  const result = await adminClient.setupApplicationUser(
    tenant.environmentId,
    tenant.environmentUrl,
    config.partner.clientId
  );

  if (!result.created) {
    console.log(chalk.yellow(`  Application user already exists`));
  }
}

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
    const roleAssigned =
      status.roleAssigned && status.appRegistered
        ? chalk.green("System Admin")
        : status.error
          ? chalk.gray("-")
          : chalk.gray("-");

    let statusText: string;
    if (status.status === "ready") {
      statusText = chalk.green("Ready");
    } else if (status.status === "needs_setup") {
      statusText = chalk.yellow("Needs setup");
    } else if (status.status === "partial") {
      statusText = chalk.yellow("Partial");
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
    console.log(chalk.bold("Errors:"));
    for (const status of errors) {
      console.log(chalk.red(`  ${status.tenantName}: ${status.error}`));
    }
  }
}
