import { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  GdapClient,
} from "@agentcrate/core";

export const tenantsCommand = new Command("fleet")
  .alias("tenants") // backwards compatibility
  .description("Manage your fleet of tenant destinations");

tenantsCommand
  .command("list")
  .alias("ls")
  .description("List all destinations in your fleet")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .action(async (options) => {
    const spinner = ora("Loading fleet manifest...").start();

    try {
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed(`Loaded ${config.tenants.length} destinations from manifest`);

      let destinations = config.tenants;
      if (options.tag && options.tag.length > 0) {
        destinations = destinations.filter((t) =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      console.log();

      const table = new Table({
        head: ["Destination", "Tenant ID", "Port (Environment)", "Tags", "Active"],
        style: { head: ["cyan"] },
      });

      destinations.forEach((tenant) => {
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
        chalk.gray(`Fleet size: ${destinations.length} destinations (${config.tenants.filter(t => t.enabled).length} active)`)
      );
    } catch (error) {
      spinner.fail(chalk.red("Failed to load fleet manifest"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

tenantsCommand
  .command("inspect")
  .alias("validate")
  .description("Inspect fleet and validate shipping routes (GDAP access)")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .action(async (options) => {
    const spinner = ora("Loading fleet manifest...").start();

    try {
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);

      let destinations = config.tenants.filter((t) => t.enabled);
      if (options.tag && options.tag.length > 0) {
        destinations = destinations.filter((t) =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      spinner.succeed(`Loaded ${destinations.length} destinations to inspect`);

      // Get client secret
      const clientSecret = getClientSecret();

      // Create GDAP client
      const gdapClient = new GdapClient({
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
        clientSecret,
      });

      console.log();
      console.log(chalk.bold("🔍 Inspecting Shipping Routes"));
      console.log("─".repeat(60));

      const results: Array<{
        name: string;
        tenantId: string;
        hasRelationship: boolean;
        hasPowerPlatformAccess: boolean;
        error?: string;
      }> = [];

      for (const tenant of destinations) {
        spinner.start(`Inspecting route to ${tenant.name}...`);

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
            spinner.succeed(`${tenant.name}: ${chalk.green("Route clear ✓")}`);
          } else if (hasRelationship) {
            spinner.warn(
              `${tenant.name}: ${chalk.yellow("Missing customs clearance (Power Platform Admin role)")}`
            );
          } else {
            spinner.fail(
              `${tenant.name}: ${chalk.red("No shipping route (GDAP relationship)")}`
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
      console.log(chalk.bold("📋 Inspection Report"));
      console.log("─".repeat(60));

      const clearRoutes = results.filter((r) => r.hasPowerPlatformAccess).length;
      const missingClearance = results.filter(
        (r) => r.hasRelationship && !r.hasPowerPlatformAccess
      ).length;
      const noRoute = results.filter(
        (r) => !r.hasRelationship && !r.error
      ).length;
      const errors = results.filter((r) => r.error).length;

      console.log(`  ${chalk.green("✓")} Routes Clear:         ${clearRoutes}`);
      console.log(`  ${chalk.yellow("⚠")} Missing Clearance:    ${missingClearance}`);
      console.log(`  ${chalk.red("✗")} No Route:             ${noRoute}`);
      console.log(`  ${chalk.red("✗")} Inspection Errors:    ${errors}`);
      console.log();

      if (clearRoutes === results.length) {
        console.log(
          chalk.green("🚢 All shipping routes inspected and clear!")
        );
      } else {
        console.log(
          chalk.yellow(
            `⚠️  ${results.length - clearRoutes} destination(s) have shipping route issues.`
          )
        );
      }
    } catch (error) {
      spinner.fail(chalk.red("Inspection failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
