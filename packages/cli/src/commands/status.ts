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
import { DeploymentQueueManager } from "@agentsync/worker";
import { isDemoModeEnabled } from "./demo.js";
import { DEMO_TENANTS } from "@agentsync/core";
import {
  formatStatus,
  formatTimeAgo,
  calculateDuration,
  truncate,
} from "../lib/formatters.js";

// Mock deployment data for demo mode
const DEMO_DEPLOYMENTS = [
  {
    id: "dep-demo-latest",
    solutionName: "CustomerSupportAgent",
    status: "in_progress",
    totalTenants: 5,
    completedTenants: 3,
    failedTenants: 1,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: "dep-demo-success",
    solutionName: "SalesAgent",
    status: "completed",
    totalTenants: 3,
    completedTenants: 3,
    failedTenants: 0,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "dep-demo-failed",
    solutionName: "HRAgent",
    status: "completed",
    totalTenants: 4,
    completedTenants: 2,
    failedTenants: 2,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

function getDemoDeploymentDetails(trackingId: string) {
  const deployment = DEMO_DEPLOYMENTS.find(d => d.id === trackingId);
  if (!deployment) return null;

  const tenantResults = DEMO_TENANTS.slice(0, deployment.totalTenants).map((tenant, i) => {
    let status = "completed";
    let error: string | undefined = undefined;
    let startedAt: string | undefined = new Date(Date.now() - 10 * 60 * 1000 + i * 2 * 60 * 1000).toISOString();
    let completedAt: string | undefined = new Date(Date.now() - 5 * 60 * 1000 + i * 2 * 60 * 1000).toISOString();

    if (deployment.status === "in_progress") {
      if (i === deployment.completedTenants) {
        status = "in_progress";
        completedAt = undefined;
      } else if (i > deployment.completedTenants) {
        status = "pending";
        startedAt = undefined;
        completedAt = undefined;
      }
    }

    if (i === deployment.totalTenants - 1 && deployment.failedTenants > 0) {
      status = "failed";
      error = "Missing privilege 'prvWriteContact' - GDAP role lacks Power Platform Admin";
    }

    return {
      tenantName: tenant.name,
      tenantId: tenant.tenantId,
      status,
      error,
      startedAt,
      completedAt,
    };
  });

  return {
    ...deployment,
    tenantResults,
  };
}

export const statusCommand = new Command("status")
  .alias("track")
  .description("Check the status of a deployment")
  .option("-d, --deployment <id>", "Deployment ID to track")
  .option("-s, --shipment <id>", "Shipment tracking number (alias for --deployment)")
  .option("-l, --list", "List all recent shipments")
  .option(
    "--redis <url>",
    "Redis URL for shipping dock",
    "redis://localhost:6379"
  )
  .option("-w, --watch", "Watch for status changes")
  .option("--interval <ms>", "Watch interval in milliseconds", "5000")
  .action(async (options) => {
    // Handle --list flag
    if (options.list) {
      if (isDemoModeEnabled()) {
        console.log(chalk.yellow("\n⚠️  DEMO MODE - Showing mock deployments\n"));
        console.log(chalk.bold("Recent Shipments:"));
        console.log();

        const table = new Table({
          head: ["Tracking #", "Agent", "Status", "Progress", "Created"],
          style: { head: ["cyan"] },
        });

        DEMO_DEPLOYMENTS.forEach(d => {
          const progress = `${d.completedTenants}/${d.totalTenants}`;
          const statusText = d.status === "completed"
            ? (d.failedTenants > 0 ? chalk.yellow("⚠ Completed") : chalk.green("✓ Completed"))
            : chalk.yellow("🚚 In Progress");
          const timeAgo = getTimeAgo(d.createdAt);

          table.push([
            chalk.cyan(d.id),
            d.solutionName,
            statusText,
            d.failedTenants > 0 ? `${progress} (${d.failedTenants} failed)` : progress,
            chalk.gray(timeAgo),
          ]);
        });

        console.log(table.toString());
        console.log();
        console.log(chalk.gray(`Use 'agentsync track --shipment <id>' to view details`));
        return;
      } else {
        console.error(chalk.red("--list flag requires Redis connection (not yet implemented in non-demo mode)"));
        console.log(chalk.gray("Try demo mode: agentsync demo on"));
        process.exit(1);
      }
    }

    const trackingId = options.shipment || options.deployment;

    if (!trackingId) {
      console.error(chalk.red("Must specify --shipment or --deployment tracking number, or use --list"));
      process.exit(1);
    }

    // Handle demo mode
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Showing mock data\n"));

      const shipment = getDemoDeploymentDetails(trackingId);

      if (!shipment) {
        console.log(chalk.yellow(`Shipment '${trackingId}' not found`));
        console.log();
        console.log(chalk.gray("Available demo shipments:"));
        DEMO_DEPLOYMENTS.forEach(d => {
          console.log(chalk.gray(`  - ${chalk.cyan(d.id)} (${d.solutionName})`));
        });
        return;
      }

      // Display overall status
      console.log(chalk.bold("📦 Shipment Tracking"));
      console.log("─".repeat(50));
      console.log(`  Tracking #:  ${shipment.id}`);
      console.log(`  Cargo:       ${shipment.solutionName}`);
      console.log(`  Status:      ${formatShippingStatus(shipment.status)}`);
      console.log(
        `  Delivered:   ${shipment.completedTenants}/${shipment.totalTenants} destinations`
      );
      if (shipment.failedTenants > 0) {
        console.log(
          `  Failed:      ${chalk.red(shipment.failedTenants.toString())} deliveries`
        );
      }
      console.log();

      // Display destination results
      const table = new Table({
        head: ["Destination", "Status", "Transit Time", "Issue"],
        style: { head: ["cyan"] },
        colWidths: [25, 15, 12, 40],
        wordWrap: true,
      });

      shipment.tenantResults.forEach((result) => {
        const duration = calculateDuration(
          result.startedAt,
          result.completedAt
        );
        table.push([
          result.tenantName,
          formatShippingStatus(result.status),
          duration,
          result.error ? chalk.red(truncate(result.error, 35)) : "-",
        ]);
      });

      console.log(table.toString());
      console.log();
      console.log(chalk.gray("Demo mode - use 'agentsync demo off' to disable"));
      return;
    }

    const spinner = ora("Connecting to shipping dock...").start();

    try {
      const queueManager = new DeploymentQueueManager(options.redis);
      spinner.succeed("Connected to shipping dock");

      const displayStatus = async () => {
        const shipment = await queueManager.getDeploymentStatus(trackingId);

        if (!shipment) {
          console.log(
            chalk.yellow(`Shipment '${trackingId}' not found`)
          );
          return false;
        }

        // Clear screen if watching
        if (options.watch) {
          console.clear();
        }

        // Display overall status
        console.log();
        console.log(chalk.bold("📦 Shipment Tracking"));
        console.log("─".repeat(50));
        console.log(`  Tracking #:  ${shipment.id}`);
        console.log(`  Cargo:       ${shipment.solutionName}`);
        console.log(`  Status:      ${formatShippingStatus(shipment.status)}`);
        console.log(
          `  Delivered:   ${shipment.completedTenants}/${shipment.totalTenants} destinations`
        );
        if (shipment.failedTenants > 0) {
          console.log(
            `  Failed:      ${chalk.red(shipment.failedTenants.toString())} deliveries`
          );
        }
        console.log();

        // Display destination results
        const table = new Table({
          head: ["Destination", "Status", "Transit Time", "Issue"],
          style: { head: ["cyan"] },
          colWidths: [25, 15, 12, 40],
          wordWrap: true,
        });

        shipment.tenantResults
          .sort((a, b) => {
            // Sort: in transit first, then pending, then delivered/failed
            const order: Record<string, number> = {
              in_progress: 0,
              pending: 1,
              scheduled: 1,
              awaiting_approval: 1,
              approved: 1,
              rolling_back: 0,
              completed: 2,
              rolled_back: 2,
              failed: 3,
              rejected: 3,
              cancelled: 4
            };
            return (order[a.status] ?? 5) - (order[b.status] ?? 5);
          })
          .forEach((result) => {
            const duration = calculateDuration(
              result.startedAt,
              result.completedAt
            );
            table.push([
              result.tenantName,
              formatShippingStatus(result.status),
              duration,
              result.error ? chalk.red(truncate(result.error, 35)) : "-",
            ]);
          });

        console.log(table.toString());

        if (options.watch) {
          console.log();
          console.log(
            chalk.gray(
              `Refreshing every ${options.interval}ms... (Ctrl+C to stop)`
            )
          );
        }

        // Return true if shipment is still in transit
        return (
          shipment.status === "pending" ||
          shipment.status === "in_progress"
        );
      };

      if (options.watch) {
        // Watch mode
        let isInTransit = await displayStatus();
        while (isInTransit) {
          await new Promise((resolve) =>
            setTimeout(resolve, parseInt(options.interval, 10))
          );
          isInTransit = await displayStatus();
        }
        console.log();
        console.log(chalk.green("📬 All deliveries complete."));
      } else {
        await displayStatus();
      }

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to track shipment"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// Use shipping-style status formatting for this command
const formatShippingStatus = (status: string) => formatStatus(status, "shipping");

// Alias for backward compatibility
const getTimeAgo = formatTimeAgo;
