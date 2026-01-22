import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  GdapClient,
} from "@csd/core";

export const tenantsCommand = new Command("tenants")
  .description("Manage and validate tenant configurations");

tenantsCommand
  .command("list")
  .description("List all configured tenants")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed(`Loaded ${config.tenants.length} tenants from config`);

      let tenants = config.tenants;
      if (options.tag && options.tag.length > 0) {
        tenants = tenants.filter((t) =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      console.log();

      const table = new Table({
        head: ["Name", "Tenant ID", "Environment URL", "Tags", "Enabled"],
        style: { head: ["cyan"] },
      });

      tenants.forEach((tenant) => {
        table.push([
          tenant.name,
          tenant.tenantId.slice(0, 8) + "...",
          tenant.environmentUrl,
          tenant.tags?.join(", ") || "-",
          tenant.enabled ? chalk.green("Yes") : chalk.red("No"),
        ]);
      });

      console.log(table.toString());
      console.log();
      console.log(
        chalk.gray(`Total: ${tenants.length} tenants (${config.tenants.filter(t => t.enabled).length} enabled)`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Failed to load configuration"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

tenantsCommand
  .command("validate")
  .description("Validate GDAP access to all configured tenants")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .action(async (options) => {
    const spinner = ora("Loading configuration...").start();

    try {
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);

      let tenants = config.tenants.filter((t) => t.enabled);
      if (options.tag && options.tag.length > 0) {
        tenants = tenants.filter((t) =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      spinner.succeed(`Loaded ${tenants.length} tenants to validate`);

      // Get client secret
      const clientSecret = getClientSecret();

      // Create GDAP client
      const gdapClient = new GdapClient({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      console.log();
      console.log(chalk.bold("Validating GDAP Access"));
      console.log("─".repeat(60));

      const results: Array<{
        name: string;
        tenantId: string;
        hasRelationship: boolean;
        hasPowerPlatformAccess: boolean;
        error?: string;
      }> = [];

      for (const tenant of tenants) {
        spinner.start(`Checking ${tenant.name}...`);

        try {
          const hasRelationship = await gdapClient.hasActiveRelationship(
            tenant.tenantId
          );
          const hasPowerPlatformAccess = hasRelationship
            ? await gdapClient.validatePowerPlatformAccess(tenant.tenantId)
            : false;

          results.push({
            name: tenant.name,
            tenantId: tenant.tenantId,
            hasRelationship,
            hasPowerPlatformAccess,
          });

          if (hasPowerPlatformAccess) {
            spinner.succeed(`${tenant.name}: ${chalk.green("OK")}`);
          } else if (hasRelationship) {
            spinner.warn(
              `${tenant.name}: ${chalk.yellow("Missing Power Platform Admin role")}`
            );
          } else {
            spinner.fail(
              `${tenant.name}: ${chalk.red("No active GDAP relationship")}`
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({
            name: tenant.name,
            tenantId: tenant.tenantId,
            hasRelationship: false,
            hasPowerPlatformAccess: false,
            error: errorMsg,
          });
          spinner.fail(`${tenant.name}: ${chalk.red(errorMsg)}`);
        }
      }

      // Summary
      console.log();
      console.log(chalk.bold("Summary"));
      console.log("─".repeat(60));

      const valid = results.filter((r) => r.hasPowerPlatformAccess).length;
      const missingRole = results.filter(
        (r) => r.hasRelationship && !r.hasPowerPlatformAccess
      ).length;
      const noRelationship = results.filter(
        (r) => !r.hasRelationship && !r.error
      ).length;
      const errors = results.filter((r) => r.error).length;

      console.log(`  ${chalk.green("✓")} Valid:              ${valid}`);
      console.log(`  ${chalk.yellow("⚠")} Missing Role:       ${missingRole}`);
      console.log(`  ${chalk.red("✗")} No Relationship:    ${noRelationship}`);
      console.log(`  ${chalk.red("✗")} Errors:             ${errors}`);
      console.log();

      if (valid === results.length) {
        console.log(
          chalk.green("All tenants have valid GDAP access with Power Platform Admin role!")
        );
      } else {
        console.log(
          chalk.yellow(
            `${results.length - valid} tenant(s) have issues that need to be resolved.`
          )
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("Validation failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
