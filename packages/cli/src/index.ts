#!/usr/bin/env node

import { Command } from "commander";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { deployCommand } from "./commands/deploy.js";
import { statusCommand } from "./commands/status.js";
import { tenantsCommand } from "./commands/tenants.js";

const program = new Command();

program
  .name("csd")
  .description("Copilot Studio Deployer - Multi-tenant deployment automation for MSPs")
  .version("0.1.0");

// Register commands
program.addCommand(exportCommand);
program.addCommand(importCommand);
program.addCommand(deployCommand);
program.addCommand(statusCommand);
program.addCommand(tenantsCommand);

program.parse();
