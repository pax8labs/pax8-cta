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
import { DEMO_TENANTS, generateMockHealthCheck, TenantConfig } from "@pax8-cta/core";
import { withResolvedConfig } from "../../lib/command-wrapper.js";
import { findTenant } from "./helpers.js";
import { CliError, handleCommandError } from "../../lib/errors.js";
import { output, resolveFormat, type Column } from "../../lib/output.js";
import { showDemoBanner } from "../../lib/demo-banner.js";

// Row type for the fleet-wide health table
interface HealthRow {
  tenant: string;
  gdap: string;
  api: string;
  dataverse: string;
  license: string;
  status: string;
  // Raw values — used for JSON serialization and column formatters
  gdapPassed: boolean;
  apiPassed: boolean;
  dataversePassed: boolean;
  licensePassed: boolean;
  healthy: boolean;
  reason?: string;
}

const checkIcon = (passed: boolean) => (passed ? chalk.green("✓") : chalk.red("✗"));

const HEALTH_COLUMNS: Column<HealthRow>[] = [
  { key: "tenant", header: "Tenant" },
  { key: "gdap", header: "GDAP", format: (_v, row) => checkIcon(row.gdapPassed) },
  { key: "api", header: "API", format: (_v, row) => checkIcon(row.apiPassed) },
  { key: "dataverse", header: "Dataverse", format: (_v, row) => checkIcon(row.dataversePassed) },
  { key: "license", header: "License", format: (_v, row) => checkIcon(row.licensePassed) },
  {
    key: "status",
    header: "Status",
    format: (_v, row) => {
      const text = row.healthy ? chalk.green("Healthy") : chalk.yellow("Degraded");
      return row.reason ? `${text} (${row.reason})` : text;
    },
  },
];

export const healthCommand = new Command("health")
  .argument("[tenant]", "Optional tenant name, ID, or URL fragment")
  .description("View tenant health status")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("--watch", "Continuously monitor (refresh every 30s)")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  tenants health                            Show fleet-wide health summary
  tenants health Pax8CTA-Test2            Check health for a specific tenant
  tenants health --json                     Output health data as JSON
`
  )
  .action(async (tenantQuery: string | undefined, options, cmd) => {
    // Merge local options with global flags (--json, --quiet, --ids-only) from root program
    const opts = { ...options, ...cmd.optsWithGlobals() };
    const spinner = createSpinner("Checking health...").start();

    try {
      // Get tenant list
      const tenants = await withResolvedConfig<TenantConfig[]>(
        opts,
        () => {
          spinner.stop();
          if (!isQuietMode()) {
            showDemoBanner();
          }
          return DEMO_TENANTS;
        },
        (config) => {
          spinner.stop();
          return config.tenants;
        }
      );

      const fmt = resolveFormat(opts);

      // ──────────────────────────────────────────────────────────────────────
      // Per-tenant health (tenant arg supplied)
      // ──────────────────────────────────────────────────────────────────────
      if (tenantQuery) {
        const tenant = findTenant(tenants, tenantQuery);

        if (!tenant) {
          // Route through handleCommandError so --json/non-TTY callers get the
          // structured error envelope instead of bare colored stdout.
          throw new CliError(
            `Tenant '${tenantQuery}' not found. ` +
              `Run 'tenants list' to see all configured tenants.`
          );
        }

        const health = generateMockHealthCheck(tenant.tenantId);

        if (fmt === "json") {
          console.log(JSON.stringify({ tenant: tenant.name, ...health }, null, 2));
          return;
        }

        if (fmt === "quiet") return;

        // table (default for TTY)
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

      // ──────────────────────────────────────────────────────────────────────
      // Fleet-wide health summary
      // ──────────────────────────────────────────────────────────────────────
      let filtered = tenants.filter((t) => t.enabled);
      if (opts.tag && opts.tag.length > 0) {
        filtered = filtered.filter((t) => opts.tag.some((tag: string) => t.tags?.includes(tag)));
      }

      const results = filtered.map((tenant) => ({
        tenant,
        health: generateMockHealthCheck(tenant.tenantId),
      }));

      if (fmt === "json") {
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

      if (fmt === "quiet") return;

      // Build typed rows and render via output() for table format.
      const rows: HealthRow[] = results.map(({ tenant, health }) => {
        const gdapCheck = health.checks.find(
          (c) => c.name.includes("Connection") || c.name.includes("GDAP")
        );
        const apiCheck = health.checks.find((c) => c.name.includes("API"));
        const dataverseCheck = health.checks.find((c) => c.name.includes("Dataverse"));
        const licenseCheck = health.checks.find((c) => c.name.includes("License"));
        const failedCheck = health.checks.find((c) => !c.passed);

        return {
          tenant: tenant.name,
          gdap: "",
          api: "",
          dataverse: "",
          license: "",
          status: "",
          gdapPassed: !!(gdapCheck?.passed ?? dataverseCheck?.passed),
          apiPassed: !!apiCheck?.passed,
          dataversePassed: !!dataverseCheck?.passed,
          licensePassed: !!licenseCheck?.passed,
          healthy: health.healthy,
          reason: failedCheck?.message,
        };
      });

      const healthyCount = results.filter((r) => r.health.healthy).length;
      const healthPercent = results.length ? Math.round((healthyCount / results.length) * 100) : 0;

      console.log(chalk.bold("Fleet Health Summary"));
      console.log("━".repeat(60));
      console.log(`Overall: ${healthyCount}/${results.length} healthy (${healthPercent}%)`);
      console.log();

      output(rows, { format: "table", columns: HEALTH_COLUMNS });

      if (opts.watch) {
        console.log();
        console.log(chalk.gray("Refreshing every 30 seconds... Press Ctrl+C to stop"));
      }
    } catch (error) {
      handleCommandError(error, spinner, "Health check failed");
    }
  });
