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
  isDiagnosticTelemetryEnabled,
  enableDiagnosticTelemetry,
  disableDiagnosticTelemetry,
} from "../lib/telemetry.js";
import { formatCommandExample } from "../lib/spinner.js";

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
    console.log(chalk.gray("Thank you for helping improve AgentSync CLI!"));
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
    console.log(
      chalk.gray(`You can re-enable anytime with '${formatCommandExample("telemetry on")}'`)
    );
  });

const diagnosticsCmd = telemetryCommand
  .command("diagnostics")
  .description("Manage diagnostic error reporting (richer data for troubleshooting)");

diagnosticsCmd
  .command("on")
  .description("Enable automatic diagnostic error reporting")
  .action(() => {
    enableDiagnosticTelemetry();
    console.log(chalk.green("✓ Diagnostic telemetry enabled (base telemetry also enabled)"));
    console.log();
    console.log(chalk.gray("When errors occur, detailed reports will be sent automatically."));
    console.log(chalk.gray("This includes: error codes, error messages, Microsoft correlation"));
    console.log(chalk.gray("IDs, tenant IDs (not names), and step-level timing data."));
    console.log();
    console.log(chalk.gray("Still NEVER includes: secrets, tokens, tenant names, user names,"));
    console.log(chalk.gray("file paths, solution contents, or IP addresses."));
  });

diagnosticsCmd
  .command("off")
  .description("Disable diagnostic error reporting")
  .action(() => {
    disableDiagnosticTelemetry();
    console.log(chalk.yellow("✓ Diagnostic telemetry disabled"));
    console.log(chalk.gray("You'll still be prompted to send reports on errors (y/N/always)."));
  });

function showStatus(): void {
  const enabled = isTelemetryEnabled();
  const diagnosticsEnabled = isDiagnosticTelemetryEnabled();

  console.log(chalk.bold("Telemetry Status"));
  console.log("─".repeat(50));
  console.log();

  if (enabled) {
    console.log(`  Base telemetry:       ${chalk.green("Enabled")}`);
  } else {
    console.log(`  Base telemetry:       ${chalk.yellow("Disabled")}`);
  }

  if (diagnosticsEnabled) {
    console.log(`  Diagnostic reports:   ${chalk.green("Enabled (automatic)")}`);
  } else {
    console.log(`  Diagnostic reports:   ${chalk.yellow("Disabled (prompted on error)")}`);
  }

  console.log();
  console.log(chalk.bold("Base telemetry collects:"));
  console.log(chalk.gray("  • Command names (e.g., 'deploy', 'fleet list')"));
  console.log(chalk.gray("  • Success/failure status"));
  console.log(chalk.gray("  • Execution duration"));
  console.log(chalk.gray("  • CLI version and OS"));
  console.log();
  console.log(chalk.bold("Diagnostic reports also include:"));
  console.log(chalk.gray("  • Error messages and error codes"));
  console.log(chalk.gray("  • Microsoft correlation IDs (x-ms-request-id)"));
  console.log(chalk.gray("  • Tenant IDs (not names)"));
  console.log(chalk.gray("  • Step-level timing from diagnose command"));
  console.log();
  console.log(chalk.bold("NEVER collected:"));
  console.log(chalk.gray("  • Secrets, tokens, or credentials"));
  console.log(chalk.gray("  • Tenant names or user names"));
  console.log(chalk.gray("  • Solution contents or file paths"));
  console.log(chalk.gray("  • Any personally identifiable information"));
  console.log();
  console.log(
    chalk.gray("Learn more: https://github.com/pax8labs/agentsync/tree/main/packages/cli#telemetry")
  );
  console.log();

  if (enabled) {
    console.log(chalk.gray("To disable: " + formatCommandExample("telemetry off")));
    console.log(chalk.gray("  Or set: AGENTSYNC_TELEMETRY_DISABLED=1 or DO_NOT_TRACK=1"));
  } else {
    console.log(chalk.gray("To enable: " + formatCommandExample("telemetry on")));
  }
  if (!diagnosticsEnabled) {
    console.log(
      chalk.gray(
        "To enable auto error reports: " + formatCommandExample("telemetry diagnostics on")
      )
    );
  }
}
