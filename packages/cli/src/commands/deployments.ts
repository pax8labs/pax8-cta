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
import {
  generateMockDeploymentHistory,
  DeploymentJob,
  DeploymentStatus,
} from "@agentsync/core";
import { isDemoModeEnabled } from "./demo.js";
import {
  formatStatus,
  formatTimeAgo,
  formatDuration,
  truncate,
  truncateId,
} from "../lib/formatters.js";

/**
 * Deployments command - manage and view deployments
 *
 * Follows the resource-action pattern: `agentsync deployments <action>`
 */
export const deploymentsCommand = new Command("deployments")
  .alias("deps")
  .description("Manage deployments - list, show, approve, cancel, retry, rollback");

/**
 * List deployments with filtering and pagination
 */
deploymentsCommand
  .command("list")
  .alias("ls")
  .description("List deployments with optional filtering")
  .option("-s, --status <status>", "Filter by status (pending, in_progress, completed, failed)")
  .option("-t, --tenant <id>", "Filter by tenant ID or name")
  .option("-a, --agent <name>", "Filter by agent/solution name")
  .option("-l, --limit <n>", "Limit number of results", "20")
  .option("-o, --offset <n>", "Skip first N results", "0")
  .option("--since <date>", "Show deployments since date (ISO format or relative like '7d', '24h')")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const spinner = ora("Loading deployments...").start();

    try {
      // Get deployments (demo or production)
      let deployments = await getDeployments(options);

      // Apply filters
      deployments = filterDeployments(deployments, options);

      // Apply pagination
      const limit = parseInt(options.limit, 10);
      const offset = parseInt(options.offset, 10);
      const total = deployments.length;
      deployments = deployments.slice(offset, offset + limit);

      spinner.stop();

      // Output format
      if (options.json) {
        outputJson(deployments, total, limit, offset);
      } else {
        outputTable(deployments, total, limit, offset);
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load deployments"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

/**
 * Show deployment details (alias for track --shipment)
 */
deploymentsCommand
  .command("show <id>")
  .description("Show deployment details")
  .option("--json", "Output as JSON")
  .action(async (id, options) => {
    const spinner = ora("Loading deployment...").start();

    try {
      const deployment = await getDeploymentById(id);

      if (!deployment) {
        spinner.fail(chalk.yellow(`Deployment '${id}' not found`));
        if (isDemoModeEnabled()) {
          console.log();
          console.log(chalk.gray("Available demo deployments:"));
          const history = generateMockDeploymentHistory(5);
          history.forEach(d => {
            console.log(chalk.gray(`  - ${chalk.cyan(d.id)} (${d.solutionName})`));
          });
        }
        process.exit(1);
      }

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(deployment, null, 2));
      } else {
        outputDeploymentDetails(deployment);
      }
    } catch (error) {
      spinner.fail(chalk.red("Failed to load deployment"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

// ============================================================================
// Data fetching
// ============================================================================

async function getDeployments(_options: {
  status?: string;
  tenant?: string;
  agent?: string;
  limit?: string;
  since?: string;
}): Promise<DeploymentJob[]> {
  if (isDemoModeEnabled()) {
    console.log(chalk.yellow("\n⚠️  DEMO MODE - Using mock data\n"));
    // Generate more deployments for demo
    return generateMockDeploymentHistory(50);
  }

  // Production mode - would call API or read from queue
  // For now, show message about requiring API
  throw new Error(
    "Production mode requires API connection.\n" +
    "Start the web dashboard (see README for setup) or enable demo mode with 'agentsync demo on'"
  );
}

async function getDeploymentById(id: string): Promise<DeploymentJob | null> {
  if (isDemoModeEnabled()) {
    const history = generateMockDeploymentHistory(50);
    return history.find(d => d.id === id) || null;
  }

  // Production mode - would call API
  throw new Error(
    "Production mode requires API connection.\n" +
    "Start the web dashboard (see README for setup) or enable demo mode with 'agentsync demo on'"
  );
}

// ============================================================================
// Filtering
// ============================================================================

function filterDeployments(
  deployments: DeploymentJob[],
  options: {
    status?: string;
    tenant?: string;
    agent?: string;
    since?: string;
  }
): DeploymentJob[] {
  let filtered = [...deployments];

  // Filter by status
  if (options.status) {
    const status = options.status.toLowerCase() as DeploymentStatus;
    filtered = filtered.filter(d => d.status === status);
  }

  // Filter by agent/solution name
  if (options.agent) {
    const agentName = options.agent.toLowerCase();
    filtered = filtered.filter(d =>
      d.solutionName.toLowerCase().includes(agentName)
    );
  }

  // Filter by tenant (check tenant results)
  if (options.tenant) {
    const tenantQuery = options.tenant.toLowerCase();
    filtered = filtered.filter(d =>
      d.tenantResults?.some(
        t =>
          t.tenantName.toLowerCase().includes(tenantQuery) ||
          t.tenantId.toLowerCase().includes(tenantQuery)
      )
    );
  }

  // Filter by date
  if (options.since) {
    const sinceDate = parseDateFilter(options.since);
    if (sinceDate) {
      filtered = filtered.filter(d => new Date(d.createdAt) >= sinceDate);
    }
  }

  // Sort by created date (newest first)
  filtered.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return filtered;
}

function parseDateFilter(value: string): Date | null {
  // Try relative format (7d, 24h, 30m)
  const relativeMatch = value.match(/^(\d+)([dhm])$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();

    switch (unit) {
      case "d":
        return new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
      case "h":
        return new Date(now.getTime() - amount * 60 * 60 * 1000);
      case "m":
        return new Date(now.getTime() - amount * 60 * 1000);
    }
  }

  // Try ISO format
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// ============================================================================
// Output formatting
// ============================================================================

function outputJson(
  deployments: DeploymentJob[],
  total: number,
  limit: number,
  offset: number
): void {
  const output = {
    deployments: deployments.map(d => ({
      id: d.id,
      solutionName: d.solutionName,
      solutionVersion: d.solutionVersion,
      status: d.status,
      totalTenants: d.totalTenants,
      completedTenants: d.completedTenants,
      failedTenants: d.failedTenants,
      triggeredBy: d.triggeredBy,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + deployments.length < total,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

function outputTable(
  deployments: DeploymentJob[],
  total: number,
  limit: number,
  offset: number
): void {
  if (deployments.length === 0) {
    console.log(chalk.yellow("No deployments found matching your criteria."));
    return;
  }

  const table = new Table({
    head: ["ID", "Agent", "Version", "Status", "Progress", "Triggered", "Created"],
    style: { head: ["cyan"] },
  });

  deployments.forEach(d => {
    const progress = `${d.completedTenants}/${d.totalTenants}`;
    const progressWithFailed = d.failedTenants > 0
      ? `${progress} (${chalk.red(d.failedTenants + " failed")})`
      : progress;

    table.push([
      chalk.cyan(truncateId(d.id)),
      d.solutionName,
      d.solutionVersion || "-",
      formatStatus(d.status),
      progressWithFailed,
      d.triggeredBy || "-",
      formatTimeAgo(d.createdAt),
    ]);
  });

  console.log(table.toString());
  console.log();

  // Pagination info
  const showing = `Showing ${offset + 1}-${offset + deployments.length} of ${total}`;
  console.log(chalk.gray(showing));

  if (offset + deployments.length < total) {
    console.log(
      chalk.gray(`Use --offset ${offset + limit} to see more`)
    );
  }
}

function outputDeploymentDetails(deployment: DeploymentJob): void {
  console.log(chalk.bold("📦 Deployment Details"));
  console.log("─".repeat(60));
  console.log(`  ID:           ${chalk.cyan(deployment.id)}`);
  console.log(`  Agent:        ${deployment.solutionName}`);
  console.log(`  Version:      ${deployment.solutionVersion || "-"}`);
  console.log(`  Status:       ${formatStatus(deployment.status)}`);
  console.log(`  Progress:     ${deployment.completedTenants}/${deployment.totalTenants} tenants`);
  if (deployment.failedTenants > 0) {
    console.log(`  Failed:       ${chalk.red(deployment.failedTenants.toString())}`);
  }
  console.log(`  Triggered by: ${deployment.triggeredBy || "-"}`);
  console.log(`  Created:      ${formatTimeAgo(deployment.createdAt)}`);
  if (deployment.completedAt) {
    console.log(`  Completed:    ${formatTimeAgo(deployment.completedAt)}`);
  }
  if (deployment.durationMs) {
    console.log(`  Duration:     ${formatDuration(deployment.durationMs)}`);
  }
  console.log();

  // Tenant results
  if (deployment.tenantResults && deployment.tenantResults.length > 0) {
    console.log(chalk.bold("Tenant Results"));
    console.log("─".repeat(60));

    const table = new Table({
      head: ["Tenant", "Status", "Duration", "Error"],
      style: { head: ["cyan"] },
      colWidths: [22, 14, 10, 30],
      wordWrap: true,
    });

    deployment.tenantResults
      .sort((a, b) => {
        const order: Record<string, number> = {
          in_progress: 0,
          pending: 1,
          completed: 2,
          failed: 3,
        };
        return (order[a.status] ?? 5) - (order[b.status] ?? 5);
      })
      .forEach(result => {
        const duration = result.startedAt && result.completedAt
          ? formatDuration(
              new Date(result.completedAt).getTime() -
              new Date(result.startedAt).getTime()
            )
          : "-";

        table.push([
          truncate(result.tenantName, 20),
          formatStatus(result.status),
          duration,
          result.error ? chalk.red(truncate(result.error, 27)) : "-",
        ]);
      });

    console.log(table.toString());
  }
}


// ============================================================================
// deployments approve
// ============================================================================

deploymentsCommand
  .command("approve <id>")
  .description("Approve a pending deployment that requires approval")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Approval workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} approval is simulated (no-op)`));
      console.log(chalk.gray("\nIn production, this will approve a deployment awaiting manual review."));
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = ora("Approving deployment...").start();

    try {
      // In production, call the API or queue manager
      // For now, we'll add a stub that shows what would happen
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      // Check deployment exists and is awaiting approval
      const deployment = await queueManager.getDeploymentStatus(id);
      if (!deployment) {
        spinner.fail(chalk.red(`Deployment '${id}' not found`));
        await queueManager.close();
        process.exit(1);
      }

      if (deployment.status !== "awaiting_approval" && deployment.status !== "pending") {
        spinner.fail(chalk.yellow(`Deployment '${id}' is not awaiting approval (status: ${deployment.status})`));
        await queueManager.close();
        process.exit(1);
      }

      // Approval workflow not yet implemented - be honest about it
      spinner.fail(chalk.yellow("Approval workflow not yet implemented"));
      console.log(chalk.gray("\nDeployments currently start automatically without requiring approval."));
      console.log(chalk.gray("To add approval gates, configure your deployment with --require-approval flag."));
      console.log(chalk.gray("\nThis feature is planned for a future release."));
      await queueManager.close();
      process.exit(2); // Exit with code 2 to indicate "not implemented"
    } catch (error) {
      spinner.fail(chalk.red("Failed to approve deployment"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// deployments reject
// ============================================================================

deploymentsCommand
  .command("reject <id>")
  .description("Reject a pending deployment")
  .option("-r, --reason <text>", "Reason for rejection")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Rejection workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rejection is simulated (no-op)`));
      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }
      console.log(chalk.gray("\nIn production, this will reject and cancel a pending deployment."));
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = ora("Rejecting deployment...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      // Check deployment exists
      const deployment = await queueManager.getDeploymentStatus(id);
      if (!deployment) {
        spinner.fail(chalk.red(`Deployment '${id}' not found`));
        await queueManager.close();
        process.exit(1);
      }

      // Cancel the deployment (rejection = cancellation before it starts)
      const cancelled = await queueManager.cancelDeployment(id);

      if (cancelled > 0) {
        spinner.succeed(chalk.red(`Deployment ${chalk.cyan(id)} rejected (${cancelled} jobs cancelled)`));
      } else {
        spinner.succeed(chalk.red(`Deployment ${chalk.cyan(id)} rejected`));
      }

      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to reject deployment"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// deployments cancel
// ============================================================================

deploymentsCommand
  .command("cancel <id>")
  .description("Cancel an in-progress deployment")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE\n"));
      console.log(chalk.gray(`⊘ Deployment ${chalk.cyan(id)} cancelled`));
      return;
    }

    const spinner = ora("Cancelling deployment...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      const cancelledCount = await queueManager.cancelDeployment(id);

      if (cancelledCount > 0) {
        spinner.succeed(chalk.gray(`Deployment ${chalk.cyan(id)} cancelled (${cancelledCount} pending jobs removed)`));
      } else {
        spinner.warn(chalk.yellow(`No pending jobs found for deployment '${id}'`));
        console.log(chalk.gray("The deployment may have already completed or was not found."));
      }

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to cancel deployment"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// deployments retry
// ============================================================================

deploymentsCommand
  .command("retry <id>")
  .description("Retry failed tenants in a deployment")
  .option("-t, --tenant <tenantId>", "Retry only a specific tenant")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE\n"));
      if (options.tenant) {
        console.log(chalk.cyan(`↻ Retrying tenant ${options.tenant} in deployment ${chalk.cyan(id)}`));
      } else {
        console.log(chalk.cyan(`↻ Retrying all failed tenants in deployment ${chalk.cyan(id)}`));
      }
      console.log(chalk.gray("\nUse 'agentsync deployments show " + id + "' to monitor progress."));
      return;
    }

    const spinner = ora("Retrying failed jobs...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      // Check deployment exists
      const deployment = await queueManager.getDeploymentStatus(id);
      if (!deployment) {
        spinner.fail(chalk.red(`Deployment '${id}' not found`));
        await queueManager.close();
        process.exit(1);
      }

      if (deployment.failedTenants === 0) {
        spinner.warn(chalk.yellow("No failed tenants to retry"));
        await queueManager.close();
        return;
      }

      const retriedCount = await queueManager.retryFailedJobs(id);

      if (retriedCount > 0) {
        spinner.succeed(chalk.cyan(`Retrying ${retriedCount} failed job(s) for deployment ${chalk.cyan(id)}`));
        console.log(chalk.gray(`\nUse 'agentsync deployments show ${id}' to monitor progress.`));
      } else {
        spinner.warn(chalk.yellow("No failed jobs found to retry"));
      }

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to retry deployment"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// deployments rollback
// ============================================================================

deploymentsCommand
  .command("rollback <id>")
  .description("Rollback a completed deployment to the previous version")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Rollback not yet implemented\n"));

      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rollback is simulated (no-op)`));
      console.log(chalk.gray("\nIn production, this will restore the previous solution version."));
      console.log(chalk.gray("Rollback requires solution snapshots which are not currently captured."));
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = ora("Initiating rollback...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      // Check deployment exists
      const deployment = await queueManager.getDeploymentStatus(id);
      if (!deployment) {
        spinner.fail(chalk.red(`Deployment '${id}' not found`));
        await queueManager.close();
        process.exit(1);
      }

      if (deployment.status !== "completed") {
        spinner.fail(chalk.yellow(`Cannot rollback deployment with status '${deployment.status}'`));
        console.log(chalk.gray("Rollback is only available for completed deployments."));
        await queueManager.close();
        process.exit(1);
      }

      // Rollback not yet implemented - be honest about it
      spinner.fail(chalk.yellow("Rollback functionality not yet implemented"));
      console.log(chalk.gray("\nRollback requires solution snapshots which are not currently captured."));
      console.log(chalk.gray("To restore a previous version, create a new deployment with the older solution file."));
      console.log(chalk.gray("\nThis feature is planned for a future release."));
      await queueManager.close();
      process.exit(2); // Exit with code 2 to indicate "not implemented"
    } catch (error) {
      spinner.fail(chalk.red("Failed to initiate rollback"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// deployments watch
// ============================================================================

deploymentsCommand
  .command("watch <id>")
  .description("Watch deployment progress in real-time")
  .option("--interval <ms>", "Refresh interval in milliseconds", "3000")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemoModeEnabled()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Watch simulates progress\n"));

      const history = generateMockDeploymentHistory(50);
      const deployment = history.find(d => d.id === id);

      if (!deployment) {
        console.log(chalk.red(`Deployment '${id}' not found`));
        process.exit(1);
      }

      outputDeploymentDetails(deployment);
      console.log(chalk.gray("\nIn production mode, this would refresh automatically."));
      console.log(chalk.gray("Press Ctrl+C to exit."));
      return;
    }

    const spinner = ora("Connecting to deployment service...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);
      spinner.succeed("Connected");

      const interval = parseInt(options.interval, 10);

      const displayStatus = async (): Promise<boolean> => {
        const deployment = await queueManager.getDeploymentStatus(id);

        if (!deployment) {
          console.log(chalk.yellow(`Deployment '${id}' not found`));
          return false;
        }

        console.clear();
        outputDeploymentDetails(deployment);
        console.log();
        console.log(chalk.gray(`Refreshing every ${interval}ms... Press Ctrl+C to stop`));

        // Return true if still active
        return deployment.status === "pending" || deployment.status === "in_progress";
      };

      // Initial display
      let isActive = await displayStatus();

      // Watch loop
      while (isActive) {
        await new Promise(resolve => setTimeout(resolve, interval));
        isActive = await displayStatus();
      }

      console.log();
      console.log(chalk.green("✓ Deployment finished"));

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to watch deployment"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
