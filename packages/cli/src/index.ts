#!/usr/bin/env node

import { Command } from "commander";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { deployCommand } from "./commands/deploy.js";
import { statusCommand } from "./commands/status.js";
import { tenantsCommand } from "./commands/tenants.js";
import { resolveUrlCommand } from "./commands/resolve-url.js";

const program = new Command();

program
  .name("agentsync")
  .description("AgentSync - Sync your agents to all your tenants")
  .version("0.1.0");

// Register commands with shipping theme
// pack = export (pack up a solution into a crate)
// ship = deploy (ship crates to destinations)
// track = status (track your shipments)
// fleet = tenants (manage your fleet of destinations)
// resolve-url = resolve M365 agent URL to solution
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(deployCommand);
program.addCommand(statusCommand);
program.addCommand(tenantsCommand);
program.addCommand(resolveUrlCommand);

program.parse();
