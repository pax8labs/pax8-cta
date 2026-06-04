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

/**
 * `agentsync config` — print a structured report of the CLI's effective
 * settings without ever revealing secret values. Probes:
 *   - demo mode (env vs config file)
 *   - default output format (TTY / piped / forced)
 *   - quiet mode
 *   - credential presence (env vars + OS keychain) — never the value
 *   - telemetry status and where the disabled signal comes from
 *   - tenants config file path, parse status, and counts
 *   - filesystem paths the CLI reads/writes
 *
 * Honors `--quiet`, `--json`, and the TTY-default-JSON convention via
 * `resolveFormat()` so it composes with the rest of the CLI.
 *
 * See issue #309 for context.
 */

import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "@pax8-cta/core";
import { resolveFormat } from "../lib/output.js";
import { isDemoModeEnabled } from "./demo.js";
import { probeStoredSecret } from "../lib/credentials.js";
import {
  isTelemetryEnabled,
  getTelemetryConfigPath,
  getTelemetryDisabledSource,
} from "../lib/telemetry.js";
import { handleCommandError } from "../lib/errors.js";

// ============================================================================
// Types
// ============================================================================

interface DemoSection {
  enabled: boolean;
  source: "env" | "config" | "default";
}

interface FormatSection {
  effective: "table" | "json";
  source: "tty" | "piped" | "env";
}

interface QuietSection {
  enabled: boolean;
  source: "flag" | "env" | null;
}

interface CredentialsSection {
  partnerClientSecretEnv: "set" | "not-set";
  agentsyncClientSecretEnv: "set" | "not-set";
  osKeychain: "set" | "not-set" | "unavailable";
  effectiveSource: "env" | "keychain" | "none";
}

interface TelemetrySection {
  enabled: boolean;
  disabledSource: "env" | "do-not-track" | "ci" | "no-key" | "config" | null;
}

interface TenantsSection {
  path: string;
  status: "found" | "not-found" | "parse-error";
  sourceEnvironmentUrl: string | null;
  total: number;
  enabled: number;
  disabled: number;
  parseError?: string;
}

interface PathsSection {
  cliConfig: string;
  telemetryConfig: string;
  projectConfig: string;
}

interface ConfigReport {
  demoMode: DemoSection;
  defaultFormat: FormatSection;
  quietMode: QuietSection;
  credentials: CredentialsSection;
  telemetry: TelemetrySection;
  tenantsConfig: TenantsSection;
  paths: PathsSection;
}

// ============================================================================
// Probes
// ============================================================================

function probeDemoMode(): DemoSection {
  const envVar = process.env.DEMO_MODE;
  if (envVar === "true" || envVar === "1") {
    return { enabled: true, source: "env" };
  }
  if (envVar === "false" || envVar === "0" || envVar === "") {
    return { enabled: false, source: "env" };
  }
  // No env override: read the persisted config-file state via the canonical helper.
  const enabled = isDemoModeEnabled();
  return { enabled, source: enabled ? "config" : "default" };
}

function probeDefaultFormat(): FormatSection {
  // The CLI entry point sets PAX8_CTA_DEFAULT_FORMAT based on isTTY when invoked
  // as a subprocess. If a user has set it explicitly in their shell, treat that
  // as the source.
  const envForced = process.env.PAX8_CTA_DEFAULT_FORMAT;
  if (envForced === "table" || envForced === "json") {
    // Distinguish "the CLI entry set this from isTTY" vs "user set this explicitly"
    // by checking process.stdout.isTTY against the value. If they agree, attribute
    // to TTY/piped; if they disagree, attribute to env.
    const ttyExpected = process.stdout.isTTY ? "table" : "json";
    if (envForced !== ttyExpected) {
      return { effective: envForced, source: "env" };
    }
    return { effective: envForced, source: process.stdout.isTTY ? "tty" : "piped" };
  }
  // Fallback (ran in-process / odd env): default to table.
  return { effective: "table", source: process.stdout.isTTY ? "tty" : "piped" };
}

function probeQuietMode(opts: { quiet?: boolean }): QuietSection {
  if (opts.quiet) return { enabled: true, source: "flag" };
  if (process.env.PAX8_CTA_QUIET === "1" || process.env.PAX8_CTA_QUIET === "true") {
    return { enabled: true, source: "env" };
  }
  return { enabled: false, source: null };
}

