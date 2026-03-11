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
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  filterTenantsByTags,
  TenantConfig,
  TokenManager,
  DataverseClient,
  SolutionOperations,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { isDemoModeEnabled, getDemoTenants } from "./demo.js";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { formatError, printError } from "../lib/error-handler.js";

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

interface BusinessUnit {
  businessunitid: string;
  name: string;
}

interface PrepareEnvironmentResult {
  success: boolean;
  message: string;
}

export const deployCommand = new Command("deploy")
  .alias("ship")
  .description("Deploy agent packages to tenants (from solution name or zip file)")
  .requiredOption(
    "-s, --solution <name|path>",
    "Solution name or path to agent package (solution zip)"
  )
  .option("--agentPackage <path>", "Alias for --solution")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Ship only to destinations with these tags")
  .option("--all", "Ship to all destinations in the fleet")
  .option("--dry-run", "Preview shipment without shipping")
  .option("--managed", "Export as managed solution (default, used with solution name)")
  .option("--unmanaged", "Export as unmanaged solution (used with solution name)")
  .option("--keep-package", "Keep exported package after deployment (used with solution name)")
  .option("--package-dir <path>", "Directory for exported package (default: temp directory)")
  .option("--no-auto-setup", "Disable automatic application user setup")
  .option("--redis <url>", "Redis URL for shipping dock", "redis://localhost:6379")
  .action(async (options) => {
    const spinner = ora("Loading shipping manifest...").start();

    // Declare these outside try block so they're accessible in catch
    let agentPackagePath: string;
    let tempPackagePath: string | null = null;

    try {
      // Validate options
      if (!options.all && (!options.tag || options.tag.length === 0)) {
        spinner.fail(chalk.red("Must specify --all or --tag to select destinations"));
        process.exit(1);
      }

      // Determine if this is a solution name or file path
      const solutionArg = options.agentPackage || options.solution;
      // Treat as file path if it ends with .zip (regardless of existence - we'll validate later)
      const isFilePath = solutionArg.endsWith(".zip");

      // Check for demo mode
      if (isDemoModeEnabled()) {
        spinner.succeed("Demo fleet manifest loaded");
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Showing preview\n"));

        // In demo mode, show export simulation if solution name provided
        if (!isFilePath) {
          console.log(chalk.bold("📤 Export Simulation:"));
          console.log(`  Solution:      ${chalk.green(solutionArg)}`);
          console.log(`  Version:       1.0.0.2 (demo)`);
          console.log(`  Type:          ${options.unmanaged ? "Unmanaged" : "Managed"}`);
          console.log();
        }

        const destinations = getDemoTenants(options);

        if (destinations.length === 0) {
          spinner.fail(chalk.red("No destinations matched the selection criteria"));
          process.exit(1);
        }

        // Display destinations
        console.log(chalk.bold(`📦 Shipping Destinations (${destinations.length}):`));
        console.log();

        const table = new Table({
          head: ["Destination", "Tenant ID", "Port", "Tags"],
          style: { head: ["cyan"] },
        });

        destinations.forEach((tenant) => {
          table.push([
            tenant.name,
            tenant.tenantId.slice(0, 8) + "...",
            new URL(tenant.environmentUrl).hostname,
            tenant.tags?.join(", ") || "-",
          ]);
        });

        console.log(table.toString());
        console.log();

        const demoShipmentId = `dep-demo-${Date.now().toString(36)}`;

        console.log(chalk.green("✓ Shipment dispatched successfully (demo)"));
        console.log();
        console.log(chalk.bold("📋 Shipment Details:"));
        console.log(`  Tracking #:    ${chalk.cyan(demoShipmentId)}`);
        console.log(`  Package:       ${isFilePath ? solutionArg : `${solutionArg} (exported)`}`);
        console.log(`  Destinations:  ${destinations.length}`);
        console.log();
        console.log(
          chalk.gray(`Use 'agentsync track --shipment ${demoShipmentId}' to track progress`)
        );
        console.log(chalk.yellow("\nNote: In demo mode, no actual deployment occurs"));
        return;
      }

      // Load config
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Manifest loaded");

      // Get target tenants (destinations) - do this early to fail fast on invalid selection
      let destinations: TenantConfig[];
      if (options.all) {
        destinations = config.tenants.filter((t) => t.enabled);
      } else {
        destinations = filterTenantsByTags(config, options.tag);
      }

      if (destinations.length === 0) {
        spinner.fail(chalk.red("No destinations matched the selection criteria"));
        process.exit(1);
      }

      // If solution name provided, export it first
      if (!isFilePath) {
        // Validate source environment is configured
        if (!config.source || !config.source.environmentUrl) {
          spinner.fail(chalk.red("Source environment not configured"));
          console.error(
            chalk.red(
              "\nTo deploy from solution name, configure a source environment in your config file:"
            )
          );
          console.error(chalk.gray("  source:"));
          console.error(chalk.gray("    tenantId: <tenant-id>"));
          console.error(chalk.gray("    environmentUrl: <environment-url>"));
          console.error(
            chalk.gray("\nOr set environment variables: SOURCE_TENANT_ID, SOURCE_ENVIRONMENT_URL")
          );
          process.exit(1);
        }

        // Get client secret once for reuse
        const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");

        // Auto-detect solution mode if not explicitly specified
        let managed = !options.unmanaged;
        if (!options.managed && !options.unmanaged) {
          spinner.start("Detecting solution mode in target environments...");

          const modeCheck = await detectSolutionMode(
            solutionArg,
            destinations,
            config.partner.clientId,
            clientSecret
          );

          if (modeCheck.hasConflict) {
            spinner.warn(chalk.yellow("Mixed solution modes detected in targets"));
            console.log();
            console.log(chalk.yellow("⚠ Warning: Solution exists with different modes:"));
            if (modeCheck.managedCount > 0) {
              console.log(chalk.gray(`  ${modeCheck.managedCount} target(s) have it as managed`));
            }
            if (modeCheck.unmanagedCount > 0) {
              console.log(
                chalk.gray(`  ${modeCheck.unmanagedCount} target(s) have it as unmanaged`)
              );
            }
            if (modeCheck.notInstalledCount > 0) {
              console.log(
                chalk.gray(`  ${modeCheck.notInstalledCount} target(s) don't have it installed`)
              );
            }
            console.log();
            console.log(chalk.gray("Use --managed or --unmanaged to specify which mode to use."));
            console.log(chalk.gray("Targets with mismatched mode will fail to import."));
            console.log();
            // Default to majority mode
            managed = modeCheck.managedCount >= modeCheck.unmanagedCount;
            console.log(
              chalk.cyan(`Proceeding with ${managed ? "managed" : "unmanaged"} mode (majority)`)
            );
            console.log();
          } else if (modeCheck.unmanagedCount > 0) {
            // All existing installations are unmanaged
            managed = false;
            spinner.succeed(
              `Auto-detected: exporting as unmanaged (matches ${modeCheck.unmanagedCount} target(s))`
            );
          } else if (modeCheck.managedCount > 0) {
            // All existing installations are managed
            managed = true;
            spinner.succeed(
              `Auto-detected: exporting as managed (matches ${modeCheck.managedCount} target(s))`
            );
          } else {
            // Not installed anywhere - use default (managed)
            spinner.succeed("Solution not installed in targets - using managed mode (default)");
          }
        }

        spinner.start(`Exporting solution '${solutionArg}' from source...`);

        try {
          // Authenticate and create client for source
          const tokenManager = new TokenManager({
            tenantId: config.partner.tenantId,
            clientId: config.partner.clientId,
            clientSecret,
          });

          const dataverseClient = new DataverseClient({
            environmentUrl: config.source.environmentUrl,
            tokenManager,
          });

          const solutionOps = new SolutionOperations(dataverseClient);

          // Export with detected/specified mode
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const suffix = managed ? "managed" : "unmanaged";

          // Determine output directory
          const outputDir = options.packageDir ? resolve(options.packageDir) : tmpdir();
          const outputPath = join(outputDir, `${solutionArg}_${timestamp}_${suffix}.zip`);

          // Export solution
          const metadata = await solutionOps.exportSolution(solutionArg, {
            managed,
            outputPath,
          });

          spinner.succeed(
            `Exported ${chalk.green(metadata.friendlyName)} v${metadata.version} (${suffix})`
          );

          agentPackagePath = outputPath;
          if (!options.keepPackage) {
            tempPackagePath = outputPath;
          }

          console.log();
        } catch (error) {
          spinner.fail(chalk.red("Export failed"));

          // Format and print structured error with recovery guidance
          const agentSyncError = formatError(error);
          printError(agentSyncError);

          process.exit(1);
        }
      } else {
        agentPackagePath = resolve(solutionArg);

        // Validate file exists (skip in dry-run mode where we just want to preview)
        if (!options.dryRun && !existsSync(agentPackagePath)) {
          spinner.fail(chalk.red(`Package not found: ${agentPackagePath}`));
          process.exit(1);
        }
      }

      // Display destinations
      console.log();
      console.log(chalk.bold(`Shipping Destinations (${destinations.length}):`));

      const table = new Table({
        head: ["Destination", "Tenant ID", "Port", "Tags"],
        style: { head: ["cyan"] },
      });

      destinations.forEach((tenant) => {
        table.push([
          tenant.name,
          tenant.tenantId.slice(0, 8) + "...",
          new URL(tenant.environmentUrl).hostname,
          tenant.tags?.join(", ") || "-",
        ]);
      });

      console.log(table.toString());
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - no agent packages will be shipped"));
        return;
      }

      // Verify client secret is available
      await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");

      // Auto-setup app users if needed (unless --no-auto-setup)
      if (options.autoSetup !== false) {
        console.log(chalk.bold("Checking application users..."));
        let setupCount = 0;
        let warningCount = 0;

        for (const tenant of destinations) {
          const prepareSpinner = ora(`Checking ${tenant.name}...`).start();
          const prepared = await prepareEnvironment(config, tenant);

          if (prepared.success) {
            prepareSpinner.succeed(chalk.green(`${tenant.name}: ${prepared.message}`));
            if (prepared.message.includes("Created") || prepared.message.includes("Assigned")) {
              setupCount++;
            }
          } else {
            prepareSpinner.warn(chalk.yellow(`${tenant.name}: ${prepared.message}`));
            warningCount++;
          }
        }

        console.log();
        if (setupCount > 0) {
          console.log(chalk.green(`✓ ${setupCount} environment(s) setup completed`));
        }
        if (warningCount > 0) {
          console.log(
            chalk.yellow(`⚠ ${warningCount} environment(s) skipped (see warnings above)`)
          );
        }
        console.log();
      }

      // Create deployment (shipment)
      spinner.start("Connecting to shipping dock...");
      const queueManager = new DeploymentQueueManager(options.redis);

      const shipmentId = randomUUID();

      spinner.text = "Loading agent packages onto shipping dock...";

      await queueManager.addTenantDeploymentsBulk(
        shipmentId,
        agentPackagePath,
        destinations,
        config.partner.tenantId,
        config.partner.clientId
      );

      spinner.succeed(chalk.green("Shipment dispatched successfully"));

      console.log();
      console.log(chalk.bold("Shipment Details:"));
      console.log(`  Tracking #:    ${chalk.cyan(shipmentId)}`);
      console.log(`  Agent package:         ${agentPackagePath}`);
      console.log(`  Destinations:  ${destinations.length}`);
      console.log();
      console.log(chalk.gray(`Use 'agentsync track --shipment ${shipmentId}' to track progress`));
      console.log();
      console.log(chalk.yellow("Note: Make sure the dockworker is running to process shipments:"));
      console.log(chalk.gray("  pnpm worker"));

      await queueManager.close();

      // Clean up temp package if needed
      if (tempPackagePath && existsSync(tempPackagePath)) {
        try {
          unlinkSync(tempPackagePath);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      spinner.fail(chalk.red("Shipment failed"));

      // Format and print structured error with recovery guidance
      const agentSyncError = formatError(error);
      printError(agentSyncError);

      // Clean up temp package on error
      if (tempPackagePath && existsSync(tempPackagePath)) {
        try {
          unlinkSync(tempPackagePath);
        } catch {
          // Ignore cleanup errors
        }
      }

      process.exit(1);
    }
  });

/**
 * Prepare environment by ensuring app user exists and has proper permissions
 * Reuses logic from setup.ts checkSetupStatus and setupTenant functions
 */
async function prepareEnvironment(
  config: { partner: { tenantId: string; clientId: string } },
  tenant: TenantConfig
): Promise<PrepareEnvironmentResult> {
  try {
    const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");
    const tokenManager = new TokenManager({
      tenantId: tenant.tenantId,
      clientId: config.partner.clientId,
      clientSecret: clientSecret,
    });

    const client = new DataverseClient({
      environmentUrl: tenant.environmentUrl,
      tokenManager,
    });

    const appId = config.partner.clientId;

    // Check if app user exists
    const userResult = await client.get<{ value: SystemUser[] }>("/systemusers", {
      $filter: `applicationid eq '${appId}'`,
      $select: "systemuserid,fullname,applicationid,isdisabled",
    });

    let userId: string | undefined;
    let appRegistered = userResult.value.length > 0;

    // Create app user if needed
    if (!appRegistered) {
      try {
        // Get root business unit
        const buResult = await client.get<{ value: BusinessUnit[] }>("/businessunits", {
          $filter: "parentbusinessunitid eq null",
          $select: "businessunitid,name",
        });

        if (buResult.value.length === 0) {
          return {
            success: false,
            message: "Could not find root business unit",
          };
        }

        const buId = buResult.value[0].businessunitid;

        // Create app user
        await client.post("/systemusers", {
          applicationid: appId,
          "businessunitid@odata.bind": `/businessunits(${buId})`,
        });

        // Get the newly created user's ID
        const newUserResult = await client.get<{ value: SystemUser[] }>("/systemusers", {
          $filter: `applicationid eq '${appId}'`,
          $select: "systemuserid",
        });

        if (newUserResult.value.length === 0) {
          return {
            success: false,
            message: "Failed to create app user",
          };
        }

        userId = newUserResult.value[0].systemuserid;
        appRegistered = true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes("not a member of the organization")) {
          return {
            success: false,
            message:
              "App not registered (requires manual bootstrap in Power Platform admin center)",
          };
        }
        return {
          success: false,
          message: `Failed to create app user: ${errorMsg}`,
        };
      }
    } else {
      userId = userResult.value[0].systemuserid;
    }

    // Check if System Administrator role is assigned
    const rolesResult = await client.get<{ value: SecurityRole[] }>(
      `/systemusers(${userId})/systemuserroles_association`,
      {
        $select: "roleid,name",
      }
    );

    const hasAdminRole = rolesResult.value.some((r) => r.name === "System Administrator");

    // Assign System Administrator role if needed
    if (!hasAdminRole) {
      try {
        // Get System Administrator role
        const roleResult = await client.get<{ value: SecurityRole[] }>("/roles", {
          $filter: "name eq 'System Administrator'",
          $select: "roleid,name",
        });

        if (roleResult.value.length === 0) {
          return {
            success: false,
            message: "Could not find System Administrator role",
          };
        }

        const roleId = roleResult.value[0].roleid;

        // Assign role to user
        const apiUrl = tenant.environmentUrl.replace(/\/$/, "") + "/api/data/v9.2";
        await client.post(`/systemusers(${userId})/systemuserroles_association/$ref`, {
          "@odata.id": `${apiUrl}/roles(${roleId})`,
        });

        // Determine what was done
        if (userResult.value.length === 0) {
          return {
            success: true,
            message: "Created app user and assigned System Administrator role",
          };
        } else {
          return {
            success: true,
            message: "Assigned System Administrator role",
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to assign role: ${errorMsg}`,
        };
      }
    }

    // If we created the user, report that
    if (userResult.value.length === 0) {
      return {
        success: true,
        message: "Created app user with System Administrator role",
      };
    }

    // Otherwise, everything was already ready
    return {
      success: true,
      message: "Ready",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's an auth error (app not registered)
    if (errorMsg.includes("not a member of the organization")) {
      return {
        success: false,
        message: "App not registered (requires manual bootstrap in Power Platform admin center)",
      };
    }

    return {
      success: false,
      message: `Error: ${errorMsg}`,
    };
  }
}

interface SolutionRecord {
  solutionid: string;
  uniquename: string;
  ismanaged: boolean;
}

interface SolutionModeCheck {
  managedCount: number;
  unmanagedCount: number;
  notInstalledCount: number;
  hasConflict: boolean;
}

/**
 * Check solution installation mode across target environments
 * Returns counts of managed/unmanaged/not-installed to help auto-detect export mode
 */
async function detectSolutionMode(
  solutionName: string,
  targets: TenantConfig[],
  clientId: string,
  clientSecret: string
): Promise<SolutionModeCheck> {
  let managedCount = 0;
  let unmanagedCount = 0;
  let notInstalledCount = 0;

  // Check each target in parallel for speed
  const checks = targets.map(async (tenant) => {
    try {
      const tokenManager = new TokenManager({
        tenantId: tenant.tenantId,
        clientId,
        clientSecret,
      });

      const client = new DataverseClient({
        environmentUrl: tenant.environmentUrl,
        tokenManager,
      });

      const result = await client.get<{ value: SolutionRecord[] }>("/solutions", {
        $filter: `uniquename eq '${solutionName}'`,
        $select: "solutionid,uniquename,ismanaged",
      });

      if (result.value.length === 0) {
        return "not_installed";
      }

      return result.value[0].ismanaged ? "managed" : "unmanaged";
    } catch {
      // If we can't check, assume not installed (will fail at import if wrong)
      return "not_installed";
    }
  });

  const results = await Promise.all(checks);

  for (const mode of results) {
    if (mode === "managed") managedCount++;
    else if (mode === "unmanaged") unmanagedCount++;
    else notInstalledCount++;
  }

  // Conflict if we have both managed and unmanaged installations
  const hasConflict = managedCount > 0 && unmanagedCount > 0;

  return {
    managedCount,
    unmanagedCount,
    notInstalledCount,
    hasConflict,
  };
}
