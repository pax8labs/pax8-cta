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
import chalk from "chalk";
import { createSpinner } from "../../lib/spinner.js";
import { DEMO_TENANTS } from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { findTenant } from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

// ============================================================================
// tenants enable
// ============================================================================

export const enableCommand = new Command("enable")
  .argument("<tenant>", "Tenant name, ID, or URL fragment")
  .description("Enable a tenant for deployments")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = createSpinner("Enabling tenant...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

        const tenant = findTenant(DEMO_TENANTS, tenantQuery);

        if (!tenant) {
          console.log(chalk.red(`Tenant '${tenantQuery}' not found`));
          process.exit(1);
        }

        if (tenant.enabled) {
          console.log(chalk.yellow(`${tenant.name} is already enabled`));
          return;
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                tenant: tenant.name,
                tenantId: tenant.tenantId,
                enabled: true,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.green(`✔ ${tenant.name} enabled`));
        console.log();
        console.log(chalk.gray("This tenant will be included in future deployments."));
        return;
      }

      // Production mode - would update config file
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to test this command."));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to enable tenant");
    }
  });

// ============================================================================
// tenants disable
// ============================================================================

export const disableCommand = new Command("disable")
  .argument("<tenant>", "Tenant name, ID, or URL fragment")
  .description("Disable a tenant from deployments")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-r, --reason <text>", "Reason for disabling")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = createSpinner("Disabling tenant...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

        const tenant = findTenant(DEMO_TENANTS, tenantQuery);

        if (!tenant) {
          console.log(chalk.red(`Tenant '${tenantQuery}' not found`));
          process.exit(1);
        }

        if (!tenant.enabled) {
          console.log(chalk.yellow(`${tenant.name} is already disabled`));
          return;
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                tenant: tenant.name,
                tenantId: tenant.tenantId,
                enabled: false,
                reason: options.reason || null,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.green(`✔ ${tenant.name} disabled`));
        if (options.reason) {
          console.log(chalk.gray(`  Reason: ${options.reason}`));
        }
        console.log();
        console.log(chalk.gray("This tenant will be excluded from future deployments."));
        console.log(chalk.gray(`Use 'agentsync tenants enable ${tenantQuery}' to re-enable.`));
        return;
      }

      // Production mode - would update config file
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to test this command."));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to disable tenant");
    }
  });

// ============================================================================
// tenants tag
// ============================================================================

export const tagCommand = new Command("tag")
  .argument("<tenant>", "Tenant name, ID, or URL fragment")
  .description("Manage tenant tags")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--add <tags...>", "Add tags")
  .option("--remove <tags...>", "Remove tags")
  .option("--set <tags>", "Replace all tags (comma-separated)")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = createSpinner("Updating tags...").start();

    try {
      if (isDemo()) {
        spinner.stop();
        console.error(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

        const tenant = findTenant(DEMO_TENANTS, tenantQuery);

        if (!tenant) {
          console.log(chalk.red(`Tenant '${tenantQuery}' not found`));
          process.exit(1);
        }

        // Validate that at least one operation is specified
        if (!options.add && !options.remove && !options.set) {
          console.log(chalk.yellow("No tag operation specified."));
          console.log();
          console.log("Usage:");
          console.log(chalk.gray("  --add <tags...>     Add tags"));
          console.log(chalk.gray("  --remove <tags...>  Remove tags"));
          console.log(chalk.gray("  --set <tags>        Replace all tags (comma-separated)"));
          console.log();
          console.log(`Current tags for ${tenant.name}: ${tenant.tags?.join(", ") || "(none)"}`);
          return;
        }

        const beforeTags = [...(tenant.tags || [])];
        let afterTags = [...beforeTags];

        // Handle --set (replaces all)
        if (options.set) {
          afterTags = options.set
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
        } else {
          // Handle --add
          if (options.add) {
            for (const tag of options.add) {
              if (!afterTags.includes(tag)) {
                afterTags.push(tag);
              }
            }
          }

          // Handle --remove
          if (options.remove) {
            afterTags = afterTags.filter((t) => !options.remove.includes(t));
          }
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                success: true,
                tenant: tenant.name,
                tenantId: tenant.tenantId,
                before: beforeTags,
                after: afterTags,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.green(`✔ Updated tags for ${tenant.name}`));
        console.log(`  Before: ${beforeTags.join(", ") || "(none)"}`);
        console.log(`  After:  ${afterTags.join(", ") || "(none)"}`);
        return;
      }

      // Production mode - would update config file
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to test this command."));
    } catch (error) {
      handleCommandError(error, spinner, "Failed to update tags");
    }
  });
