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
import {
  DEMO_TENANTS,
  DEMO_SOLUTIONS,
  generateMockHealthCheck,
  TenantConfig,
} from "@pax8-cta/core";
import { withResolvedConfig } from "../../lib/command-wrapper.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { findTenant, getDeployedAgentsForTenant } from "./helpers.js";
import { CliError, handleCommandError } from "../../lib/errors.js";
import { output, getDefaultFormat, type Column, type OutputFormat } from "../../lib/output.js";
import { isInteractivePrompt, pickFromList, printRunningCommand } from "../../lib/picker.js";
import { showDemoBanner } from "../../lib/demo-banner.js";

interface AgentRow {
  name: string;
  version: string;
  deployedAt: string;
  status: string;
}

const AGENT_COLUMNS: Column<AgentRow>[] = [
  { key: "name", header: "Agent" },
  { key: "version", header: "Version" },
  { key: "deployedAt", header: "Deployed" },
  {
    key: "status",
    header: "Status",
    format: (v) => (v === "current" ? chalk.green("✓ current") : chalk.yellow("↑ outdated")),
  },
];

function resolveFormat(options: { json?: boolean; quiet?: boolean }): OutputFormat {
  if (options.json) return "json";
  if (options.quiet) return "quiet";
  return getDefaultFormat();
}

export const showCommand = new Command("show")
  .argument("[tenant]", "Tenant name, ID, or URL fragment")
  .description("View tenant details and deployed agents")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--agents", "Show deployed agents")
  .option("--health", "Include health check")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .action(async (tenantQuery: string | undefined, options) => {
    const spinner = createSpinner("Loading tenant...").start();

    try {
      // Get tenant list
      const tenants = await withResolvedConfig<TenantConfig[]>(
        options,
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

      // No tenant arg in an interactive terminal? Offer a picker drawn from
      // the resolved tenant list. Scripts (--json, --quiet, non-TTY) fall
      // through to the existing "Tenant not found" path so they fail fast
      // rather than hang.
      if (!tenantQuery && isInteractivePrompt({ json: options.json, quiet: options.quiet })) {
        const picked = await pickFromList(tenants, {
          prompt: "Pick a tenant:",
          label: (t) => t.name,
          hint: (t) => (t.tags?.length ? t.tags.join(", ") : undefined),
        });
        if (picked) {
          tenantQuery = picked.name;
          printRunningCommand(["tenants", "show", picked.name]);
        }
      }

      if (!tenantQuery) {
        console.error(chalk.red("Error: tenant name required."));
        console.error(chalk.gray("  Example: tenants show Contoso"));
        process.exit(2);
      }

      // Find tenant by name, ID, or URL
      const tenant = findTenant(tenants, tenantQuery);

      if (!tenant) {
        // Issue #360: route the "not found" path through handleCommandError
        // (via CliError) so --json callers get the structured envelope
        // (`{ error: { code, message, causes, recovery } }`) instead of
        // ANSI-coloured stdout text. The "available tenants" hint moves into
        // the error message itself so it survives the JSON envelope.
        const availableHint = tenants
          .slice(0, 5)
          .map((t) => `${t.name} (${t.tenantId.slice(0, 8)}...)`);
        if (tenants.length > 5) {
          availableHint.push(`... and ${tenants.length - 5} more`);
        }

        const message =
          `Tenant '${tenantQuery}' not found.` +
          (availableHint.length > 0 ? ` Available tenants: ${availableHint.join(", ")}.` : "") +
          ` Run 'tenants list' to see all configured tenants.`;
        throw new CliError(message);
      }

      const fmt = resolveFormat(options);

      // JSON output
      if (fmt === "json") {
        const jsonOutput: Record<string, unknown> = { ...tenant };

        if (options.agents) {
          jsonOutput.deployedAgents = getDeployedAgentsForTenant(tenant.tenantId);
        }

        if (options.health) {
          jsonOutput.health = generateMockHealthCheck(tenant.tenantId);
        }

        console.log(JSON.stringify(jsonOutput, null, 2));
        return;
      }

      // Quiet mode — no output
      if (fmt === "quiet") return;

      // Standard output - tenant details
      console.log(chalk.bold(tenant.name));
      console.log("━".repeat(50));
      console.log(`Tenant ID:       ${tenant.tenantId}`);
      console.log(`Environment:     ${tenant.environmentUrl}`);
      console.log(
        `Status:          ${tenant.enabled ? chalk.green("✓ Active") : chalk.red("✗ Disabled")}`
      );
      console.log(`Tags:            ${tenant.tags?.join(", ") || "-"}`);

      // Metadata — only print primitive values in the table view.
      // Nested arrays/objects (e.g. demo-mode `deployedSolutions`,
      // `deploymentHistory`) are surfaced through dedicated views like
      // `--agents`, so showing `[object Object]` here would just be noise.
      if (tenant.metadata && Object.keys(tenant.metadata).length > 0) {
        const primitiveEntries = Object.entries(tenant.metadata).filter(
          ([, value]) =>
            value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
        );

        if (primitiveEntries.length > 0) {
          console.log();
          console.log(chalk.bold("Metadata:"));
          for (const [key, value] of primitiveEntries) {
            const formattedKey =
              key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
            console.log(`  ${formattedKey}: ${value}`);
          }
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
          const rows: AgentRow[] = deployedAgents.map((agent) => {
            const latestVersion = DEMO_SOLUTIONS.find((s) => s.uniqueName === agent.name)?.version;
            const isCurrent = agent.version === latestVersion;
            return {
              name: agent.name,
              version: agent.version,
              deployedAt: formatTimeAgo(agent.deployedAt),
              status: isCurrent ? "current" : "outdated",
            };
          });

          output(rows, { format: "table", columns: AGENT_COLUMNS });
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
