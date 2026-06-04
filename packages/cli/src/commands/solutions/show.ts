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
import { createSpinner } from "../../lib/spinner.js";
import { DEMO_SOLUTIONS } from "@pax8-cta/core";
import { withDemoMode } from "../../lib/command-wrapper.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { findSolution, getTenantDeploymentStatus } from "./helpers.js";
import { CliError, handleCommandError } from "../../lib/errors.js";
import { showDemoBanner } from "../../lib/demo-banner.js";
import { output, resolveFormat, type Column } from "../../lib/output.js";

// ============================================================================
// Per-tenant deployment row (issue #406)
// ----------------------------------------------------------------------------
// Typed row schema for the `--tenants` table. Mirrors the Column<Row> pattern
// used by tenants list / tenants health / solutions drift so the JSON envelope
// is stable for agents and pipeline callers, and the human-readable table
// renders through the structured `output()` helper.
// ============================================================================

interface TenantDeploymentRow {
  tenantName: string;
  tenantId: string;
  version: string | null;
  status: "current" | "outdated" | "not_deployed";
  deployedAt: string | null;
}

const TENANT_COLUMNS: Column<TenantDeploymentRow>[] = [
  { key: "tenantName", header: "Tenant" },
  {
    key: "version",
    header: "Version",
    format: (v) => (v == null || v === "" ? "-" : String(v)),
  },
  {
    key: "status",
    header: "Status",
    format: (_v, row) => {
      switch (row.status) {
        case "current":
          return chalk.green("✓ current");
        case "outdated":
          return chalk.yellow("↑ outdated");
        case "not_deployed":
          return chalk.gray("✗ not deployed");
      }
    },
  },
  {
    key: "deployedAt",
    header: "Last Deployed",
    format: (v) => (typeof v === "string" && v.length > 0 ? formatTimeAgo(v) : "-"),
  },
];

export const showCommand = new Command("show")
  .argument("<name>", "Solution name or unique name")
  .description("View solution details and where it's deployed")
  .option("--tenants", "Show tenant deployment status")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output (exit code only)")
  .addHelpText(
    "after",
    `
Examples:
  solutions show TestDeploy                 View solution details
  solutions show TestDeploy --tenants       Show tenant deployment status
  solutions show TestDeploy --json          Output as JSON
`
  )
  .action(async (name: string, options, cmd) => {
    // Merge local opts with globals so root-level `--json` / `--quiet`
    // (`agentsync --json solutions show ...`) reach this command. Resolve the
    // effective output format up-front so every branch below can branch on a
    // single `fmt` value (issue #406).
    const opts = { ...options, ...cmd.optsWithGlobals() };
    const fmt = resolveFormat({ json: !!opts.json, quiet: !!opts.quiet });

    const spinner = createSpinner("Loading agent...").start();

    try {
      await withDemoMode(
        () => {
          spinner.stop();
          if (fmt === "table") {
            showDemoBanner();
          }

          const solution = findSolution(DEMO_SOLUTIONS, name);

          if (!solution) {
            // Route through handleCommandError so --json/non-TTY callers get the
            // structured error envelope instead of bare colored stdout.
            throw new CliError(
              `Agent '${name}' not found. ` + `Run 'solutions list' to see all available agents.`
            );
          }

          const tenantStatus = getTenantDeploymentStatus(solution.uniqueName);
          const rows: TenantDeploymentRow[] = tenantStatus.map((t) => ({
            tenantName: t.tenantName,
            tenantId: t.tenantId,
            version: t.version,
            status: t.status,
            deployedAt: t.deployedAt,
          }));

          const totalTenants = rows.length;
          const deployed = rows.filter((r) => r.status !== "not_deployed").length;
          const current = rows.filter((r) => r.status === "current").length;
          const outdated = rows.filter((r) => r.status === "outdated").length;
          const notDeployed = rows.filter((r) => r.status === "not_deployed").length;

          // ──────────────────────────────────────────────────────────────────
          // JSON envelope
          // ──────────────────────────────────────────────────────────────────
          if (fmt === "json") {
            const envelope: {
              name: string;
              displayName: string;
              latestVersion: string;
              summary: {
                totalTenants: number;
                deployed: number;
                current: number;
                outdated: number;
                notDeployed: number;
              };
              tenants?: TenantDeploymentRow[];
            } = {
              name: solution.uniqueName,
              displayName: solution.friendlyName,
              latestVersion: solution.version,
              summary: { totalTenants, deployed, current, outdated, notDeployed },
            };

            if (opts.tenants) {
              envelope.tenants = rows;
            }

            console.log(JSON.stringify(envelope, null, 2));
            return;
          }

          // ──────────────────────────────────────────────────────────────────
          // Quiet — produce no output
          // ──────────────────────────────────────────────────────────────────
          if (fmt === "quiet") return;

          // ──────────────────────────────────────────────────────────────────
          // Table (TTY default) — existing human-readable rendering
          // ──────────────────────────────────────────────────────────────────
          console.log(chalk.bold(`${solution.friendlyName} (${solution.uniqueName})`));
          console.log("━".repeat(60));
          console.log(`Version:     ${solution.version}`);
          console.log(`Category:    ${solution.category}`);
          console.log(`Publisher:   ${solution.publisherName}`);
          console.log(`Tags:        ${solution.tags.join(", ")}`);
          console.log();
          console.log(chalk.bold("Description:"));
          console.log(`  ${solution.description}`);
          console.log();
          console.log(chalk.bold("Capabilities:"));
          solution.capabilities.forEach((cap) => {
            console.log(`  • ${cap}`);
          });
          console.log();
          console.log(chalk.bold("Dependencies:"));
          solution.dependencies.forEach((dep) => {
            console.log(`  • ${dep}`);
          });
          console.log();
          console.log(`Last Published: ${formatTimeAgo(solution.lastPublished)}`);

          // Tenant deployment status (when --tenants is passed)
          if (opts.tenants) {
            console.log();
            console.log(chalk.bold(`${solution.uniqueName} - Tenant Deployment Status`));
            console.log("━".repeat(60));

            output(rows, { format: "table", columns: TENANT_COLUMNS });

            console.log();
            console.log(
              chalk.gray(
                `${deployed}/${totalTenants} tenants have this agent ` +
                  `(${current} current, ${outdated} outdated, ${notDeployed} not deployed)`
              )
            );
          }
        },
        () => {
          // Production mode
          spinner.fail(chalk.yellow("Production mode not yet implemented"));
          if (fmt === "table") {
            console.log(chalk.gray("\nEnable demo mode with 'demo on' to see sample data."));
          }
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load agent");
    }
  });
