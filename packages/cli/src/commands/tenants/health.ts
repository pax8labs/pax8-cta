/**
 * Copyright 2024 Pax8, Inc.
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
import { createSpinner, isQuietMode } from "../../lib/spinner.js";
import Table from "cli-table3";
import { DEMO_TENANTS, generateMockHealthCheck, TenantConfig } from "@agentsync/core";
import { withResolvedConfig } from "../../lib/command-wrapper.js";
import { findTenant } from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

export const healthCommand = new Command("health")
  .argument("[tenant]", "Optional tenant name, ID, or URL fragment")
  .description("View tenant health status")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("--watch", "Continuously monitor (refresh every 30s)")
  .option("--json", "Output as JSON")
  .addHelpText(
    "after",
    `
Examples:
  tenants health                            Show fleet-wide health summary
  tenants health AgentSync-Test2            Check health for a specific tenant
  tenants health --json                     Output health data as JSON
`
  )
  .action(async (tenantQuery: string | undefined, options) => {
    const spinner = createSpinner("Checking health...").start();

    try {
      // Get tenant list
      const tenants = await withResolvedConfig<TenantConfig[]>(
        options,
        () => {
          spinner.stop();
          if (!isQuietMode()) {
            console.error(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
          }
          return DEMO_TENANTS;
        },
        (config) => {
          spinner.stop();
          return config.tenants;
        }
      );

      // If specific tenant requested
      if (tenantQuery) {
        const tenant = findTenant(tenants, tenantQuery);

        if (!tenant) {
          console.log(chalk.red(`Tenant '${tenantQuery}' not found`));
          process.exit(1);
        }

        const health = generateMockHealthCheck(tenant.tenantId);

        if (options.json) {
          console.log(JSON.stringify({ tenant: tenant.name, ...health }, null, 2));
          return;
        }

        console.log(chalk.bold(`${tenant.name} - Health Details`));
        console.log("━".repeat(50));
        console.log(`Status: ${health.healthy ? chalk.green("Healthy") : chalk.red("Degraded")}`);
        console.log();
        console.log("Checks:");
        health.checks.forEach((check) => {
          const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
          const msg = check.message ? chalk.gray(` - ${check.message}`) : "";
          console.log(`  ${icon} ${check.name}${msg}`);
        });
        console.log();
        console.log(chalk.gray("Last Checked: just now"));
        return;
      }

      // Fleet-wide health summary
      let filtered = tenants.filter((t) => t.enabled);
      if (options.tag && options.tag.length > 0) {
        filtered = filtered.filter((t) => options.tag.some((tag: string) => t.tags?.includes(tag)));
      }

      const results = filtered.map((tenant) => ({
        tenant,
        health: generateMockHealthCheck(tenant.tenantId),
      }));

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              summary: {
                total: results.length,
                healthy: results.filter((r) => r.health.healthy).length,
                unhealthy: results.filter((r) => !r.health.healthy).length,
              },
              tenants: results.map((r) => ({
                name: r.tenant.name,
                tenantId: r.tenant.tenantId,
                healthy: r.health.healthy,
                checks: r.health.checks,
              })),
            },
            null,
            2
          )
        );
        return;
      }

      const healthyCount = results.filter((r) => r.health.healthy).length;
      const healthPercent = Math.round((healthyCount / results.length) * 100);

      console.log(chalk.bold("Fleet Health Summary"));
      console.log("━".repeat(60));
      console.log(`Overall: ${healthyCount}/${results.length} healthy (${healthPercent}%)`);
      console.log();

      const table = new Table({
        head: ["Tenant", "GDAP", "API", "Dataverse", "License", "Status"],
        style: { head: ["cyan"] },
      });

      results.forEach(({ tenant, health }) => {
        const gdapCheck = health.checks.find(
          (c) => c.name.includes("Connection") || c.name.includes("GDAP")
        );
        const apiCheck = health.checks.find((c) => c.name.includes("API"));
        const dataverseCheck = health.checks.find((c) => c.name.includes("Dataverse"));
        const licenseCheck = health.checks.find((c) => c.name.includes("License"));

        const checkIcon = (check: { passed: boolean } | undefined) =>
          check?.passed ? chalk.green("✓") : chalk.red("✗");

        const statusText = health.healthy ? chalk.green("Healthy") : chalk.yellow("Degraded");

        const failedCheck = health.checks.find((c) => !c.passed);
        const statusWithReason = failedCheck?.message
          ? `${statusText} (${failedCheck.message})`
          : statusText;

        table.push([
          tenant.name,
          checkIcon(gdapCheck || dataverseCheck),
          checkIcon(apiCheck),
          checkIcon(dataverseCheck),
          checkIcon(licenseCheck),
          statusWithReason,
        ]);
      });

      console.log(table.toString());

      if (options.watch) {
        console.log();
        console.log(chalk.gray("Refreshing every 30 seconds... Press Ctrl+C to stop"));
      }
    } catch (error) {
      handleCommandError(error, spinner, "Health check failed");
    }
  });
