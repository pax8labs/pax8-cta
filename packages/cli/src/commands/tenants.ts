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
import ora from "ora";
import Table from "cli-table3";
import {
  loadConfig,
  getClientSecret,
  GdapClient,
  isDemoMode as isDemoModeCore,
  DEMO_TENANTS,
  DEMO_SOLUTIONS,
  generateMockDeploymentHistory,
  generateMockHealthCheck,
  TenantConfig,
} from "@agentsync/core";
import { isDemoModeEnabled } from "./demo.js";
import { formatTimeAgo } from "../lib/formatters.js";

// ============================================================================
// Helpers
// ============================================================================

function findTenant(tenants: TenantConfig[], query: string): TenantConfig | undefined {
  const q = query.toLowerCase();
  return tenants.find(t =>
    t.name.toLowerCase().includes(q) ||
    t.tenantId.toLowerCase().includes(q) ||
    t.environmentUrl.toLowerCase().includes(q)
  );
}

/**
 * Get deployed agents for a tenant from deployment history
 */
function getDeployedAgentsForTenant(tenantId: string): Array<{
  name: string;
  version: string;
  deployedAt: string;
}> {
  const history = generateMockDeploymentHistory(50);

  // Find all completed deployments for this tenant
  const deployedAgents = new Map<string, { name: string; version: string; deployedAt: string }>();

  history
    .filter(d => d.status === "completed")
    .forEach(deployment => {
      const tenantResult = deployment.tenantResults?.find(
        t => t.tenantId === tenantId && t.status === "completed"
      );

      if (tenantResult) {
        // Keep the most recent deployment for each agent
        const existing = deployedAgents.get(deployment.solutionName);
        if (!existing || new Date(deployment.createdAt) > new Date(existing.deployedAt)) {
          deployedAgents.set(deployment.solutionName, {
            name: deployment.solutionName,
            version: deployment.solutionVersion || "unknown",
            deployedAt: deployment.createdAt,
          });
        }
      }
    });

  return Array.from(deployedAgents.values());
}

// ============================================================================
// Command definition
// ============================================================================

export const tenantsCommand = new Command("tenants")
  .alias("fleet")
  .description("Manage your tenants");

// ============================================================================
// tenants list
// ============================================================================

