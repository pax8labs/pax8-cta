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
import { isDemo } from "../../lib/command-wrapper.js";
import { handleCommandError } from "../../lib/errors.js";

// ============================================================================
// deployments approve
// ============================================================================

export const approveCommand = new Command("approve")
  .argument("<id>", "Deployment ID")
  .description("Approve a pending deployment that requires approval")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Approval workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} approval is simulated (no-op)`));
      console.log(
        chalk.gray("\nIn production, this will approve a deployment awaiting manual review.")
      );
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = createSpinner("Approving deployment...").start();

    try {
      // In production, call the API or queue manager
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
        spinner.fail(
          chalk.yellow(`Deployment '${id}' is not awaiting approval (status: ${deployment.status})`)
        );
        await queueManager.close();
        process.exit(1);
      }

      // Approval workflow not yet implemented - be honest about it
      spinner.fail(chalk.yellow("Approval workflow not yet implemented"));
      console.log(
        chalk.gray("\nDeployments currently start automatically without requiring approval.")
      );
      console.log(
        chalk.gray("To add approval gates, configure your deployment with --require-approval flag.")
      );
      console.log(chalk.gray("\nThis feature is planned for a future release."));
      await queueManager.close();
      process.exit(2); // Exit with code 2 to indicate "not implemented"
    } catch (error) {
      handleCommandError(error, spinner, "Failed to approve deployment");
    }
  });

// ============================================================================
// deployments reject
// ============================================================================

export const rejectCommand = new Command("reject")
  .argument("<id>", "Deployment ID")
  .description("Reject a pending deployment")
  .option("-r, --reason <text>", "Reason for rejection")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Rejection workflow not yet implemented\n"));
      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rejection is simulated (no-op)`));
      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }
      console.log(chalk.gray("\nIn production, this will reject and cancel a pending deployment."));
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = createSpinner("Rejecting deployment...").start();

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
        spinner.succeed(
          chalk.red(`Deployment ${chalk.cyan(id)} rejected (${cancelled} jobs cancelled)`)
        );
      } else {
        spinner.succeed(chalk.red(`Deployment ${chalk.cyan(id)} rejected`));
      }

      if (options.reason) {
        console.log(chalk.gray(`  Reason: ${options.reason}`));
      }

      await queueManager.close();
    } catch (error) {
      handleCommandError(error, spinner, "Failed to reject deployment");
    }
  });

// ============================================================================
// deployments cancel
// ============================================================================

export const cancelCommand = new Command("cancel")
  .argument("<id>", "Deployment ID")
  .description("Cancel an in-progress deployment")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE\n"));
      console.log(chalk.gray(`⊘ Deployment ${chalk.cyan(id)} cancelled`));
      return;
    }

    const spinner = createSpinner("Cancelling deployment...").start();

    try {
      const { DeploymentQueueManager } = await import("@agentsync/worker");
      const queueManager = new DeploymentQueueManager(options.redis);

      const cancelledCount = await queueManager.cancelDeployment(id);

      if (cancelledCount > 0) {
        spinner.succeed(
          chalk.gray(
            `Deployment ${chalk.cyan(id)} cancelled (${cancelledCount} pending jobs removed)`
          )
        );
      } else {
        spinner.warn(chalk.yellow(`No pending jobs found for deployment '${id}'`));
        console.log(chalk.gray("The deployment may have already completed or was not found."));
      }

      await queueManager.close();
    } catch (error) {
      handleCommandError(error, spinner, "Failed to cancel deployment");
    }
  });

// ============================================================================
// deployments retry
// ============================================================================

export const retryCommand = new Command("retry")
  .argument("<id>", "Deployment ID")
  .description("Retry failed tenants in a deployment")
  .option("-t, --tenant <tenantId>", "Retry only a specific tenant")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE\n"));
      if (options.tenant) {
        console.log(
          chalk.cyan(`↻ Retrying tenant ${options.tenant} in deployment ${chalk.cyan(id)}`)
        );
      } else {
        console.log(chalk.cyan(`↻ Retrying all failed tenants in deployment ${chalk.cyan(id)}`));
      }
      console.log(chalk.gray("\nUse 'agentsync deployments show " + id + "' to monitor progress."));
      return;
    }

    const spinner = createSpinner("Retrying failed jobs...").start();

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
        spinner.succeed(
          chalk.cyan(`Retrying ${retriedCount} failed job(s) for deployment ${chalk.cyan(id)}`)
        );
        console.log(chalk.gray(`\nUse 'agentsync deployments show ${id}' to monitor progress.`));
      } else {
        spinner.warn(chalk.yellow("No failed jobs found to retry"));
      }

      await queueManager.close();
    } catch (error) {
      handleCommandError(error, spinner, "Failed to retry deployment");
    }
  });

// ============================================================================
// deployments rollback
// ============================================================================

export const rollbackCommand = new Command("rollback")
  .argument("<id>", "Deployment ID")
  .description("Rollback a completed deployment to the previous version")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.log(chalk.yellow("\n⚠️  DEMO MODE - Rollback not yet implemented\n"));

      console.log(chalk.yellow(`⚠ Deployment ${chalk.cyan(id)} rollback is simulated (no-op)`));
      console.log(chalk.gray("\nIn production, this will restore the previous solution version."));
      console.log(
        chalk.gray("Rollback requires solution snapshots which are not currently captured.")
      );
      console.log(chalk.gray("This feature is planned for a future release."));
      process.exit(2);
    }

    const spinner = createSpinner("Initiating rollback...").start();

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
      console.log(
        chalk.gray("\nRollback requires solution snapshots which are not currently captured.")
      );
      console.log(
        chalk.gray(
          "To restore a previous version, create a new deployment with the older solution file."
        )
      );
      console.log(chalk.gray("\nThis feature is planned for a future release."));
      await queueManager.close();
      process.exit(2); // Exit with code 2 to indicate "not implemented"
    } catch (error) {
      handleCommandError(error, spinner, "Failed to initiate rollback");
    }
  });
