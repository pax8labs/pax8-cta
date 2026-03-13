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
  environmentSetupService,
  detectSolutionMode,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { isDemoModeEnabled, getDemoTenants } from "./demo.js";
import { getClientSecretWithFallback } from "../lib/credentials.js";
import { formatError, printError } from "../lib/error-handler.js";

export const deployCommand = new Command("deploy")
  .description("Deploy a solution to multiple tenants")
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
  .option("--direct", "Deploy directly without requiring a worker (sequential)")
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

        const setupClientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");
        for (const tenant of destinations) {
          const prepareSpinner = ora(`Checking ${tenant.name}...`).start();
          const setupTokenManager = new TokenManager({
            tenantId: tenant.tenantId,
            clientId: config.partner.clientId,
            clientSecret: setupClientSecret,
          });
          const setupClient = new DataverseClient({
            environmentUrl: tenant.environmentUrl,
            tokenManager: setupTokenManager,
          });
          const prepared = await environmentSetupService.prepareEnvironment(
            setupClient,
            config.partner.clientId,
            tenant.environmentUrl
          );

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

      // Deploy - either direct or via queue
      if (options.direct) {
        // Direct deployment - import to each tenant sequentially
        console.log(chalk.bold("Deploying directly to destinations...\n"));

        const clientSecret = await getClientSecretWithFallback("PARTNER_CLIENT_SECRET");
        let successCount = 0;
        let failCount = 0;

        for (const tenant of destinations) {
          const tenantSpinner = ora(`Deploying to ${tenant.name}...`).start();

          try {
            const tokenManager = new TokenManager({
              tenantId: tenant.tenantId,
              clientId: config.partner.clientId,
              clientSecret,
            });

            const dataverseClient = new DataverseClient({
              environmentUrl: tenant.environmentUrl,
              tokenManager,
            });

            const solutionOps = new SolutionOperations(dataverseClient);

            // Start async import
            const importJobId = await solutionOps.importSolutionAsync(agentPackagePath, {
              overwriteUnmanagedCustomizations: true,
              publishWorkflows: true,
            });

            // Wait for completion with progress
            const result = await solutionOps.waitForImport(importJobId, {
              pollIntervalMs: 3000,
              timeoutMs: 300000,
              onProgress: (progress) => {
                tenantSpinner.text = `Deploying to ${tenant.name}... ${Math.round(progress)}%`;
              },
            });

            if (result.success) {
              tenantSpinner.succeed(chalk.green(`${tenant.name}: Deployed successfully`));
              successCount++;
            } else {
              tenantSpinner.fail(
                chalk.red(`${tenant.name}: ${result.error || "Deployment failed"}`)
              );
              failCount++;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            tenantSpinner.fail(chalk.red(`${tenant.name}: ${errorMsg}`));
            failCount++;
          }
        }

        console.log();
        console.log(chalk.bold("Deployment Summary:"));
        console.log(`  Total:     ${destinations.length}`);
        console.log(`  ${chalk.green("Success:")}  ${successCount}`);
        if (failCount > 0) {
          console.log(`  ${chalk.red("Failed:")}   ${failCount}`);
        }

        if (failCount > 0) {
          process.exit(1);
        }
      } else {
        // Queue-based deployment
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
        console.log(
          chalk.yellow("Note: Make sure the dockworker is running to process shipments:")
        );
        console.log(chalk.gray("  pnpm worker"));

        await queueManager.close();
      }

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
