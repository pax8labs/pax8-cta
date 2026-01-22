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
} from "@csd/core";

export const importCommand = new Command("import")
  .description("Import a solution to a single tenant (for testing)")
  .requiredOption("-s, --solution <path>", "Path to solution zip file")
  .requiredOption("-t, --tenant <id>", "Target tenant ID")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--no-overwrite", "Do not overwrite unmanaged customizations")
  .option("--no-publish", "Do not publish workflows after import")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);

      // Find target tenant
      const tenant = getTenantById(config, options.tenant);
      if (!tenant) {
        throw new Error(`Tenant '${options.tenant}' not found in config`);
      }
      spinner.succeed(`Configuration loaded - Target: ${tenant.name}`);

      // Get client secret
      spinner.start("Authenticating...");
      const clientSecret = getClientSecret();

      // Create token manager for the customer tenant
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
      spinner.succeed(`Authenticated to ${tenant.name}`);

      // Import solution
      const solutionPath = resolve(options.solution);
      spinner.start(`Importing solution to ${tenant.name}...`);

      const importJobId = await solutionOps.importSolutionAsync(solutionPath, {
        overwriteUnmanagedCustomizations: options.overwrite !== false,
        publishWorkflows: options.publish !== false,
      });

      spinner.text = `Import started (Job ID: ${importJobId}), waiting for completion...`;

      // Wait for import with progress
      const result = await solutionOps.waitForImport(importJobId, {
        pollIntervalMs: 3000,
        timeoutMs: 300000,
        onProgress: (progress) => {
          spinner.text = `Importing to ${tenant.name}... ${progress}%`;
        },
      });

      if (result.success) {
        spinner.succeed(
          chalk.green(`Solution imported successfully to ${tenant.name}`)
        );
      } else {
        spinner.fail(chalk.red(`Import failed: ${result.error}`));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red("Import failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
