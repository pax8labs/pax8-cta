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
import chalk from "chalk";
import { createSpinner } from "../../lib/spinner.js";
import { loadConfig, GdapClient } from "@agentsync/core";
import { getClientSecretWithFallback } from "../../lib/credentials.js";
import { handleCommandError } from "../../lib/errors.js";

export const inspectCommand = new Command("inspect")
  .alias("validate")
  .description("Validate connectivity and permissions for each tenant")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .addHelpText("after", `
Examples:
  agentsync tenants inspect                           Validate all enabled tenants
  agentsync tenants inspect -t production             Validate only tenants tagged "production"
`)
  .action(async (options) => {
    const spinner = createSpinner("Loading fleet manifest...").start();

    try {
      const configPath = resolve(process.cwd(), options.config);
      const config = await loadConfig(configPath);

      let destinations = config.tenants.filter((t) => t.enabled);
      if (options.tag && options.tag.length > 0) {
        destinations = destinations.filter((t) =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      spinner.succeed(`Loaded ${destinations.length} destinations to inspect`);

      // Get client secret
      const clientSecret = await getClientSecretWithFallback();

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
          const hasRelationship = await gdapClient.hasActiveRelationship(tenant.tenantId);
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
            spinner.fail(`${tenant.name}: ${chalk.red("No shipping route (GDAP relationship)")}`);
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
      const noRoute = results.filter((r) => !r.hasRelationship && !r.error).length;
      const errors = results.filter((r) => r.error).length;

      console.log(`  ${chalk.green("✓")} Routes Clear:         ${clearRoutes}`);
      console.log(`  ${chalk.yellow("⚠")} Missing Clearance:    ${missingClearance}`);
      console.log(`  ${chalk.red("✗")} No Route:             ${noRoute}`);
      console.log(`  ${chalk.red("✗")} Inspection Errors:    ${errors}`);
      console.log();

      if (clearRoutes === results.length) {
        console.log(chalk.green("🚢 All shipping routes inspected and clear!"));
      } else {
        console.log(
          chalk.yellow(
            `⚠️  ${results.length - clearRoutes} destination(s) have shipping route issues.`
          )
        );
      }
    } catch (error) {
      handleCommandError(error, spinner, "Inspection failed");
    }
  });