tenantsCommand
  .command("list")
  .alias("ls")
  .description("List all destinations in your fleet")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("-s, --search <query>", "Search by name, ID, or environment URL")
  .option("--status <status>", "Filter by status (enabled|disabled|all)", "all")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading fleet manifest...").start();

    try {
      // Check for demo mode (CLI config or environment variable)
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.succeed(`Loaded ${DEMO_TENANTS.length} destinations from demo fleet`);
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        let destinations = [...DEMO_TENANTS];

        // Apply search filter
        if (options.search) {
          const q = options.search.toLowerCase();
          destinations = destinations.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.tenantId.toLowerCase().includes(q) ||
            t.environmentUrl.toLowerCase().includes(q)
          );
        }

        // Apply tag filter
        if (options.tag && options.tag.length > 0) {
          destinations = destinations.filter((t) =>
            options.tag.every((tag: string) => t.tags?.includes(tag))
          );
        }

        // Apply status filter
        if (options.status === "enabled") {
          destinations = destinations.filter(t => t.enabled);
        } else if (options.status === "disabled") {
          destinations = destinations.filter(t => !t.enabled);
        }

        // JSON output
        if (options.json) {
          console.log(JSON.stringify({
            tenants: destinations,
            total: destinations.length,
            active: destinations.filter(t => t.enabled).length,
          }, null, 2));
          return;
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

        // Show filter info if applicable
        const filterInfo: string[] = [];
        if (options.search) filterInfo.push(`matching "${options.search}"`);
        if (options.tag?.length) filterInfo.push(`with tags: ${options.tag.join(" AND ")}`);
        if (options.status !== "all") filterInfo.push(`status: ${options.status}`);

        if (filterInfo.length > 0) {
          console.log(chalk.gray(`${destinations.length} tenants ${filterInfo.join(", ")}`));
        } else {
          console.log(
            chalk.gray(`Fleet size: ${destinations.length} destinations (${DEMO_TENANTS.filter(t => t.enabled).length} active)`)
          );
        }
        return;
      }

      // Real mode - load config
      const configPath = resolve(options.config);
      const config = await loadConfig(configPath);
      spinner.succeed(`Loaded ${config.tenants.length} destinations from manifest`);

      let destinations = [...config.tenants];

      // Apply search filter
      if (options.search) {
        const q = options.search.toLowerCase();
        destinations = destinations.filter(t =>
          t.name.toLowerCase().includes(q) ||
          t.tenantId.toLowerCase().includes(q) ||
          t.environmentUrl.toLowerCase().includes(q)
        );
      }

      // Apply tag filter
      if (options.tag && options.tag.length > 0) {
        destinations = destinations.filter((t) =>
          options.tag.every((tag: string) => t.tags?.includes(tag))
        );
      }

      // Apply status filter
      if (options.status === "enabled") {
        destinations = destinations.filter(t => t.enabled);
      } else if (options.status === "disabled") {
        destinations = destinations.filter(t => !t.enabled);
      }

      // JSON output
      if (options.json) {
        console.log(JSON.stringify({
          tenants: destinations,
          total: destinations.length,
          active: destinations.filter(t => t.enabled).length,
        }, null, 2));
        return;
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

// ============================================================================
// tenants inspect
// ============================================================================

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

// ============================================================================
// tenants show <id-or-name>
// ============================================================================

tenantsCommand
  .command("show <tenant>")
  .description("View tenant details and deployed agents")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--agents", "Show deployed agents")
  .option("--health", "Include health check")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = ora("Loading tenant...").start();

    try {
      // Get tenant list
      let tenants: TenantConfig[];
      if (isDemoModeEnabled() || isDemoModeCore()) {
        tenants = DEMO_TENANTS;
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
      } else {
        const configPath = resolve(options.config);
        const config = await loadConfig(configPath);
        tenants = config.tenants;
        spinner.stop();
      }

      // Find tenant by name, ID, or URL
      const tenant = findTenant(tenants, tenantQuery);

      if (!tenant) {
        console.log(chalk.red(`Tenant '${tenantQuery}' not found`));
        console.log();
        console.log(chalk.gray("Available tenants:"));
        tenants.slice(0, 5).forEach(t => {
          console.log(chalk.gray(`  - ${t.name} (${t.tenantId.slice(0, 8)}...)`));
        });
        if (tenants.length > 5) {
          console.log(chalk.gray(`  ... and ${tenants.length - 5} more`));
        }
        process.exit(1);
      }

      // JSON output
      if (options.json) {
        const output: Record<string, unknown> = { ...tenant };

        if (options.agents) {
          output.deployedAgents = getDeployedAgentsForTenant(tenant.tenantId);
        }

        if (options.health) {
          output.health = generateMockHealthCheck(tenant.tenantId);
        }

        console.log(JSON.stringify(output, null, 2));
        return;
      }

      // Standard output - tenant details
      console.log(chalk.bold(tenant.name));
      console.log("━".repeat(50));
      console.log(`Tenant ID:       ${tenant.tenantId}`);
      console.log(`Environment:     ${tenant.environmentUrl}`);
      console.log(`Status:          ${tenant.enabled ? chalk.green("✓ Active") : chalk.red("✗ Disabled")}`);
      console.log(`Tags:            ${tenant.tags?.join(", ") || "-"}`);

      // Metadata
      if (tenant.metadata && Object.keys(tenant.metadata).length > 0) {
        console.log();
        console.log(chalk.bold("Metadata:"));
        for (const [key, value] of Object.entries(tenant.metadata)) {
          const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
          console.log(`  ${formattedKey}: ${value}`);
        }
      }

      // Deployed agents
      if (options.agents) {
        console.log();
        console.log(chalk.bold(`${tenant.name} - Deployed Agents`));
        console.log("━".repeat(50));

        const deployedAgents = getDeployedAgentsForTenant(tenant.tenantId);

        if (deployedAgents.length === 0) {
          console.log(chalk.gray("No agents deployed to this tenant."));
        } else {
          const table = new Table({
            head: ["Agent", "Version", "Deployed", "Status"],
            style: { head: ["cyan"] },
          });

          deployedAgents.forEach(agent => {
            const latestVersion = DEMO_SOLUTIONS.find(s => s.uniqueName === agent.name)?.version;
            const isCurrent = agent.version === latestVersion;
            const status = isCurrent
              ? chalk.green("✓ current")
              : chalk.yellow("↑ outdated");

            table.push([
              agent.name,
              agent.version,
              formatTimeAgo(agent.deployedAt),
              status,
            ]);
          });

          console.log(table.toString());
          console.log();
          console.log(chalk.gray(`${deployedAgents.length} agents deployed`));
        }
      }

      // Health check
      if (options.health) {
        console.log();
        console.log(chalk.bold(`${tenant.name} - Health Status`));
        console.log("━".repeat(50));

        const health = generateMockHealthCheck(tenant.tenantId);
        console.log(`Overall: ${health.healthy ? chalk.green("✓ Healthy") : chalk.red("✗ Unhealthy")}`);
        console.log();
        console.log("Checks:");
        health.checks.forEach(check => {
          const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
          const msg = check.message ? chalk.gray(` (${check.message})`) : "";
          console.log(`  ${icon} ${check.name}${msg}`);
        });
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load tenant"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// tenants health
// ============================================================================

tenantsCommand
  .command("health [tenant]")
  .description("View tenant health status")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-t, --tag <tags...>", "Filter by tags")
  .option("--watch", "Continuously monitor (refresh every 30s)")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string | undefined, options) => {
    const spinner = ora("Checking health...").start();

    try {
      // Get tenant list
      let tenants: TenantConfig[];
      if (isDemoModeEnabled() || isDemoModeCore()) {
        tenants = DEMO_TENANTS;
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
      } else {
        const configPath = resolve(options.config);
        const config = await loadConfig(configPath);
        tenants = config.tenants;
        spinner.stop();
      }

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
        health.checks.forEach(check => {
          const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
          const msg = check.message ? chalk.gray(` - ${check.message}`) : "";
          console.log(`  ${icon} ${check.name}${msg}`);
        });
        console.log();
        console.log(chalk.gray("Last Checked: just now"));
        return;
      }

      // Fleet-wide health summary
      let filtered = tenants.filter(t => t.enabled);
      if (options.tag && options.tag.length > 0) {
        filtered = filtered.filter(t =>
          options.tag.some((tag: string) => t.tags?.includes(tag))
        );
      }

      const results = filtered.map(tenant => ({
        tenant,
        health: generateMockHealthCheck(tenant.tenantId),
      }));

      if (options.json) {
        console.log(JSON.stringify({
          summary: {
            total: results.length,
            healthy: results.filter(r => r.health.healthy).length,
            unhealthy: results.filter(r => !r.health.healthy).length,
          },
          tenants: results.map(r => ({
            name: r.tenant.name,
            tenantId: r.tenant.tenantId,
            healthy: r.health.healthy,
            checks: r.health.checks,
          })),
        }, null, 2));
        return;
      }

      const healthyCount = results.filter(r => r.health.healthy).length;
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
        const gdapCheck = health.checks.find(c => c.name.includes("Connection") || c.name.includes("GDAP"));
        const apiCheck = health.checks.find(c => c.name.includes("API"));
        const dataverseCheck = health.checks.find(c => c.name.includes("Dataverse"));
        const licenseCheck = health.checks.find(c => c.name.includes("License"));

        const checkIcon = (check: { passed: boolean } | undefined) =>
          check?.passed ? chalk.green("✓") : chalk.red("✗");

        const statusText = health.healthy
          ? chalk.green("Healthy")
          : chalk.yellow("Degraded");

        const failedCheck = health.checks.find(c => !c.passed);
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
      spinner.fail(chalk.red("Health check failed"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// tenants enable
// ============================================================================

tenantsCommand
  .command("enable <tenant>")
  .description("Enable a tenant for deployments")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = ora("Enabling tenant...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

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
          console.log(JSON.stringify({
            success: true,
            tenant: tenant.name,
            tenantId: tenant.tenantId,
            enabled: true,
          }, null, 2));
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
      spinner.fail(chalk.red("Failed to enable tenant"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// tenants disable
// ============================================================================

tenantsCommand
  .command("disable <tenant>")
  .description("Disable a tenant from deployments")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("-r, --reason <text>", "Reason for disabling")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = ora("Disabling tenant...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

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
          console.log(JSON.stringify({
            success: true,
            tenant: tenant.name,
            tenantId: tenant.tenantId,
            enabled: false,
            reason: options.reason || null,
          }, null, 2));
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
      spinner.fail(chalk.red("Failed to disable tenant"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// tenants tag
// ============================================================================

tenantsCommand
  .command("tag <tenant>")
  .description("Manage tenant tags")
  .option("-c, --config <path>", "Path to manifest file", "./config/tenants.yaml")
  .option("--add <tags...>", "Add tags")
  .option("--remove <tags...>", "Remove tags")
  .option("--set <tags>", "Replace all tags (comma-separated)")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = ora("Updating tags...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Changes are not persisted\n"));

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
          afterTags = options.set.split(",").map((t: string) => t.trim()).filter(Boolean);
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
            afterTags = afterTags.filter(t => !options.remove.includes(t));
          }
        }

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            tenant: tenant.name,
            tenantId: tenant.tenantId,
            before: beforeTags,
            after: afterTags,
          }, null, 2));
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
      spinner.fail(chalk.red("Failed to update tags"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });
