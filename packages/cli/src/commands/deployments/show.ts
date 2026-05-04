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
import { generateMockDeploymentHistory } from "@agentsync/core";
import { withDemoMode } from "../../lib/command-wrapper.js";
import {
  getDeploymentById,
  getDeploymentHistoryById,
  outputDeploymentDetails,
  outputHistoryDetails,
  resolveDeploymentFormat,
} from "./helpers.js";
import { handleCommandError } from "../../lib/errors.js";

export const showCommand = new Command("show")
  .argument("<id>", "Deployment or history entry ID")
  .description("Show details of a specific deployment")
  .option("-c, --config <path>", "Path to config file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  agentsync deployments show abc-123                  Show details for a deployment
  agentsync deployments show abc-123 --json           Output as JSON
`
  )
  .action(async (id, options) => {
    const spinner = createSpinner("Loading deployment...").start();

    try {
      await withDemoMode(
        async () => {
          const deployment = await getDeploymentById(id);

          if (!deployment) {
            spinner.fail(chalk.yellow(`Deployment '${id}' not found`));
            console.log();
            console.log(chalk.gray("Available demo deployments:"));
            const history = generateMockDeploymentHistory(5);
            history.forEach((d) => {
              console.log(chalk.gray(`  - ${chalk.cyan(d.id)} (${d.solutionName})`));
            });
            process.exit(1);
          }

          spinner.stop();

          const fmt = resolveDeploymentFormat(options);
          if (fmt === "json") {
            console.log(JSON.stringify(deployment, null, 2));
          } else if (fmt !== "quiet") {
            outputDeploymentDetails(deployment);
          }
        },
        async () => {
          // Production mode
          const entry = await getDeploymentHistoryById(id, options);

          if (!entry) {
            spinner.fail(chalk.yellow(`History entry '${id}' not found`));
            console.log(chalk.gray("\nUse 'agentsync deployments list' to see available entries."));
            process.exit(1);
          }

          spinner.stop();

          const fmt = resolveDeploymentFormat(options);
          if (fmt === "json") {
            console.log(JSON.stringify(entry, null, 2));
          } else if (fmt !== "quiet") {
            outputHistoryDetails(entry);
          }
        }
      );
    } catch (error) {
      handleCommandError(error, spinner, "Failed to load deployment");
    }
  });
