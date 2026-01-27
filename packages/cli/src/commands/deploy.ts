import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  filterTenantsByTags,
  TenantConfig,
} from "@agentsync/core";
import { DeploymentQueueManager } from "@agentsync/worker";

export const deployCommand = new Command("ship")
  .alias("deploy") // backwards compatibility
  .description("Ship crates to your fleet of tenant destinations")
  .requiredOption("-s, --solution <path>", "Path to crate (solution zip)")
  .option("--crate <path>", "Alias for --solution")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Ship only to destinations with these tags")
  .option("--all", "Ship to all destinations in the fleet")
  .option("--dry-run", "Preview shipment without shipping")
  .option(
    "--redis <url>",
    "Redis URL for shipping dock",
    "redis://localhost:6379"
  )
  .action(async (options) => {
    const spinner = ora("Loading shipping manifest...").start();

    try {
      // Validate options
      if (!options.all && (!options.tag || options.tag.length === 0)) {
        spinner.fail(
          chalk.red("Must specify --all or --tag to select destinations")
        );
        process.exit(1);
      }

      // Load config
      const configPath = resolve(options.config);
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
        console.log(
          chalk.yellow("Dry run - no crates will be shipped")
        );
        return;
      }

      // Verify client secret is available
      getClientSecret();

      // Create deployment (shipment)
      spinner.start("Connecting to shipping dock...");
      const queueManager = new DeploymentQueueManager(options.redis);

      const shipmentId = crypto.randomUUID();
      const cratePath = resolve(options.crate || options.solution);

      spinner.text = "Loading crates onto shipping dock...";

      await queueManager.addTenantDeploymentsBulk(
        shipmentId,
        cratePath,
        destinations,
        config.partner.tenantId,
        config.partner.clientId
      );

      spinner.succeed(chalk.green("Shipment dispatched successfully"));

      console.log();
      console.log(chalk.bold("Shipment Details:"));
      console.log(`  Tracking #:    ${chalk.cyan(shipmentId)}`);
      console.log(`  Crate:         ${cratePath}`);
      console.log(`  Destinations:  ${destinations.length}`);
      console.log();
      console.log(
        chalk.gray(
          `Use 'agentsync track --shipment ${shipmentId}' to track progress`
        )
      );
      console.log();
      console.log(
        chalk.yellow(
          "Note: Make sure the dockworker is running to process shipments:"
        )
      );
      console.log(chalk.gray("  pnpm worker"));

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Shipment failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
