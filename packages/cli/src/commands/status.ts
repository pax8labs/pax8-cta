import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { DeploymentQueueManager } from "@csd/worker";

export const statusCommand = new Command("status")
  .description("Check the status of a deployment")
  .requiredOption("-d, --deployment <id>", "Deployment ID to check")
  .option(
    "--redis <url>",
    "Redis URL for job queue",
    "redis://localhost:6379"
  )
  .option("-w, --watch", "Watch for status changes")
  .option("--interval <ms>", "Watch interval in milliseconds", "5000")
  .action(async (options) => {
    const spinner = ora("Connecting to job queue...").start();

    try {
      const queueManager = new DeploymentQueueManager(options.redis);
      spinner.succeed("Connected to job queue");

      const displayStatus = async () => {
        const deployment = await queueManager.getDeploymentStatus(
          options.deployment
        );

        if (!deployment) {
          console.log(
            chalk.yellow(`Deployment '${options.deployment}' not found`)
          );
          return false;
        }

        // Clear screen if watching
        if (options.watch) {
          console.clear();
        }

        // Display overall status
        console.log();
        console.log(chalk.bold("Deployment Status"));
        console.log("─".repeat(50));
        console.log(`  ID:        ${deployment.id}`);
        console.log(`  Solution:  ${deployment.solutionName}`);
        console.log(`  Status:    ${formatStatus(deployment.status)}`);
        console.log(
          `  Progress:  ${deployment.completedTenants}/${deployment.totalTenants} completed`
        );
        if (deployment.failedTenants > 0) {
          console.log(
            `  Failed:    ${chalk.red(deployment.failedTenants.toString())}`
          );
        }
        console.log();

        // Display tenant results
        const table = new Table({
          head: ["Tenant", "Status", "Duration", "Error"],
          style: { head: ["cyan"] },
          colWidths: [25, 15, 12, 40],
          wordWrap: true,
        });

        deployment.tenantResults
          .sort((a, b) => {
            // Sort: in_progress first, then pending, then completed/failed
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
              formatStatus(result.status),
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

        // Return true if deployment is still in progress
        return (
          deployment.status === "pending" ||
          deployment.status === "in_progress"
        );
      };

      if (options.watch) {
        // Watch mode
        let isRunning = await displayStatus();
        while (isRunning) {
          await new Promise((resolve) =>
            setTimeout(resolve, parseInt(options.interval, 10))
          );
          isRunning = await displayStatus();
        }
        console.log();
        console.log(chalk.green("Deployment completed."));
      } else {
        await displayStatus();
      }

      await queueManager.close();
    } catch (error) {
      spinner.fail(chalk.red("Failed to get status"));
      console.error(
        chalk.red(error instanceof Error ? error.message : String(error))
      );
      process.exit(1);
    }
  });

function formatStatus(status: string): string {
  switch (status) {
    case "completed":
      return chalk.green("✓ Completed");
    case "failed":
      return chalk.red("✗ Failed");
    case "in_progress":
      return chalk.yellow("⟳ In Progress");
    case "pending":
      return chalk.gray("○ Pending");
    case "scheduled":
      return chalk.cyan("◷ Scheduled");
    case "awaiting_approval":
      return chalk.magenta("⊙ Awaiting Approval");
    case "approved":
      return chalk.green("✓ Approved");
    case "rejected":
      return chalk.red("✗ Rejected");
    case "cancelled":
      return chalk.gray("⊘ Cancelled");
    case "rolling_back":
      return chalk.yellow("↩ Rolling Back");
    case "rolled_back":
      return chalk.blue("↩ Rolled Back");
    default:
      return status;
  }
}

function calculateDuration(
  startedAt?: string,
  completedAt?: string
): string {
  if (!startedAt) return "-";

  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${Math.round(durationMs / 1000)}s`;
  return `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}
