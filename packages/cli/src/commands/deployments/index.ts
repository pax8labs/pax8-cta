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
import { listCommand } from "./list.js";
import { showCommand } from "./show.js";
import { watchCommand } from "./watch.js";
import {
  approveCommand,
  rejectCommand,
  cancelCommand,
  retryCommand,
  rollbackCommand,
} from "./actions.js";

/**
 * Deployments command - manage and view deployments
 *
 * Follows the resource-action pattern: `agentsync deployments <action>`
 */
export const deploymentsCommand = new Command("deployments")
  .description("View deployment history")
  .addHelpText(
    "after",
    `
Examples:
  agentsync deployments list                          List recent deployments
  agentsync deployments show dep_abc123               View deployment details
  agentsync deployments list -s failed --since 7d     Show failed deployments from last 7 days

Note:
  Queue management actions are not available in the open-source CLI.
`
  );

// Register subcommands
deploymentsCommand.addCommand(listCommand);
deploymentsCommand.addCommand(showCommand);
deploymentsCommand.addCommand(watchCommand, { hidden: true });
deploymentsCommand.addCommand(cancelCommand, { hidden: true });
deploymentsCommand.addCommand(retryCommand, { hidden: true });

// These commands are planned but not yet implemented — hidden from help
// but still registered so users get a clear message if they try them.
deploymentsCommand.addCommand(approveCommand, { hidden: true });
deploymentsCommand.addCommand(rejectCommand, { hidden: true });
deploymentsCommand.addCommand(rollbackCommand, { hidden: true });

// Re-export helpers for backwards compatibility
export {
  getDeployments,
  getDeploymentById,
  filterDeployments,
  outputDeploymentDetails,
} from "./helpers.js";
