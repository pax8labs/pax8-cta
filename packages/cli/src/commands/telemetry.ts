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
import {
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  getTelemetryDisabledSource,
} from "../lib/telemetry.js";

export const telemetryCommand = new Command("telemetry")
  .description("Manage anonymous usage telemetry")
  .action(() => {
    // Default action: show status
    showStatus();
  });

telemetryCommand
  .command("status")
  .description("Show telemetry status")
  .action(() => {
    showStatus();
  });

telemetryCommand
  .command("on")
  .description("Enable anonymous telemetry")
  .action(() => {
    enableTelemetry();
    console.log(chalk.green("✓ Telemetry enabled"));
    console.log();
    console.log(chalk.gray("Thank you for helping improve Pax8 CTA CLI!"));
    console.log(
      chalk.gray("We collect only anonymous usage data - never any personal or tenant information.")
    );
  });

telemetryCommand
  .command("off")
  .description("Disable telemetry")
  .action(() => {
    disableTelemetry();
    console.log(chalk.yellow("✓ Telemetry disabled"));
    console.log();
    console.log(chalk.gray("No usage data will be collected."));
    console.log(chalk.gray("You can re-enable anytime with 'telemetry on'"));
  });

function showStatus(): void {
  const enabled = isTelemetryEnabled();

  console.log(chalk.bold("Telemetry Status"));
  console.log("─".repeat(50));
  console.log();

  if (enabled) {
    console.log(`  Status: ${chalk.green("Enabled")}`);
  } else {
    console.log(`  Status: ${chalk.yellow("Disabled")}`);
  }

  console.log();
  console.log(chalk.bold("What we collect:"));
  console.log(chalk.gray("  • Command names (e.g., 'deploy', 'fleet list')"));
  console.log(chalk.gray("  • Success/failure status"));
  console.log(chalk.gray("  • Execution duration"));
  console.log(chalk.gray("  • CLI version and OS"));
  console.log();
  console.log(chalk.bold("What we NEVER collect:"));
  console.log(chalk.gray("  • Tenant IDs, names, or data"));
  console.log(chalk.gray("  • Solution names or file paths"));
  console.log(chalk.gray("  • Configuration values"));
  console.log(chalk.gray("  • Any personally identifiable information"));
  console.log();
  console.log(
    chalk.gray("Learn more: https://github.com/pax8labs/pax8-cta/tree/main/packages/cli#telemetry")
  );
  console.log();

  if (enabled) {
    console.log(chalk.gray("To disable: telemetry off"));
    console.log(chalk.gray("  Or set: PAX8_CTA_TELEMETRY_DISABLED=1 or DO_NOT_TRACK=1"));
  } else {
    // `telemetry on` only writes the config file, so it is the right advice
    // for exactly one of the five disable sources. Suggesting it for an
    // env-var or CI disable sends the user off to run a command that will
    // appear to succeed and change nothing.
    switch (getTelemetryDisabledSource()) {
      case "env":
        console.log(chalk.gray("Disabled by PAX8_CTA_TELEMETRY_DISABLED."));
        console.log(chalk.gray("To re-enable: unset PAX8_CTA_TELEMETRY_DISABLED"));
        break;
      case "do-not-track":
        console.log(chalk.gray("Disabled by DO_NOT_TRACK (https://consoledonottrack.com)."));
        console.log(chalk.gray("To re-enable: unset DO_NOT_TRACK"));
        break;
      case "ci":
        console.log(chalk.gray("Disabled automatically because CI is set."));
        console.log(chalk.gray("Telemetry is never collected in CI environments."));
        break;
      case "no-key":
        console.log(chalk.gray("No PostHog key is configured in this build."));
        console.log(chalk.gray("Nothing will be collected regardless of this setting."));
        break;
      case "pending-notice":
        console.log(chalk.gray("Paused until the telemetry notice has been shown once."));
        console.log(chalk.gray("Run any command to see it; collection starts after that."));
        break;
      case "config":
        console.log(chalk.gray("Turned off on this machine (telemetry is on by default)."));
        console.log(chalk.gray("To re-enable: telemetry on"));
        break;
      default:
        console.log(chalk.gray("To re-enable: telemetry on"));
    }
  }
}
