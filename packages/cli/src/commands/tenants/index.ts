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
import { listCommand } from "./list.js";
import { inspectCommand } from "./inspect.js";
import { showCommand } from "./show.js";
import { healthCommand } from "./health.js";
import { enableCommand, disableCommand, tagCommand } from "./manage.js";

export const tenantsCommand = new Command("tenants").description(
  "Manage target tenants where agents are deployed"
);

// Register subcommands
tenantsCommand.addCommand(listCommand);
tenantsCommand.addCommand(inspectCommand);
tenantsCommand.addCommand(showCommand);
tenantsCommand.addCommand(healthCommand);
tenantsCommand.addCommand(enableCommand);
tenantsCommand.addCommand(disableCommand);
tenantsCommand.addCommand(tagCommand);

// Re-export for backwards compatibility
export { findTenant, getDeployedAgentsForTenant } from "./helpers.js";