async function probeCredentials(): Promise<CredentialsSection> {
  const partnerEnv: "set" | "not-set" = process.env.PARTNER_CLIENT_SECRET ? "set" : "not-set";
  const agentsyncEnv: "set" | "not-set" = process.env.PAX8_CTA_CLIENT_SECRET ? "set" : "not-set";
  const keychain = await probeStoredSecret();

  let effectiveSource: "env" | "keychain" | "none";
  if (partnerEnv === "set" || agentsyncEnv === "set") {
    effectiveSource = "env";
  } else if (keychain === "set") {
    effectiveSource = "keychain";
  } else {
    effectiveSource = "none";
  }

  return {
    partnerClientSecretEnv: partnerEnv,
    agentsyncClientSecretEnv: agentsyncEnv,
    osKeychain: keychain,
    effectiveSource,
  };
}

function probeTelemetry(): TelemetrySection {
  return {
    enabled: isTelemetryEnabled(),
    disabledSource: getTelemetryDisabledSource(),
  };
}

async function probeTenantsConfig(configPath: string): Promise<TenantsSection> {
  const absolute = resolve(process.cwd(), configPath);
  if (!existsSync(absolute)) {
    return {
      path: absolute,
      status: "not-found",
      sourceEnvironmentUrl: null,
      total: 0,
      enabled: 0,
      disabled: 0,
    };
  }

  try {
    const cfg = await loadConfig(absolute);
    const total = cfg.tenants.length;
    const enabled = cfg.tenants.filter((t) => t.enabled).length;
    return {
      path: absolute,
      status: "found",
      sourceEnvironmentUrl: cfg.source?.environmentUrl ?? null,
      total,
      enabled,
      disabled: total - enabled,
    };
  } catch (err) {
    return {
      path: absolute,
      status: "parse-error",
      sourceEnvironmentUrl: null,
      total: 0,
      enabled: 0,
      disabled: 0,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

function probePaths(configPath: string): PathsSection {
  return {
    cliConfig: join(homedir(), ".pax8-cta", "cli-config.json"),
    telemetryConfig: getTelemetryConfigPath(),
    projectConfig: resolve(process.cwd(), configPath),
  };
}

// ============================================================================
// Renderers
// ============================================================================

function describeFormat(f: FormatSection): string {
  const sourceText =
    f.source === "tty"
      ? "TTY"
      : f.source === "piped"
        ? "piped (non-TTY)"
        : "PAX8_CTA_DEFAULT_FORMAT env";
  return `${f.effective} (${sourceText})`;
}

function describeDemo(d: DemoSection): string {
  const state = d.enabled ? chalk.green("ENABLED") : chalk.gray("DISABLED");
  const sourceText =
    d.source === "env" ? "DEMO_MODE env" : d.source === "config" ? "config file" : "default";
  return `${state} (${sourceText})`;
}

function describeQuiet(q: QuietSection): string {
  if (!q.enabled) return chalk.gray("off");
  return `${chalk.yellow("on")} (${q.source === "flag" ? "--quiet" : "PAX8_CTA_QUIET env"})`;
}

function describeKeychain(s: "set" | "not-set" | "unavailable"): string {
  if (s === "set") return chalk.green("set");
  if (s === "not-set") return chalk.gray("not set");
  return chalk.gray("unavailable");
}

function describeEffectiveCredSource(s: "env" | "keychain" | "none"): string {
  if (s === "env") return chalk.green("env");
  if (s === "keychain") return chalk.green("keychain");
  return chalk.yellow("none");
}

function describeTelemetry(t: TelemetrySection): string {
  if (t.enabled) return chalk.green("enabled");
  const reason = t.disabledSource ?? "config";
  const reasonText =
    reason === "env"
      ? "PAX8_CTA_TELEMETRY_DISABLED"
      : reason === "do-not-track"
        ? "DO_NOT_TRACK"
        : reason === "ci"
          ? "CI env"
          : reason === "no-key"
            ? "no PostHog key"
            : "config";
  return `${chalk.yellow("disabled")} (source: ${reasonText})`;
}

function describeTenantsStatus(t: TenantsSection): string {
  if (t.status === "found") {
    return chalk.green(`found (${t.total} tenants)`);
  }
  if (t.status === "not-found") {
    return chalk.yellow("not found");
  }
  return chalk.red(`parse error: ${t.parseError ?? "unknown"}`);
}

function renderHumanReadable(report: ConfigReport): void {
  console.log();
  console.log(chalk.bold("AgentSync Configuration"));
  console.log();
  console.log(`  Demo mode:       ${describeDemo(report.demoMode)}`);
  console.log(`  Default format:  ${describeFormat(report.defaultFormat)}`);
  console.log(`  Quiet mode:      ${describeQuiet(report.quietMode)}`);
  console.log();

  console.log(chalk.bold("  Credentials:"));
  console.log(
    `    PARTNER_CLIENT_SECRET (env):    ${
      report.credentials.partnerClientSecretEnv === "set"
        ? chalk.green("set")
        : chalk.gray("not set")
    }`
  );
  console.log(
    `    PAX8_CTA_CLIENT_SECRET (env):  ${
      report.credentials.pax8 - ctaClientSecretEnv === "set"
        ? chalk.green("set")
        : chalk.gray("not set")
    }`
  );
  console.log(
    `    OS keychain:                    ${describeKeychain(report.credentials.osKeychain)}`
  );
  console.log(
    `    Effective source:               ${describeEffectiveCredSource(report.credentials.effectiveSource)}`
  );
  console.log(`    Telemetry:                      ${describeTelemetry(report.telemetry)}`);
  console.log();

  console.log(chalk.bold("  Config file:"));
  console.log(`    Path:            ${report.tenantsConfig.path}`);
  console.log(`    Status:          ${describeTenantsStatus(report.tenantsConfig)}`);
  if (report.tenantsConfig.status === "found") {
    const url = report.tenantsConfig.sourceEnvironmentUrl ?? chalk.gray("not set");
    console.log(`    Source env URL:  ${url}`);
    console.log(
      `    Tenants:         ${report.tenantsConfig.total} total, ${report.tenantsConfig.enabled} enabled, ${report.tenantsConfig.disabled} disabled`
    );
  }
  console.log();

  console.log(chalk.bold("  Paths:"));
  console.log(`    CLI config:      ${report.paths.cliConfig}`);
  console.log(`    Telemetry:       ${report.paths.telemetryConfig}`);
  console.log(`    Project config:  ${report.paths.projectConfig}`);
  console.log();
}

// ============================================================================
// Command
// ============================================================================

export const configCommand = new Command("config")
  .description("Show effective CLI configuration (demo mode, credentials, telemetry, paths)")
  .option("-c, --config <path>", "Path to tenants config file", "./config/tenants.yaml")
  .option("--json", "Output as JSON")
  .option("--quiet", "Suppress all output")
  .addHelpText(
    "after",
    `
Examples:
  config                              Human-readable report of effective settings
  config --json                       Structured JSON for parsing/automation
  config --json | jq .credentials     Inspect a single section

Notes:
  Secret values are NEVER printed — only "set" / "not set" status indicators.
`
  )
  .action(async (options, cmd) => {
    try {
      const opts = { ...options, ...cmd.optsWithGlobals() };
      const fmt = resolveFormat(opts);

      const configPath: string = opts.config ?? "./config/tenants.yaml";

      const [credentials, tenantsConfig] = await Promise.all([
        probeCredentials(),
        probeTenantsConfig(configPath),
      ]);

      const report: ConfigReport = {
        demoMode: probeDemoMode(),
        defaultFormat: probeDefaultFormat(),
        quietMode: probeQuietMode(opts),
        credentials,
        telemetry: probeTelemetry(),
        tenantsConfig,
        paths: probePaths(configPath),
      };

      if (fmt === "quiet") return;
      if (fmt === "json") {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      // table is the only remaining sensible format here; --ids-only is not
      // meaningful for a single configuration record, so we render the human
      // report for both "table" and any unexpected fallback.
      renderHumanReadable(report);
    } catch (error) {
      handleCommandError(error, null, "Failed to gather configuration");
    }
  });
