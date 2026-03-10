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
import ora from "ora";
import Table from "cli-table3";
import { isDemoMode as isDemoModeCore, DEMO_SOLUTIONS } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";
import { formatTimeAgo } from "../../lib/formatters.js";
import { findSolution, getTenantDeploymentStatus } from "./helpers.js";

export const showCommand = new Command("show")
  .argument("<name>", "Agent name or unique name")
  .description("View agent details and tenant inventory")
  .option("--tenants", "Show tenant deployment status")
  .option("--json", "Output as JSON")
  .action(async (name: string, options) => {
    const spinner = ora("Loading agent...").start();

    try {
      if (isDemoModeEnabled() || isDemoModeCore()) {
        spinner.stop();
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));

        const solution = findSolution(DEMO_SOLUTIONS, name);

        if (!solution) {
          console.log(chalk.red(`Agent '${name}' not found`));
          console.log();
          console.log(chalk.gray("Available agents:"));
          DEMO_SOLUTIONS.forEach((s) => {
            console.log(chalk.gray(`  - ${s.uniqueName} (${s.friendlyName})`));
          });
          process.exit(1);
        }

        // JSON output
        if (options.json) {
          const output: Record<string, unknown> = { ...solution };

          if (options.tenants) {
            output.tenantStatus = getTenantDeploymentStatus(solution.uniqueName);
          }

          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Standard output - agent details
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

        // Tenant deployment status
        if (options.tenants) {
          console.log();
          console.log(chalk.bold(`${solution.uniqueName} - Tenant Deployment Status`));
          console.log("━".repeat(60));

          const tenantStatus = getTenantDeploymentStatus(solution.uniqueName);

          const table = new Table({
            head: ["Tenant", "Version", "Status", "Last Deployed"],
            style: { head: ["cyan"] },
          });

          tenantStatus.forEach((t) => {
            let statusIcon: string;
            switch (t.status) {
              case "current":
                statusIcon = chalk.green("✓ current");
                break;
              case "outdated":
                statusIcon = chalk.yellow("↑ outdated");
                break;
              case "not_deployed":
                statusIcon = chalk.gray("✗ not deployed");
                break;
            }

            table.push([
              t.tenantName,
              t.version || "-",
              statusIcon,
              t.deployedAt ? formatTimeAgo(t.deployedAt) : "-",
            ]);
          });

          console.log(table.toString());
          console.log();

          const deployed = tenantStatus.filter((t) => t.status !== "not_deployed").length;
          const current = tenantStatus.filter((t) => t.status === "current").length;
          const outdated = tenantStatus.filter((t) => t.status === "outdated").length;

          console.log(
            chalk.gray(
              `${deployed}/${tenantStatus.length} tenants have this agent (${current} current, ${outdated} outdated)`
            )
          );
        }

        return;
      }

      // Production mode
      spinner.fail(chalk.yellow("Production mode not yet implemented"));
      console.log(chalk.gray("\nEnable demo mode with 'agentsync demo on' to see sample data."));
    } catch (error) {
      spinner.fail(chalk.red("Failed to load agent"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
