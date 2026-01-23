import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  loadConfig,
  getClientSecret,
  getTenantById,
  TokenManager,
  DataverseClient,
  SolutionOperations,
} from "@agentcrate/core";

export const importCommand = new Command("deliver")
  .alias("import") // backwards compatibility
  .description("Deliver a crate to a single destination (for testing)")
  .requiredOption("-s, --solution <path>", "Path to crate (solution zip)")
  .option("--crate <path>", "Alias for --solution")
  .requiredOption("-t, --tenant <id>", "Destination tenant ID")
  .option("--destination <id>", "Alias for --tenant")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--no-overwrite", "Do not overwrite existing customizations")
  .option("--no-publish", "Do not activate workflows after delivery")
  .action(async (options) => {
    const spinner = ora("Loading shipping manifest...").start();

    try {
      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);

      // Find target tenant (destination)
      const destinationId = options.destination || options.tenant;
      const destination = getTenantById(config, destinationId);
      if (!destination) {
        throw new Error(`Destination '${destinationId}' not found in manifest`);
      }
      spinner.succeed(`Manifest loaded - Destination: ${destination.name}`);

      // Get client secret
      spinner.start("Establishing shipping route...");
      const clientSecret = getClientSecret();

      // Create token manager for the customer tenant
      const tokenManager = new TokenManager({
        tenantId: destination.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      const dataverseClient = new DataverseClient({
        environmentUrl: destination.environmentUrl,
        tokenManager,
      });

      const solutionOps = new SolutionOperations(dataverseClient);
      spinner.succeed(`Route established to ${destination.name}`);

      // Import solution (deliver crate)
      const cratePath = resolve(options.crate || options.solution);
      spinner.start(`Delivering crate to ${destination.name}...`);

      const importJobId = await solutionOps.importSolutionAsync(cratePath, {
        overwriteUnmanagedCustomizations: options.overwrite !== false,
        publishWorkflows: options.publish !== false,
      });

      spinner.text = `Delivery in progress (Tracking: ${importJobId}), unloading...`;

      // Wait for import with progress
      const result = await solutionOps.waitForImport(importJobId, {
        pollIntervalMs: 3000,
        timeoutMs: 300000,
        onProgress: (progress) => {
          spinner.text = `Unloading at ${destination.name}... ${progress}%`;
        },
      });

      if (result.success) {
        spinner.succeed(
          chalk.green(`📦 Crate delivered successfully to ${destination.name}`)
        );
      } else {
        spinner.fail(chalk.red(`Delivery failed: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red("Delivery failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
