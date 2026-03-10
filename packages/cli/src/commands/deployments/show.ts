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
import { generateMockDeploymentHistory } from "@agentsync/core";
import { isDemoModeEnabled } from "../demo.js";
import { getDeploymentById, outputDeploymentDetails } from "./helpers.js";

export const showCommand = new Command("show")
  .argument("<id>", "Deployment ID")
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
          history.forEach((d) => {
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
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
