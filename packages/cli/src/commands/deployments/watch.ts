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
import { generateMockDeploymentHistory } from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { outputDeploymentDetails } from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

export const watchCommand = new Command("watch")
  .argument("<id>", "Deployment ID")
  .description("Watch deployment progress in real-time")
  .option("--interval <ms>", "Refresh interval in milliseconds", "3000")
  .option("--redis <url>", "Redis URL for production mode", "redis://localhost:6379")
  .action(async (id: string, options) => {
    if (isDemo()) {
      console.error(chalk.yellow("\n⚠️  DEMO MODE - Watch simulates progress\n"));

      const history = generateMockDeploymentHistory(50);
      const deployment = history.find((d) => d.id === id);

      if (!deployment) {
        console.log(chalk.red(`Deployment '${id}' not found`));
        process.exit(1);
      }

      outputDeploymentDetails(deployment);
      console.log(chalk.gray("\nIn production mode, this would refresh automatically."));
      console.log(chalk.gray("Press Ctrl+C to exit."));
      return;
    }

    const spinner = createSpinner("Connecting to deployment service...").start();

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
        await new Promise((resolve) => setTimeout(resolve, interval));
        isActive = await displayStatus();
      }

      console.log();
      console.log(chalk.green("✓ Deployment finished"));

      await queueManager.close();
    } catch (error) {
      handleCommandError(error, spinner, "Failed to watch deployment");
    }
  });
