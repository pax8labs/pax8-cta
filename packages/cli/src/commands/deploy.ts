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
} from "@csd/core";
import { DeploymentQueueManager } from "@csd/worker";

export const deployCommand = new Command("deploy")
  .description("Deploy a solution to multiple tenants")
  .requiredOption("-s, --solution <path>", "Path to solution zip file")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Deploy only to tenants with these tags")
  .option("--all", "Deploy to all enabled tenants")
  .option("--dry-run", "Show what would be deployed without deploying")
  .option(
    "--redis <url>",
    "Redis URL for job queue",
    "redis://localhost:6379"
  )
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Validate options
      if (!options.all && (!options.tag || options.tag.length === 0)) {
        spinner.fail(
          chalk.red("Must specify --all or --tag to select target tenants")
        );
        process.exit(1);
      }

      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Configuration loaded");

      // Get target tenants
      let targetTenants: TenantConfig[];
      if (options.all) {
        targetTenants = config.tenants.filter((t) => t.enabled);
      } else {
        targetTenants = filterTenantsByTags(config, options.tag);
      }

      if (targetTenants.length === 0) {
        spinner.fail(chalk.red("No tenants matched the selection criteria"));
        process.exit(1);
      }

      // Display target tenants
      console.log();
      console.log(chalk.bold(`Target Tenants (${targetTenants.length}):`));

      const table = new Table({
        head: ["Name", "Tenant ID", "Environment", "Tags"],
        style: { head: ["cyan"] },
      });

      targetTenants.forEach((tenant) => {
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
          chalk.yellow("Dry run mode - no deployments will be created")
        );
        return;
      }

      // Verify client secret is available
      getClientSecret();

      // Create deployment
      spinner.start("Connecting to job queue...");
      const queueManager = new DeploymentQueueManager(options.redis);

      const deploymentId = crypto.randomUUID();
      const solutionPath = resolve(options.solution);

      spinner.text = "Creating deployment jobs...";

      await queueManager.addTenantDeploymentsBulk(
        deploymentId,
        solutionPath,
        targetTenants,
        config.partner.tenantId,
        config.partner.clientId
      );

      spinner.succeed(chalk.green("Deployment created successfully"));

      console.log();
      console.log(chalk.bold("Deployment Details:"));
      console.log(`  ID:        ${chalk.cyan(deploymentId)}`);
      console.log(`  Solution:  ${solutionPath}`);
      console.log(`  Tenants:   ${targetTenants.length}`);
      console.log();
      console.log(
        chalk.gray(
          `Use 'csd status --deployment ${deploymentId}' to check progress`
        )
      );
      console.log();
      console.log(
        chalk.yellow(
          "Note: Make sure the worker is running to process deployments:"
        )
      );
      console.log(chalk.gray("  pnpm worker"));

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Deployment failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
