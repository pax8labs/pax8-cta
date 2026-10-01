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
// Skip keys the CLI manages independently (demo mode via ~/.pax8-cta/cli-config.json,
// log level set above, and web-app-only keys).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pkgJson from "../package.json" with { type: "json" };
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

// Detect TTY early so subcommands can read getDefaultFormat() consistently.
// Only mutate process.env when this module is the actual entry point — when a
// test (e.g. index.test.ts) dynamically imports this file under vite-node, we
// must not pollute the vitest worker's process.env, because vitest's default
// threads pool shares process.env across all workers and that contamination
// leaks into spawned subprocess CLIs that then mis-render JSON output as
// box-drawing tables.
const isCliEntryPoint =
  process.argv[1]?.endsWith("dist/index.js") || process.argv[1]?.endsWith("dist\\index.js");
if (isCliEntryPoint && !process.env.PAX8_CTA_DEFAULT_FORMAT) {
  process.env.PAX8_CTA_DEFAULT_FORMAT = process.stdout.isTTY ? "table" : "json";
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
import { configCommand } from "./commands/config.js";
import { setupCommand } from "./commands/setup.js";
import { authCommand } from "./commands/auth.js";
import { validateCommand } from "./commands/validate.js";
import { statusCommand } from "./commands/status.js";
import { explainCommand } from "./commands/explain.js";
import { showBanner, showWelcome } from "./lib/banner.js";
import { startRepl } from "./lib/repl.js";
import {
  isTelemetryEnabled,
  hasShownFirstRunNotice,
  markFirstRunNoticeShown,
  getFirstRunNotice,
  initTelemetryIdentity,
  trackCommand,
  trackFirstRun,
  shutdownTelemetry,
} from "./lib/telemetry.js";
import { attachCommandTelemetry, errorCodeFor } from "./lib/command-telemetry.js";
import { isQuietMode } from "./lib/spinner.js";
import chalk from "chalk";

// Import package.json statically (not via runtime fs read) so the version
// is bundled into the compiled binary too. Bun --compile inlines the JSON
// content; tsc + Node resolve it from disk via the normal module resolution.
const VERSION = (pkgJson as { version: string }).version;

// Factory function to create a program instance
export function createProgram(): Command {
  const program = new Command();

  program
    .name("pax8-cta")
    .description("Pax8 CTA - Deploy and manage Power Platform agents across tenants")
    .version(VERSION)
    .option("--verbose", "Enable verbose output for debugging")
    .option("--json", "Output as JSON (default when stdout is not a TTY)")
    .option("--quiet", "Suppress all output (exit code only)")
    .option("--ids-only", "Print one ID per line (for shell pipelines and LLM agent flows)")
    .hook("preAction", (thisCommand) => {
      if (thisCommand.opts().verbose) {
        process.env.LOG_LEVEL = "debug";
      }

      // --ids-only is mutually exclusive with --json and --csv
      const opts = thisCommand.optsWithGlobals();
      if (opts.idsOnly) {
        if (opts.json) {
          console.error("Error: --ids-only and --json are mutually exclusive");
          process.exit(1);
        }
        if (opts.csv) {
          console.error("Error: --ids-only and --csv are mutually exclusive");
          process.exit(1);
        }
      }
    });

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
  program.addCommand(statusCommand);

  // Environment management
  program.addCommand(tenantsCommand);
  program.addCommand(setupCommand);
  program.addCommand(analyzeCommand);

  // Utilities
  program.addCommand(demoCommand);
  program.addCommand(telemetryCommand);
  program.addCommand(configCommand);
  program.addCommand(explainCommand);

  return program;
}

// Strip a leading "--" token from argv. POSIX shells already drop the first
// "--", but `pnpm cli -- <args>` (and similar nested-script wrappers) forward
// the literal "--" through to us, where Commander would otherwise treat it as
// an unknown command (issue #383).
if (process.argv[2] === "--") {
  process.argv.splice(2, 1);
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

// Show the first-run telemetry disclosure, once, before anything is collected.
//
// Deliberately not gated on `args.length > 0`: `args.length === 0` is the REPL
// branch, and gating there meant a REPL-only user was never told telemetry
// existed while the gate in `isTelemetryEnabled()` silently held collection off
// for the whole session. Quiet mode is still skipped - a machine-readable run
// must not have prose injected into it - which keeps collection off for a
// fresh install driven exclusively with --quiet, since the notice is what
// ungates it. That is the intended trade: no disclosure, no collection.
if (!isQuietMode()) {
  let owesNotice = false;

  try {
    owesNotice = !hasShownFirstRunNotice();
  } catch {
    // If config storage is not writable/readable, skip persistence without crashing.
    owesNotice = false;
  }

  if (owesNotice) {
    // Notice goes to stderr so it doesn't pollute stdout for JSON/script
    // callers piping output (same convention as the demo banner).
    console.error(chalk.gray(getFirstRunNotice()));
    try {
      markFirstRunNoticeShown();
    } catch {
      // Non-fatal: telemetry preference persistence should never break CLI usage.
    }
    // Marking above ungates collection, and the notice has already printed, so
    // the user was told before this first event is queued.
    if (isTelemetryEnabled()) {
      trackFirstRun();
    }
  }
}

// Resolve the PostHog identity once, up front, so every run — including ones
// that never load partner credentials (demo, --help, telemetry, config, REPL)
// — is attributed to a stable distinct ID instead of collapsing onto the
// anonymous per-machine fallback. Fire-and-forget; flushed at shutdown.
initTelemetryIdentity();

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
  // The REPL captures an event per command; flush them before exiting, the
  // same way the one-shot branch below does. Without this the last event of a
  // session was still in flight when the process ended.
  await shutdownTelemetry();
} else {
  const startTime = Date.now();
  const program = createProgram();

  // Track successful command execution (shared with the REPL entry point).
  attachCommandTelemetry(program, () => startTime);

  // Commander's default behaviour for a usage error (unknown command, unknown
  // option, missing argument) is to print and call process.exit() itself, so
  // parseAsync never rejects and the failure never reached telemetry. Route
  // those through the catch below instead; it re-exits with the same code.
  // Applied to subcommands too — exitOverride does not inherit.
  program.exitOverride();
  for (const cmd of program.commands) {
    cmd.exitOverride();
    for (const sub of cmd.commands) {
      sub.exitOverride();
    }
  }

  // Handle uncaught errors gracefully
  process.on("uncaughtException", async (error) => {
    console.error(chalk.red("\nUnexpected error:"), error.message);

    trackCommand({
      command: args[0] || "unknown",
      success: false,
      durationMs: Date.now() - startTime,
      errorCode: "ERROR_UNCAUGHT_EXCEPTION",
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
      errorCode: "ERROR_UNHANDLED_REJECTION",
    });

    await shutdownTelemetry();
    process.exit(1);
  });

  // Use parseAsync so we can await the command's action handler and flush
  // telemetry before the process exits. With program.parse() (sync), the
  // CLI would exit before posthog-node finished sending its HTTP request,
  // and events would be lost.
  //
  // Failures are emitted here rather than from a `process.on("exit")` handler.
  // That handler used to call trackCommand(), but trackCommand schedules its
  // work on a microtask and Node runs nothing async once "exit" fires — so
  // every failure event it produced was silently discarded, and PostHog only
  // ever saw successes.
  //
  // Commander signals "I printed help/version, now exit cleanly" as a thrown
  // error with exitCode 0. Those are successful runs, not failures.
  const CLEAN_EXIT_CODES = new Set([
    "commander.help",
    "commander.helpDisplayed",
    "commander.version",
  ]);

  let failure: unknown;
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    failure = error;
    const code = (error as { code?: string })?.code;
    if (!code || !CLEAN_EXIT_CODES.has(code)) {
      // Commander prints its own usage errors; anything else reached us
      // unhandled and would otherwise vanish now that we catch it here.
      if (!code?.startsWith("commander.")) {
        console.error(chalk.red("\nError:"), error instanceof Error ? error.message : error);
      }
      trackCommand({
        command: args[0] || "unknown",
        success: false,
        durationMs: Date.now() - startTime,
        errorCode: errorCodeFor(error),
      });
    }
  }

  await shutdownTelemetry();

  if (failure !== undefined) {
    const exitCode = (failure as { exitCode?: number })?.exitCode;
    process.exit(typeof exitCode === "number" ? exitCode : 1);
  }
}
