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
import { createSpinner, isQuietMode } from "../lib/spinner.js";
import { withDemoMode } from "../lib/command-wrapper.js";
import { DEMO_TENANTS } from "@agentsync/core";
import { formatStatus, formatTimeAgo, calculateDuration, truncate } from "../lib/formatters.js";
import { loadConfig, TenantConfig, TokenManager, DataverseClient } from "@agentsync/core";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { handleCommandError } from "../lib/errors.js";
import { exitOssUnavailable } from "../lib/oss-surface.js";
import { output, resolveFormat, type Column, type OutputFormat } from "../lib/output.js";

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

// ---------------------------------------------------------------------------
// Issue #358: route status output through output() so --quiet / --json /
// TTY-default behave consistently across all three rendering paths
// (--list shipments, shipment details, --setup).
// ---------------------------------------------------------------------------

interface ShipmentListRow {
  id: string;
  agent: string;
  status: string;
  progress: string;
  created: string;
}

const SHIPMENT_LIST_COLUMNS: Column<ShipmentListRow>[] = [
  { key: "id", header: "Tracking #", format: (v) => chalk.cyan(String(v)) },
  { key: "agent", header: "Agent" },
  { key: "status", header: "Status" },
  { key: "progress", header: "Progress" },
  { key: "created", header: "Created", format: (v) => chalk.gray(String(v)) },
];

interface ShipmentDestinationRow {
  destination: string;
  status: string;
  transitTime: string;
  issue: string;
}

const SHIPMENT_DESTINATION_COLUMNS: Column<ShipmentDestinationRow>[] = [
  { key: "destination", header: "Destination" },
  { key: "status", header: "Status" },
  { key: "transitTime", header: "Transit Time" },
  {
    key: "issue",
    header: "Issue",
    format: (v) => (v && v !== "-" ? chalk.red(truncate(String(v), 35)) : "-"),
  },
];

interface SetupStatusRow {
  tenant: string;
  appRegistered: string;
  systemAdminRole: string;
  status: string;
}

const SETUP_STATUS_COLUMNS: Column<SetupStatusRow>[] = [
  { key: "tenant", header: "Tenant" },
  {
    key: "appRegistered",
    header: "App Registered",
    format: (v) => (v === "Yes" ? chalk.green("Yes") : chalk.red("No")),
  },
  {
    key: "systemAdminRole",
    header: "System Admin Role",
    format: (v) => {
      if (v === "Yes") return chalk.green("Yes");
      if (v === "No") return chalk.yellow("No");
      return chalk.gray("-");
    },
  },
  {
    key: "status",
    header: "Status",
    format: (v) => {
      if (v === "Ready") return chalk.green("Ready");
      if (v === "Needs Setup") return chalk.yellow("Needs Setup");
      if (v === "Needs Role") return chalk.yellow("Needs Role");
      return chalk.red("Error");
    },
  },
];

/** True when format is something other than the human "table" rendering. */
function isStructured(fmt: OutputFormat): boolean {
  return fmt !== "table";
}

