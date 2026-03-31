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
import { generateMockDeploymentHistory } from "@agentsync/core";
import { isDemo } from "../../lib/command-wrapper.js";
import { outputDeploymentDetails } from "./helpers.js";
import { exitOssUnavailable } from "../../lib/oss-surface.js";

export const watchCommand = new Command("watch")
  .argument("<id>", "Deployment ID")
  .description("Watch deployment progress in real-time")
  .option("--interval <ms>", "Refresh interval in milliseconds", "3000")
  .action(async (id: string) => {
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

    exitOssUnavailable("deployments watch", {
      alternatives: ["Use 'agentsync deployments show <id>' to poll status manually."],
    });
  });
