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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { DEMO_TENANTS, CONFIG_DIR_NAME, type TenantConfig } from "@agentsync/core";
import { formatCommandExample } from "../lib/spinner.js";

const CONFIG_DIR = join(homedir(), CONFIG_DIR_NAME);
const CONFIG_FILE = join(CONFIG_DIR, "cli-config.json");

// Demo script - sequence of commands to showcase CLI capabilities
const DEMO_SCRIPT = [
  {
    comment: "Welcome to AgentSync! Let's explore the CLI.",
    delay: 2000,
  },
  {
    comment: "First, let's see our tenants:",
    command: "tenants list",
    delay: 3000,
  },
  {
    comment: "We can filter tenants by tags:",
    command: "tenants list --tag enterprise",
    delay: 3000,
  },
  {
    comment: "Let's inspect a specific tenant:",
    command: "tenants show Contoso --agents --health",
    delay: 4000,
  },
  {
    comment: "Now let's check our available agents:",
    command: "agents list",
    delay: 3000,
  },
  {
    comment: "View details of a specific agent:",
    command: "agents show CustomerServiceAgent --tenants",
    delay: 4000,
  },
  {
    comment: "Check recent deployments:",
    command: "deployments list --limit 5",
    delay: 3000,
  },
  {
    comment: "Filter to see only failed deployments:",
    command: "deployments list --status failed --limit 3",
    delay: 3000,
  },
  {
    comment: "View details of a specific deployment:",
    command: "deployments show demo-hist-001",
    delay: 4000,
  },
  {
    comment: "Analyze deployment risk before shipping:",
    command: "analyze --solution ./CustomerServiceAgent.zip --tag enterprise",
    delay: 5000,
  },
  {
    comment: "That's the AgentSync CLI! Type 'agentsync --help' for all commands.",
    delay: 2000,
  },
];

interface DemoStep {
  comment?: string;
  command?: string;
  delay: number;
}

interface CliConfig {
  demoMode?: boolean;
  // True when the user explicitly toggled demo mode (via `demo on/off/toggle`).
  // When true, isDemoModeEnabled() will not auto-disable demo mode just because
  // PARTNER_CLIENT_SECRET happens to be set — the user's intent wins.
  demoModeExplicit?: boolean;
}

function loadCliConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveCliConfig(config: CliConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export const demoCommand = new Command("demo")
  .description("Toggle demo mode for testing without credentials")
  .argument("[action]", "on, off, or status (default: toggle)")
  .action(async (action?: string) => {
    const config = loadCliConfig();
    const currentMode = config.demoMode ?? false;

    if (!action || action === "toggle") {
      // Toggle mode
      const newMode = !currentMode;
      config.demoMode = newMode;
      config.demoModeExplicit = true;
      saveCliConfig(config);

      if (newMode) {
        console.log(chalk.green("✓ Demo mode enabled"));
        console.log();
        console.log(chalk.gray("  You can now use all commands without credentials."));
        console.log(chalk.gray("  Mock data will be used for demonstrations."));
        console.log();
        console.log(chalk.cyan("  Try:"), formatCommandExample("tenants list"));
      } else {
        console.log(chalk.yellow("✓ Demo mode disabled"));
        console.log();
        console.log(chalk.gray("  Real credentials required for operations."));
        console.log(chalk.gray("  Configure with: " + formatCommandExample("init")));
      }
    } else if (action === "on" || action === "enable") {
      config.demoMode = true;
      config.demoModeExplicit = true;
      saveCliConfig(config);
      console.log(chalk.green("✓ Demo mode enabled"));
    } else if (action === "off" || action === "disable") {
      config.demoMode = false;
      config.demoModeExplicit = true;
      saveCliConfig(config);
      console.log(chalk.yellow("✓ Demo mode disabled"));
    } else if (action === "status") {
      const envVar = process.env.DEMO_MODE;
      const configMode = config.demoMode ?? false;
      const effectiveMode = isDemoModeEnabled();

      console.log(chalk.bold("Demo Mode Status"));
      console.log();

      // Show effective state
      if (effectiveMode) {
        console.log(chalk.green("  Status: ENABLED"));
      } else {
        console.log(chalk.gray("  Status: DISABLED"));
      }
      console.log();

      // Show where the setting comes from
      console.log(chalk.bold("  Configuration:"));
      if (envVar !== undefined) {
        console.log(
          `    DEMO_MODE env var: ${chalk.cyan(envVar || '""')} ${envVar ? "(takes precedence)" : "(empty = disabled)"}`
        );
      } else {
        console.log(chalk.gray("    DEMO_MODE env var: not set"));
      }
      console.log(
        `    Config file:       ${configMode ? chalk.green("enabled") : chalk.gray("disabled")}`
      );
      console.log(`    Path:              ${chalk.gray(CONFIG_FILE)}`);
      console.log();

      // Show how to change
      if (effectiveMode) {
        console.log(chalk.bold("  To disable:"));
        console.log(
          chalk.gray("    " + formatCommandExample("demo off").padEnd(28) + "# Update config file")
        );
        console.log(chalk.gray("    DEMO_MODE=false agentsync   # Override for one command"));
      } else {
        console.log(chalk.bold("  To enable:"));
        console.log(
          chalk.gray("    " + formatCommandExample("demo on").padEnd(28) + "# Update config file")
        );
        console.log(chalk.gray("    DEMO_MODE=true agentsync    # Override for one command"));
      }
    } else {
      console.error(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray("Valid actions: on, off, status, toggle"));
      process.exit(1);
    }
  });

// Tracks whether we've already warned about an auto-disable in this process so
// we don't spam the user across multiple command invocations within one REPL session.
let warnedAutoDisable = false;

// Export helper to check if demo mode is enabled
export function isDemoModeEnabled(): boolean {
  // Environment variable DEMO_MODE=true takes highest precedence
  const envVar = process.env.DEMO_MODE;
  if (envVar === "true" || envVar === "1") {
    return true;
  }
  // Explicit DEMO_MODE=false/0/"" disables regardless of config
  if (envVar === "false" || envVar === "0" || envVar === "") {
    return false;
  }

  const config = loadCliConfig();
  const stored = config.demoMode ?? false;
  const explicit = config.demoModeExplicit ?? false;
  const hasCredential = !!(
    process.env.PARTNER_CLIENT_SECRET || process.env.AGENTSYNC_CLIENT_SECRET
  );

  // If credentials are present and the user did not explicitly opt into demo mode,
  // auto-disable. This prevents a stale demoMode:true config from silently masking
  // real auth attempts. When the user has explicitly run `demo on`, their intent wins.
  if (hasCredential && stored && !explicit) {
    if (!warnedAutoDisable) {
      warnedAutoDisable = true;
      console.error(
        chalk.yellow(
          "Demo mode auto-disabled because PARTNER_CLIENT_SECRET is set. " +
            `Run \`${formatCommandExample("demo on")}\` to keep demo mode on, or set DEMO_MODE=true to override.`
        )
      );
    }
    return false;
  }

  return stored;
}

/**
 * Get filtered demo tenants based on command options.
 * Shared across analyze, deploy, and other commands that operate on tenant sets.
 */
export function getDemoTenants(options: { all?: boolean; tag?: string[] }): TenantConfig[] {
  let destinations = DEMO_TENANTS.filter((t) => t.enabled);
  if (!options.all && options.tag) {
    destinations = destinations.filter((t) =>
      options.tag!.some((tag: string) => t.tags?.includes(tag))
    );
  }
  return destinations;
}

// ============================================================================
// Auto-demo subcommand
// ============================================================================

demoCommand
  .command("auto")
  .alias("run")
  .description("Run an automated demo showcasing CLI capabilities")
  .option("-s, --speed <multiplier>", "Speed multiplier (0.5 = slower, 2 = faster)", "1")
  .option("--no-typing", "Disable typing animation")
  .option("--step", "Step-through mode (press Enter between commands)")
  .action(async (options) => {
    // Ensure demo mode is enabled
    const config = loadCliConfig();
    const wasEnabled = config.demoMode ?? false;
    if (!wasEnabled) {
      config.demoMode = true;
      saveCliConfig(config);
    }

    const speedMultiplier = parseFloat(options.speed) || 1;
    const useTyping = options.typing !== false;
    const stepMode = options.step === true;

    console.clear();
    console.log();
    console.log(chalk.cyan.bold("  ╔═══════════════════════════════════════════════════════════╗"));
    console.log(
      chalk.cyan.bold("  ║") +
        chalk.white.bold("           AgentSync CLI - Interactive Demo              ") +
        chalk.cyan.bold("║")
    );
    console.log(chalk.cyan.bold("  ╚═══════════════════════════════════════════════════════════╝"));
    console.log();
    console.log(chalk.gray("  Press Ctrl+C at any time to exit"));
    console.log();

    // Handle graceful exit
    let shouldExit = false;
    const exitHandler = () => {
      shouldExit = true;
      console.log();
      console.log(chalk.yellow("\n  Demo interrupted. Goodbye!"));
      process.exit(0);
    };
    process.on("SIGINT", exitHandler);

    try {
      for (const step of DEMO_SCRIPT as DemoStep[]) {
        if (shouldExit) break;

        // Show comment
        if (step.comment) {
          console.log();
          console.log(chalk.yellow(`  💡 ${step.comment}`));
          console.log();
        }

        // Execute command
        if (step.command) {
          // Show the command with typing animation
          const prompt = chalk.cyan("  $ agentsync ");
          if (useTyping) {
            await typeText(prompt + chalk.white(step.command), speedMultiplier);
          } else {
            process.stdout.write(prompt + chalk.white(step.command));
          }
          console.log();
          console.log();

          // Execute the command
          await runCommand(step.command);
          console.log();
        }

        // Step mode - wait for Enter
        if (stepMode && step.command) {
          console.log(chalk.gray("  Press Enter to continue..."));
          await waitForEnter();
        } else {
          // Normal delay between steps
          await sleep(step.delay / speedMultiplier);
        }
      }

      console.log();
      console.log(chalk.green.bold("  ✓ Demo complete!"));
      console.log();
      console.log(
        chalk.gray(
          "  Demo mode is still enabled. Disable with: " + formatCommandExample("demo off")
        )
      );
      console.log();
    } finally {
      process.removeListener("SIGINT", exitHandler);
    }
  });

/**
 * Type text with animation effect
 */
async function typeText(text: string, speedMultiplier: number): Promise<void> {
  const baseDelay = 30 / speedMultiplier;
  for (const char of text) {
    process.stdout.write(char);
    await sleep(baseDelay + Math.random() * 20);
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for user to press Enter
 */
async function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const onData = () => {
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      resolve();
    };
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

/**
 * Run a CLI command and capture output
 */
async function runCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = command.split(" ");
    // When running as a compiled binary, execPath is the CLI itself
    const isBundled = !process.argv[1] || process.argv[1] === process.execPath;
    const spawnArgs = isBundled ? [...args] : [process.argv[1], ...args];
    const proc = spawn(process.execPath, spawnArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        DEMO_MODE: "true",
      },
    });

    proc.on("close", () => resolve());
    proc.on("error", reject);
  });
}
