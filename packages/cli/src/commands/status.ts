import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { DeploymentQueueManager } from "@agentsync/worker";

export const statusCommand = new Command("track")
  .alias("status") // backwards compatibility
  .description("Track the status of a shipment")
  .option("-d, --deployment <id>", "Deployment ID to track")
  .option("-s, --shipment <id>", "Shipment tracking number (alias for --deployment)")
  .option(
    "--redis <url>",
    "Redis URL for shipping dock",
    "redis://localhost:6379"
  )
  .option("-w, --watch", "Watch for status changes")
  .option("--interval <ms>", "Watch interval in milliseconds", "5000")
  .action(async (options) => {
    const trackingId = options.shipment || options.deployment;

    if (!trackingId) {
      console.error(chalk.red("Must specify --shipment or --deployment tracking number"));
      process.exit(1);
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
        console.log(`  Status:      ${formatStatus(shipment.status)}`);
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

function formatStatus(status: string): string {
  switch (status) {
    case "completed":
      return chalk.green("✓ Delivered");
    case "failed":
      return chalk.red("✗ Failed");
    case "in_progress":
      return chalk.yellow("🚚 In Transit");
    case "pending":
      return chalk.gray("○ Queued");
    case "scheduled":
      return chalk.cyan("◷ Scheduled");
    case "awaiting_approval":
      return chalk.magenta("⊙ Awaiting Clearance");
    case "approved":
      return chalk.green("✓ Cleared");
    case "rejected":
      return chalk.red("✗ Rejected");
    case "cancelled":
      return chalk.gray("⊘ Cancelled");
    case "rolling_back":
      return chalk.yellow("↩ Returning");
    case "rolled_back":
      return chalk.blue("↩ Returned");
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
