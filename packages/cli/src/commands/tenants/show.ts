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
import Table from "cli-table3";
import {
  loadConfig,
  DEMO_TENANTS,
  DEMO_SOLUTIONS,
  generateMockHealthCheck,
  TenantConfig,
} from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { findTenant, getDeployedAgentsForTenant } from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

export const showCommand = new Command("show")
  .argument("<tenant>", "Tenant name, ID, or URL fragment")
  .description("View tenant details and deployed agents")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--agents", "Show deployed agents")
  .option("--health", "Include health check")
  .option("--json", "Output as JSON")
  .action(async (tenantQuery: string, options) => {
    const spinner = createSpinner("Loading tenant...").start();

    try {
      // Get tenant list
      let tenants: TenantConfig[];
      if (isDemo()) {
        tenants = DEMO_TENANTS;
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
      } else {
        const configPath = resolve(process.cwd(), options.config);
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
        tenants.slice(0, 5).forEach((t) => {
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
      console.log(
        `Status:          ${tenant.enabled ? chalk.green("✓ Active") : chalk.red("✗ Disabled")}`
      );
      console.log(`Tags:            ${tenant.tags?.join(", ") || "-"}`);

      // Metadata
      if (tenant.metadata && Object.keys(tenant.metadata).length > 0) {
        console.log();
        console.log(chalk.bold("Metadata:"));
        for (const [key, value] of Object.entries(tenant.metadata)) {
          const formattedKey =
            key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
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

          deployedAgents.forEach((agent) => {
            const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agent.name)?.version;
            const isCurrent = agent.version === latestVersion;
            const status = isCurrent ? chalk.green("✓ current") : chalk.yellow("↑ outdated");

            table.push([agent.name, agent.version, formatTimeAgo(agent.deployedAt), status]);
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
        console.log(
          `Overall: ${health.healthy ? chalk.green("✓ Healthy") : chalk.red("✗ Unhealthy")}`
        );
        console.log();
        console.log("Checks:");
        health.checks.forEach((check) => {
          const icon = check.passed ? chalk.green("✓") : chalk.red("✗");
          const msg = check.message ? chalk.gray(` (${check.message})`) : "";
          console.log(`  ${icon} ${check.name}${msg}`);
        });
      }
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load tenant");
    }
  });