export const statusCommand = new Command("status")
  .alias("track")
  .description("Check deployment status")
  .option("-d, --deployment <id>", "Deployment ID to track")
  .option(
    "-s, --shipment <id>",
    "Deprecated alias for --deployment (kept for backward compatibility)"
  )
  .option("-l, --list", "List all recent deployments")
  .option("--setup", "Show comprehensive setup status")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output (exit code only)")
  .action(async (options, cmd) => {
    // Merge global flags (--json, --quiet, --ids-only registered on root) into
    // local options so callers using either form work identically.
    Object.assign(options, cmd.optsWithGlobals());
    const fmt: OutputFormat = resolveFormat({
      json: options.json,
      quiet: options.quiet,
    });
    const structured = isStructured(fmt);

    // Handle --setup flag
    if (options.setup) {
      await handleSetupStatus(options, fmt);
      return;
    }

    // Default to --list behavior when no specific flag is provided.
    // "agentsync status" with no args is the natural way users ask
    // "what's running" — treating it as an error (issue #384) was hostile.
    const trackingId = options.shipment || options.deployment;
    if (!options.list && !trackingId) {
      if (!isQuietMode() && !structured) {
        console.error(
          chalk.gray("(no flags given — showing recent deployments; use --help for options)")
        );
      }
      options.list = true;
    }

    // Handle --list flag
    if (options.list) {
      await withDemoMode(
        () => {
          if (!isQuietMode() && !structured) {
            console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing mock deployments\n"));
          }

          const rows: ShipmentListRow[] = DEMO_DEPLOYMENTS.map((d) => {
            const progress = `${d.completedTenants}/${d.totalTenants}`;
            const statusText =
              d.status === "completed"
                ? d.failedTenants > 0
                  ? chalk.yellow("⚠ Completed")
                  : chalk.green("✓ Completed")
                : chalk.yellow("● In Progress");
            return {
              id: d.id,
              agent: d.solutionName,
              status: statusText,
              progress: d.failedTenants > 0 ? `${progress} (${d.failedTenants} failed)` : progress,
              created: getTimeAgo(d.createdAt),
            };
          });

          if (fmt === "json") {
            console.log(JSON.stringify({ deployments: DEMO_DEPLOYMENTS }, null, 2));
            return;
          }

          if (fmt === "quiet") return;

          console.log(chalk.bold("Recent Deployments:"));
          console.log();
          output(rows, { format: "table", columns: SHIPMENT_LIST_COLUMNS });
          console.log();
          console.log(chalk.gray(`Use 'agentsync deployments show <id>' to view details`));
        },
        () => {
          exitOssUnavailable("'status --list'", {
            alternatives: ["deployments list"],
          });
        }
      );
      return;
    }

    // Defensive: with the default-to-list branch above this is unreachable,
    // but keep the guard so a future refactor can't silently fall through.
    if (!trackingId) {
      console.error(chalk.red("Error: must specify --deployment <id>, or use --list."));
      process.exit(2);
    }

    await withDemoMode(
      () => {
        if (!isQuietMode() && !structured) {
          console.error(chalk.yellow("\n⚠️  DEMO MODE - Showing mock data\n"));
        }

        const deployment = getDemoDeploymentDetails(trackingId);

        if (!deployment) {
          if (fmt === "json") {
            console.log(
              JSON.stringify(
                {
                  deployment: null,
                  trackingId,
                  available: DEMO_DEPLOYMENTS.map((d) => ({
                    id: d.id,
                    solutionName: d.solutionName,
                  })),
                },
                null,
                2
              )
            );
            return;
          }
          if (fmt === "quiet") return;

          console.log(chalk.yellow(`Deployment '${trackingId}' not found`));
          console.log();
          console.log(chalk.gray("Available demo deployments:"));
          DEMO_DEPLOYMENTS.forEach((d) => {
            console.log(chalk.gray(`  - ${chalk.cyan(d.id)} (${d.solutionName})`));
          });
          return;
        }

        if (fmt === "json") {
          console.log(JSON.stringify({ deployment }, null, 2));
          return;
        }

        if (fmt === "quiet") return;

        // Display overall status
        console.log(chalk.bold("📋 Deployment Tracking"));
        console.log("─".repeat(50));
        console.log(`  Deployment ID:  ${deployment.id}`);
        console.log(`  Solution:       ${deployment.solutionName}`);
        console.log(`  Status:         ${formatTrackingStatus(deployment.status)}`);
        console.log(
          `  Completed:      ${deployment.completedTenants}/${deployment.totalTenants} target tenants`
        );
        if (deployment.failedTenants > 0) {
          console.log(
            `  Failed:         ${chalk.red(deployment.failedTenants.toString())} tenant(s)`
          );
        }
        console.log();

        // Display per-tenant results via output() so future formatters plug in here.
        const destRows: ShipmentDestinationRow[] = deployment.tenantResults.map((result) => ({
          destination: result.tenantName,
          status: formatTrackingStatus(result.status),
          transitTime: calculateDuration(result.startedAt, result.completedAt),
          issue: result.error ?? "-",
        }));

        output(destRows, { format: "table", columns: SHIPMENT_DESTINATION_COLUMNS });
        console.log();
        console.log(chalk.gray("Demo mode - use 'demo off' to disable"));
      },
      () => {
        exitOssUnavailable("'status' tracking view", {
          alternatives: [`deployments show ${trackingId}`],
        });
      }
    );
  });

// Tracking-style status formatting for the per-deployment view
const formatTrackingStatus = (status: string) => formatStatus(status, "tracking");

// Alias for backward compatibility
const getTimeAgo = formatTimeAgo;

/**
 * Handle --setup flag to show comprehensive setup status.
 *
 * In structured (--json / --quiet / pipe-default) modes the human banners
 * and intermediate "Checking ..." prints are suppressed; the final state is
 * emitted as a single JSON envelope (or nothing for --quiet).
 */
async function handleSetupStatus(options: { config: string }, fmt: OutputFormat): Promise<void> {
  const structured = isStructured(fmt);
  const spinner = createSpinner("Loading configuration...").start();

  try {
    // Check config file existence
    const configPath = resolve(process.cwd(), options.config);
    const configExists = existsSync(configPath);

    if (!structured) {
      console.log();
      console.log(chalk.bold("Configuration Status"));
      console.log("─".repeat(50));
    }

    if (!configExists) {
      spinner.stop();
      if (fmt === "json") {
        console.log(
          JSON.stringify(
            {
              configFile: { exists: false, path: configPath },
              tenants: [],
              summary: { ready: 0, total: 0 },
            },
            null,
            2
          )
        );
        return;
      }
      if (fmt === "quiet") return;
      console.log(`  Config file:     ${chalk.red("✗")} Not found at ${configPath}`);
      console.log();
      console.log(chalk.yellow("Next steps:"));
      console.log(`  1. Create config file at ${configPath}`);
      console.log("  2. Then run 'status --setup' again");
      return;
    }

    if (!structured) {
      console.log(`  Config file:     ${chalk.green("✓")} Found at ${configPath}`);
    }

    // Load config
    const config = await loadConfig(configPath);
    spinner.text = "Configuration loaded";

    // Check client secret
    let hasClientSecret = false;
    try {
      await getClientSecretWithFallback();
      hasClientSecret = true;
      if (!structured) {
        console.log(`  Client secret:   ${chalk.green("✓")} Found (environment or keychain)`);
      }
    } catch {
      if (!structured) {
        console.log(`  Client secret:   ${chalk.red("✗")} Not found in environment or keychain`);
      }
    }

    // Show source environment info
    if (!structured && config.source) {
      console.log(`  Source env:      ${chalk.green("✓")} ${config.source.environmentUrl}`);
    }

    if (!structured) {
      console.log();
    }
    spinner.succeed("Configuration loaded");

    if (!hasClientSecret) {
      if (fmt === "json") {
        console.log(
          JSON.stringify(
            {
              configFile: { exists: true, path: configPath },
              clientSecret: false,
              tenants: [],
              summary: { ready: 0, total: 0 },
            },
            null,
            2
          )
        );
        return;
      }
      if (fmt === "quiet") return;
      console.log();
      console.log(chalk.yellow("Cannot check tenant setup without client secret."));
      console.log();
      console.log(chalk.yellow("Next steps:"));
      console.log("  1. Set PARTNER_CLIENT_SECRET environment variable");
      console.log("  2. Then run 'status --setup' again");
      return;
    }

    // Get enabled tenants
    const enabledTenants = config.tenants.filter((t) => t.enabled);

    if (enabledTenants.length === 0) {
      if (fmt === "json") {
        console.log(
          JSON.stringify(
            {
              configFile: { exists: true, path: configPath },
              clientSecret: true,
              tenants: [],
              summary: { ready: 0, total: 0 },
            },
            null,
            2
          )
        );
        return;
      }
      if (fmt === "quiet") return;
      console.log();
      console.log(chalk.yellow("No enabled tenants found in configuration."));
      return;
    }

    if (!structured) {
      console.log();
      console.log(chalk.bold(`Checking ${enabledTenants.length} tenant(s)...`));
      console.log();
    }

    // Check setup status for each tenant
    const statuses: SetupStatus[] = [];
    for (const tenant of enabledTenants) {
      const status = await checkSetupStatus(config, tenant);
      statuses.push(status);
    }

    // Calculate summary up-front; reused by both human and JSON paths.
    const readyCount = statuses.filter((s) => s.status === "ready").length;
    const needsSetupCount = statuses.filter(
      (s) => s.status === "needs_setup" || s.status === "partial"
    ).length;
    const errorCount = statuses.filter((s) => s.status === "error").length;

    if (fmt === "json") {
      console.log(
        JSON.stringify(
          {
            configFile: { exists: true, path: configPath },
            clientSecret: true,
            tenants: statuses,
            summary: {
              total: statuses.length,
              ready: readyCount,
              needsSetup: needsSetupCount,
              errors: errorCount,
            },
          },
          null,
          2
        )
      );
      return;
    }

    if (fmt === "quiet") return;

    // Display per-tenant status (table mode)
    displaySetupStatus(statuses);

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
          console.log(`  1. Run ${chalk.cyan("'setup --all'")} to create app users`);
        } else {
          console.log("  1. Setup individual tenants:");
          tenantsNeedingSetup.forEach((s) => {
            console.log(`     ${chalk.cyan(`setup --tenant "${s.tenantName}"`)}`);
          });
        }
        console.log(`  2. Then: ${chalk.cyan("deploy --all --solution ./agent.zip")}`);
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
 * Display setup status in a table — routed through output() so the same
 * column schema feeds future formatters (CSV, etc.). Per-cell colouring
 * lives in SETUP_STATUS_COLUMNS so the raw status strings here stay simple.
 */
function displaySetupStatus(statuses: SetupStatus[]): void {
  const rows: SetupStatusRow[] = statuses.map((status) => {
    let statusLabel: string;
    if (status.status === "ready") statusLabel = "Ready";
    else if (status.status === "needs_setup") statusLabel = "Needs Setup";
    else if (status.status === "partial") statusLabel = "Needs Role";
    else statusLabel = "Error";

    return {
      tenant: status.tenantName,
      appRegistered: status.appRegistered ? "Yes" : "No",
      systemAdminRole: status.roleAssigned ? "Yes" : status.appRegistered ? "No" : "-",
      status: statusLabel,
    };
  });

  output(rows, { format: "table", columns: SETUP_STATUS_COLUMNS });

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
