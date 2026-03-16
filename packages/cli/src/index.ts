#!/usr/bin/env node

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

// Set default log level for CLI
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "error";

// Load .env file from CWD (if it exists) so commands can find PARTNER_CLIENT_SECRET etc.
// Skip keys the CLI manages independently (demo mode via ~/.agentsync/cli-config.json,
// log level set above, and web-app-only keys).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const ENV_SKIP_KEYS = new Set([
  "DEMO_MODE",
  "NEXT_PUBLIC_DEMO_MODE",
  "LOG_LEVEL",
  "NODE_ENV",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
]);
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (ENV_SKIP_KEYS.has(key)) continue;
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

import { Command } from "commander";
import { exportCommand } from "./commands/export.js";
import { importCommand } from "./commands/import.js";
import { analyzeCommand } from "./commands/analyze.js";
import { deployCommand } from "./commands/deploy.js";
import { tenantsCommand } from "./commands/tenants/index.js";
import { deploymentsCommand } from "./commands/deployments/index.js";
import { solutionsCommand } from "./commands/solutions/index.js";
import { initCommand } from "./commands/init.js";
import { demoCommand } from "./commands/demo.js";
import { telemetryCommand } from "./commands/telemetry.js";
import { setupCommand } from "./commands/setup.js";
import { authCommand } from "./commands/auth.js";
import { validateCommand } from "./commands/validate.js";
import { showBanner, showWelcome } from "./lib/banner.js";
import { startRepl } from "./lib/repl.js";
import {
  isTelemetryEnabled,
  hasShownFirstRunNotice,
  markFirstRunNoticeShown,
  getFirstRunNotice,
  trackCommand,
  trackFirstRun,
  shutdownTelemetry,
} from "./lib/telemetry.js";
import chalk from "chalk";

const VERSION = "0.1.0";

// Factory function to create a program instance
export function createProgram(): Command {
  const program = new Command();

  program
    .name("agentsync")
    .description("AgentSync - Deploy and manage Power Platform agents across tenants")
    .version(VERSION);

  // Getting started
  program.addCommand(initCommand);
  program.addCommand(authCommand);
  program.addCommand(validateCommand);

  // Day-to-day workflow
  program.addCommand(solutionsCommand);
  program.addCommand(exportCommand);
  program.addCommand(importCommand);
  program.addCommand(deployCommand);
  program.addCommand(deploymentsCommand);

  // Environment management
  program.addCommand(tenantsCommand);
  program.addCommand(setupCommand);
  program.addCommand(analyzeCommand);

  // Utilities
  program.addCommand(demoCommand);
  program.addCommand(telemetryCommand);

  return program;
}

// Show banner if no arguments provided OR showing top-level help (not command-specific help)
const args = process.argv.slice(2);
const knownCommands = createProgram().commands.flatMap((cmd) => [cmd.name(), ...cmd.aliases()]);
const hasCommand = args.some((arg) => knownCommands.includes(arg));
const isTopLevelHelp = (args.includes("--help") || args.includes("-h")) && !hasCommand;
const shouldShowBanner = args.length === 0 || isTopLevelHelp;

if (shouldShowBanner) {
  showBanner(VERSION);
  if (args.length === 0) {
    showWelcome();
  }
}

// Show first-run telemetry notice (once)
if (isTelemetryEnabled() && !hasShownFirstRunNotice() && args.length > 0) {
  console.log(chalk.gray(getFirstRunNotice()));
  markFirstRunNoticeShown();
  trackFirstRun();
}

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(chalk.gray(`\n${signal} received. Shutting down gracefully...`));

  try {
    // Flush telemetry before exit
    await shutdownTelemetry();
  } catch {
    // Ignore errors during shutdown
  }

  process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
if (process.platform !== "win32") {
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

// If no arguments provided, enter interactive mode
if (args.length === 0) {
  await startRepl(createProgram);
} else {
  const startTime = Date.now();
  const program = createProgram();

  // Track command execution
  program.hook("postAction", (thisCommand) => {
    const durationMs = Date.now() - startTime;
    const command = thisCommand.parent?.name() || thisCommand.name();
    const subcommand = thisCommand.parent ? thisCommand.name() : undefined;

    // Extract flags (without values for privacy)
    const flags = Object.keys(thisCommand.opts());

    trackCommand({
      command,
      subcommand,
      flags,
      success: true,
      durationMs,
      demoMode: process.env.DEMO_MODE === "true",
    });
  });

  // Handle exit for telemetry tracking
  process.on("exit", (code) => {
    if (code !== 0 && !isShuttingDown) {
      const durationMs = Date.now() - startTime;
      const command = args[0] || "unknown";

      trackCommand({
        command,
        success: false,
        durationMs,
        errorType: "exit_code_" + code,
        demoMode: process.env.DEMO_MODE === "true",
      });
    }
  });

  // Handle uncaught errors gracefully
  process.on("uncaughtException", async (error) => {
    console.error(chalk.red("\nUnexpected error:"), error.message);

    trackCommand({
      command: args[0] || "unknown",
      success: false,
      durationMs: Date.now() - startTime,
      errorType: "uncaught_exception",
      demoMode: process.env.DEMO_MODE === "true",
    });

    await shutdownTelemetry();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error(chalk.red("\nUnhandled promise rejection:"), reason);

    trackCommand({
      command: args[0] || "unknown",
      success: false,
      durationMs: Date.now() - startTime,
      errorType: "unhandled_rejection",
      demoMode: process.env.DEMO_MODE === "true",
    });

    await shutdownTelemetry();
    process.exit(1);
  });

  program.parse();
}
