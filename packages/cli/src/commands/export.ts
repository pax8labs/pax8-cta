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
} from "@agentcrate/core";

export const exportCommand = new Command("pack")
  .alias("export") // backwards compatibility
  .description("Pack a Copilot Studio solution into a crate for shipping")
  .requiredOption("-s, --solution <name>", "Solution unique name to pack")
  .option("-o, --output <path>", "Output warehouse for the crate", "./crates")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--unmanaged", "Pack as unmanaged solution (default: managed)")
  .action(async (options) => {
    const spinner = ora("Loading manifest...").start();

    try {
      // Load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed("Manifest loaded");

      // Get client secret
      spinner.start("Authenticating with warehouse...");
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
      spinner.succeed("Connected to source warehouse");

      // Build output path
      const managed = !options.unmanaged;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const outputDir = resolve(options.output);
      const outputPath = `${outputDir}/${options.solution}_${timestamp}_${suffix}.zip`;

      // Export solution
      spinner.start(`Packing solution '${options.solution}' into crate...`);
      const metadata = await solutionOps.exportSolution(options.solution, {
        managed,
        outputPath,
      });

      spinner.succeed(
        `Crate packed: ${chalk.green(metadata.friendlyName)} v${metadata.version}`
      );

      console.log();
      console.log(chalk.bold("Crate Contents:"));
      console.log(`  Agent:    ${metadata.friendlyName}`);
      console.log(`  Version:  ${metadata.version}`);
      console.log(`  Type:     ${managed ? "Managed" : "Unmanaged"}`);
      console.log(`  Crate:    ${chalk.cyan(outputPath)}`);
      console.log();
      console.log(
        chalk.gray(`Use 'agentcrate ship --crate ${outputPath}' to ship to your fleet`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Packing failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
