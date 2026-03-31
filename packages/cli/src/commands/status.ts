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
import { existsSync } from "node:fs";
import chalk from "chalk";
import { createSpinner } from "../lib/spinner.js";
import Table from "cli-table3";
import { isDemo } from "../lib/command-wrapper.js";
import { DEMO_TENANTS } from "@agentsync/core";
import { formatStatus, formatTimeAgo, calculateDuration, truncate } from "../lib/formatters.js";
import { loadConfig, TenantConfig, TokenManager, DataverseClient } from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { handleCommandError } from "../lib/errors.js";
import { exitOssUnavailable } from "../lib/oss-surface.js";

// Mock deployment data for demo mode
const DEMO_DEPLOYMENTS = [
  {
    id: "dep-demo-latest",
    solutionName: "CustomerSupportAgent",
    status: "in_progress",
    totalTenants: 5,
    completedTenants: 3,
    failedTenants: 1,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "dep-demo-success",
    solutionName: "SalesAgent",
    status: "completed",
    totalTenants: 3,
    completedTenants: 3,
    failedTenants: 0,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "dep-demo-failed",
    solutionName: "HRAgent",
    status: "completed",
    totalTenants: 4,
    completedTenants: 2,
    failedTenants: 2,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

function getDemoDeploymentDetails(trackingId: string) {
  const deployment = DEMO_DEPLOYMENTS.find((d) => d.id === trackingId);
  if (!deployment) return null;

  const tenantResults = DEMO_TENANTS.slice(0, deployment.totalTenants).map((tenant, i) => {
    let status = "completed";
    let error: string | undefined = undefined;
    let startedAt: string | undefined = new Date(
      Date.now() - 10 * 60 * 1000 + i * 2 * 60 * 1000
    ).toISOString();
    let completedAt: string | undefined = new Date(
      Date.now() - 5 * 60 * 1000 + i * 2 * 60 * 1000
    ).toISOString();

    if (deployment.status === "in_progress") {
      if (i === deployment.completedTenants) {
        status = "in_progress";
        completedAt = undefined;
      } else if (i > deployment.completedTenants) {
        status = "pending";
        startedAt = undefined;
        completedAt = undefined;
      }
    }

    if (i === deployment.totalTenants - 1 && deployment.failedTenants > 0) {
      status = "failed";
      error = "Missing privilege 'prvWriteContact' - GDAP role lacks Power Platform Admin";
    }

    return {
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      status,
      error,
      startedAt,
      completedAt,
    };
  });

  return {
    ...deployment,
    tenantResults,
  };
}

interface SetupStatus {
  tenantName: string;
  environmentUrl: string;
  appRegistered: boolean;
  roleAssigned: boolean;
  status: "ready" | "needs_setup" | "partial" | "error";
  error?: string;
  userId?: string;
}

interface SystemUser {
  systemuserid: string;
  fullname?: string;
  applicationid?: string;
  isdisabled?: boolean;
}

interface SecurityRole {
  roleid: string;
  name: string;
}

export const statusCommand = new Command("status")
  .alias("track")
  .description("Check deployment status")
  .option("-d, --deployment <id>", "Deployment ID to track")
  .option("-s, --shipment <id>", "Shipment tracking number (alias for --deployment)")
  .option("-l, --list", "List all recent shipments")
  .option("--setup", "Show comprehensive setup status")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .action(async (options) => {
    // Handle --setup flag
    if (options.setup) {
      await handleSetupStatus(options);
      return;
    }
    // Handle --list flag
    if (options.list) {
      if (isDemo()) {
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing mock deployments\n"));
        console.log(chalk.bold("Recent Shipments:"));
        console.log();

        const table = new Table({
          head: ["Tracking #", "Agent", "Status", "Progress", "Created"],
          style: { head: ["cyan"] },
        });

        DEMO_DEPLOYMENTS.forEach((d) => {
          const progress = `${d.completedTenants}/${d.totalTenants}`;
          const statusText =
            d.status === "completed"
              ? d.failedTenants > 0
                ? chalk.yellow("⚠ Completed")
                : chalk.green("✓ Completed")
              : chalk.yellow("🚚 In Progress");
          const timeAgo = getTimeAgo(d.createdAt);

          table.push([
            chalk.cyan(d.id),
            d.solutionName,
            statusText,
            d.failedTenants > 0 ? `${progress} (${d.failedTenants} failed)` : progress,
            chalk.gray(timeAgo),
          ]);
        });

        console.log(table.toString());
        console.log();
        console.log(chalk.gray(`Use 'agentsync track --shipment <id>' to view details`));
        return;
      } else {
        exitOssUnavailable("status --list", {
          alternatives: [
            "Use 'agentsync deployments list' for import history from Dataverse.",
            "Use 'agentsync status --setup' for tenant readiness checks.",
          ],
        });
      }
    }

    const trackingId = options.shipment || options.deployment;

    if (!trackingId) {
      console.error(
        chalk.red("Error: must specify --shipment or --deployment tracking number, or use --list.")
      );
      process.exit(2);
    }

    // Handle demo mode
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing mock data\n"));

      const shipment = getDemoDeploymentDetails(trackingId);

      if (!shipment) {
        console.log(chalk.yellow(`Shipment '${trackingId}' not found`));
        console.log();
        console.log(chalk.gray("Available demo shipments:"));
        DEMO_DEPLOYMENTS.forEach((d) => {
          console.log(chalk.gray(`  - ${chalk.cyan(d.id)} (${d.solutionName})`));
        });
        return;
      }

      // Display overall status
      console.log(chalk.bold("📦 Shipment Tracking"));
      console.log("─".repeat(50));
      console.log(`  Tracking #:  ${shipment.id}`);
      console.log(`  Cargo:       ${shipment.solutionName}`);
      console.log(`  Status:      ${formatShippingStatus(shipment.status)}`);
      console.log(
        `  Delivered:   ${shipment.completedTenants}/${shipment.totalTenants} destinations`
      );
      if (shipment.failedTenants > 0) {
        console.log(`  Failed:      ${chalk.red(shipment.failedTenants.toString())} deliveries`);
      }
      console.log();

      // Display destination results
      const table = new Table({
        head: ["Destination", "Status", "Transit Time", "Issue"],
        style: { head: ["cyan"] },
        colWidths: [25, 15, 12, 40],
        wordWrap: true,
      });

      shipment.tenantResults.forEach((result) => {
        const duration = calculateDuration(result.startedAt, result.completedAt);
        table.push([
          result.tenantName,
          formatShippingStatus(result.status),
          duration,
          result.error ? chalk.red(truncate(result.error, 35)) : "-",
        ]);
      });

      console.log(table.toString());
      console.log();
      console.log(chalk.gray("Demo mode - use 'agentsync demo off' to disable"));
      return;
    }

    exitOssUnavailable("status tracking", {
      alternatives: [
        "Use 'agentsync deployments list' to view recent deployment history.",
        "Use 'agentsync deployments show <id>' to inspect a specific history entry.",
      ],
    });
  });

// Use shipping-style status formatting for this command
const formatShippingStatus = (status: string) => formatStatus(status, "shipping");

// Alias for backward compatibility
const getTimeAgo = formatTimeAgo;

/**
 * Handle --setup flag to show comprehensive setup status
 */
async function handleSetupStatus(options: { config: string }): Promise<void> {
  const spinner = createSpinner("Loading configuration...").start();

  try {
    // Check config file existence
    const configPath = resolve(process.cwd(), options.config);
    const configExists = existsSync(configPath);

    console.log();
    console.log(chalk.bold("Configuration Status"));
    console.log("─".repeat(50));

    if (configExists) {
      console.log(`  Config file:     ${chalk.green("✓")} Found at ${configPath}`);
    } else {
      console.log(`  Config file:     ${chalk.red("✗")} Not found at ${configPath}`);
      spinner.stop();
      console.log();
      console.log(chalk.yellow("Next steps:"));
      console.log(`  1. Create config file at ${configPath}`);
      console.log("  2. Then run 'agentsync status --setup' again");
      return;
    }

    // Load config
    const config = await loadConfig(configPath);
    spinner.text = "Configuration loaded";

    // Check client secret
    let hasClientSecret = false;
    try {
      await getClientSecretWithFallback();
      hasClientSecret = true;
      console.log(`  Client secret:   ${chalk.green("✓")} Found (environment or keychain)`);
    } catch (error) {
      console.log(`  Client secret:   ${chalk.red("✗")} Not found in environment or keychain`);
    }

    // Show source environment info
    if (config.source) {
      console.log(`  Source env:      ${chalk.green("✓")} ${config.source.environmentUrl}`);
    }

    console.log();
    spinner.succeed("Configuration loaded");

    if (!hasClientSecret) {
      console.log();
      console.log(chalk.yellow("Cannot check tenant setup without client secret."));
      console.log();
      console.log(chalk.yellow("Next steps:"));
      console.log("  1. Set PARTNER_CLIENT_SECRET environment variable");
      console.log("  2. Then run 'agentsync status --setup' again");
      return;
    }

    // Get enabled tenants
    const enabledTenants = config.tenants.filter((t) => t.enabled);

    if (enabledTenants.length === 0) {
      console.log();
      console.log(chalk.yellow("No enabled tenants found in configuration."));
      return;
    }

    console.log();
    console.log(chalk.bold(`Checking ${enabledTenants.length} tenant(s)...`));
    console.log();

    // Check setup status for each tenant
    const statuses: SetupStatus[] = [];
    for (const tenant of enabledTenants) {
      const status = await checkSetupStatus(config, tenant);
      statuses.push(status);
    }

    // Display per-tenant status
    displaySetupStatus(statuses);

    // Calculate summary
    const readyCount = statuses.filter((s) => s.status === "ready").length;
    const needsSetupCount = statuses.filter(
      (s) => s.status === "needs_setup" || s.status === "partial"
    ).length;
    const errorCount = statuses.filter((s) => s.status === "error").length;

    console.log();
    console.log(chalk.bold("Overall Readiness:"));
    console.log(`  ${chalk.green(`${readyCount} of ${statuses.length} tenant(s) ready`)}`);

    if (needsSetupCount > 0 || errorCount > 0) {
      console.log();
      console.log(chalk.bold("Next steps:"));

      const tenantsNeedingSetup = statuses.filter(
        (s) => s.status === "needs_setup" || s.status === "partial"
      );

      if (tenantsNeedingSetup.length > 0) {
        if (tenantsNeedingSetup.length === enabledTenants.length) {
          console.log(`  1. Run ${chalk.cyan("'agentsync setup --all'")} to create app users`);
        } else {
          console.log("  1. Setup individual tenants:");
          tenantsNeedingSetup.forEach((s) => {
            console.log(`     ${chalk.cyan(`agentsync setup --tenant "${s.tenantName}"`)}`);
          });
        }
        console.log(`  2. Then: ${chalk.cyan("agentsync deploy --all --solution ./agent.zip")}`);
      }

      if (errorCount > 0) {
        console.log();
        console.log(
          chalk.yellow(`  Note: ${errorCount} tenant(s) have errors. Check the details above.`)
        );
      }
    }
  } catch (error) {
    handleCommandError(error, spinner, "Failed to check setup status");
  }
}

/**
 * Check setup status for a tenant using Dataverse Web API
 * (Reused from setup.ts)
 */
async function checkSetupStatus(
  config: { partner: { tenantId: string; clientId: string } },
  tenant: TenantConfig
): Promise<SetupStatus> {
  const clientSecret = await getClientSecretWithFallback();
  const tokenManager = new TokenManager({
    tenantId: tenant.tenantId,
    clientId: config.partner.clientId,
    clientSecret: clientSecret,
  });

  const client = new DataverseClient({
    environmentUrl: tenant.environmentUrl,
    tokenManager,
  });

  try {
    // Check if app user exists
    const appId = config.partner.clientId;
    const result = await client.get<{ value: SystemUser[] }>("/systemusers", {
      $filter: `applicationid eq '${appId}'`,
      $select: "systemuserid,fullname,applicationid,isdisabled",
    });

    if (result.value.length === 0) {
      return {
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        appRegistered: false,
        roleAssigned: false,
        status: "needs_setup",
      };
    }

    const user = result.value[0];

    // Check if System Administrator role is assigned
    const rolesResult = await client.get<{ value: SecurityRole[] }>(
      `/systemusers(${user.systemuserid})/systemuserroles_association`,
      {
        $select: "roleid,name",
      }
    );

    const hasAdminRole = rolesResult.value.some((r) => r.name === "System Administrator");

    if (!hasAdminRole) {
      return {
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        appRegistered: true,
        roleAssigned: false,
        status: "partial",
        userId: user.systemuserid,
      };
    }

    return {
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      appRegistered: true,
      roleAssigned: true,
      status: "ready",
      userId: user.systemuserid,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's an auth error (app not registered)
    if (errorMsg.includes("not a member of the organization")) {
      return {
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        appRegistered: false,
        roleAssigned: false,
        status: "needs_setup",
        error: "App not registered in this environment",
      };
    }

    return {
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      appRegistered: false,
      roleAssigned: false,
      status: "error",
      error: errorMsg,
    };
  }
}

/**
 * Display setup status in a table
 * (Reused from setup.ts)
 */
function displaySetupStatus(statuses: SetupStatus[]): void {
  const table = new Table({
    head: ["Tenant", "App Registered", "System Admin Role", "Status"],
    style: { head: ["cyan"] },
  });

  for (const status of statuses) {
    const appRegistered = status.appRegistered ? chalk.green("Yes") : chalk.red("No");
    const roleAssigned = status.roleAssigned
      ? chalk.green("Yes")
      : status.appRegistered
        ? chalk.yellow("No")
        : chalk.gray("-");

    let statusText: string;
    if (status.status === "ready") {
      statusText = chalk.green("Ready");
    } else if (status.status === "needs_setup") {
      statusText = chalk.yellow("Needs Setup");
    } else if (status.status === "partial") {
      statusText = chalk.yellow("Needs Role");
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
}
