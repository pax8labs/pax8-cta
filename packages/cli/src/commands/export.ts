import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
} from "@csd/core";

export const exportCommand = new Command("export")
  .description("Export a Copilot Studio solution from the source environment")
  .requiredOption("-s, --solution <name>", "Solution unique name to export")
  .option("-o, --output <path>", "Output directory for the solution zip", "./solutions")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--unmanaged", "Export as unmanaged solution (default: managed)")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Configuration loaded");

      // Get client secret
      spinner.start("Authenticating...");
      const clientSecret = getClientSecret();

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
      spinner.succeed("Authenticated to source environment");

      // Build output path
      const managed = !options.unmanaged;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const outputDir = resolve(options.output);
      const outputPath = `${outputDir}/${options.solution}_${timestamp}_${suffix}.zip`;

      // Export solution
      spinner.start(`Exporting solution '${options.solution}'...`);
      const metadata = await solutionOps.exportSolution(options.solution, {
        managed,
        outputPath,
      });

      spinner.succeed(
        `Solution exported: ${chalk.green(metadata.friendlyName)} v${metadata.version}`
      );

      console.log();
      console.log(chalk.bold("Solution Details:"));
      console.log(`  Name:     ${metadata.friendlyName}`);
      console.log(`  Version:  ${metadata.version}`);
      console.log(`  Type:     ${managed ? "Managed" : "Unmanaged"}`);
      console.log(`  File:     ${chalk.cyan(outputPath)}`);
      console.log();
      console.log(
        chalk.gray(`Use 'csd deploy --solution ${outputPath}' to deploy to tenants`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Export failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
