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
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { loadConfig, getClientSecret, filterTenantsByTags, TenantConfig } from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";
import { isDemoModeEnabled, getDemoTenants } from "./demo.js";

export const deployCommand = new Command("deploy")
  .alias("ship")
  .description("Deploy agent packages to tenants")
  .requiredOption("-s, --solution <path>", "Path to agent package (solution zip)")
  .option("--agentPackage <path>", "Alias for --solution")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Ship only to destinations with these tags")
  .option("--all", "Ship to all destinations in the fleet")
  .option("--dry-run", "Preview shipment without shipping")
  .option("--redis <url>", "Redis URL for shipping dock", "redis://localhost:6379")
  .action(async (options) => {
    const spinner = ora("Loading shipping manifest...").start();

    try {
      // Validate options
      if (!options.all && (!options.tag || options.tag.length === 0)) {
        spinner.fail(chalk.red("Must specify --all or --tag to select destinations"));
        process.exit(1);
      }

      // Check for demo mode
      if (isDemoModeEnabled()) {
        spinner.succeed("Demo fleet manifest loaded");
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Showing preview\n"));

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
        console.log(`  Package:       ${options.solution || options.agentPackage}`);
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

      // Get target tenants (destinations)
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
      getClientSecret();

      // Create deployment (shipment)
      spinner.start("Connecting to shipping dock...");
      const queueManager = new DeploymentQueueManager(options.redis);

      const shipmentId = randomUUID();
      const agentPackagePath = resolve(options.agentPackage || options.solution);

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
    } catch (error) {
      spinner.fail(chalk.red("Shipment failed"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
