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
 * CLI Telemetry Module
 *
 * Collects anonymous usage data to help improve Pax8 CTA CLI.
 *
 * What we track:
 * - Command name (e.g., "deploy", "fleet list")
 * - Success/failure status
 * - Execution duration
 * - CLI version
 * - OS platform
 * - Error types (not messages or stack traces)
 *
 * What we NEVER track:
 * - Tenant IDs, names, or any tenant data
 * - Solution names or file paths
 * - Configuration values
 * - Any personally identifiable information
 * - IP addresses (PostHog configured to anonymize)
 *
 * Opt-out:
 * - Run: pax8-cta telemetry off
 * - Or set: PAX8_CTA_TELEMETRY_DISABLED=1
 * - Or set: DO_NOT_TRACK=1 (https://consoledonottrack.com)
 *
 * More info: https://github.com/pax8labs/pax8-cta/tree/main/packages/cli#telemetry
 */

import type { PostHog } from "posthog-node";
import Conf from "conf";
import { createHash } from "crypto";
import { hostname } from "os";
import { resolveTelemetryKey, TELEMETRY_APP } from "./telemetry-key.js";

// ============================================================================
// Configuration
// ============================================================================

const CLI_VERSION = "0.1.0";

// PostHog project key - safe to be public, only allows event ingestion.
// Resolved at module-load time so process.env mutations after this point
// are not picked up (tests use vi.resetModules() to pick up overrides).
const POSTHOG_KEY = resolveTelemetryKey();
const POSTHOG_HOST = process.env.PAX8_CTA_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Properties attached to every captured event. The `app` tag lets the
 * shared Pax8 PostHog project distinguish CTA events from any other
 * Pax8 CLI (e.g. `@pax8/cli`, which tags its events with `app: "pax8-cli"`).
 */
function commonProperties(): Record<string, string> {
  return {
    app: TELEMETRY_APP,
    cli_version: CLI_VERSION,
    os: process.platform,
    node_version: process.version,
  };
}

// Config store for telemetry preferences
const config = new Conf<{
  telemetryEnabled: boolean;
  firstRunShown: boolean;
  machineId: string;
}>({
  projectName: "pax8-cta-cli",
  defaults: {
    telemetryEnabled: false, // Opt-in: disabled by default, enable with `pax8-cta telemetry on`
    firstRunShown: false,
    machineId: "",
  },
});

// ============================================================================
// Machine ID (anonymous)
// ============================================================================

/**
 * Get or create an anonymous machine ID.
 * This is a one-way hash - cannot be reversed to identify the machine.
 */
function getMachineId(): string {
  let machineId = config.get("machineId");

  if (!machineId) {
    // Create anonymous hash from hostname + random salt
    const salt = Math.random().toString(36).substring(2);
    const raw = `${hostname()}-${salt}-${Date.now()}`;
    machineId = createHash("sha256").update(raw).digest("hex").substring(0, 16);
    config.set("machineId", machineId);
  }

  return machineId;
}

// ============================================================================
// Telemetry State
// ============================================================================

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
  // Environment variable override (highest priority)
  if (
    process.env.PAX8_CTA_TELEMETRY_DISABLED === "1" ||
    process.env.PAX8_CTA_TELEMETRY_DISABLED === "true"
  ) {
    return false;
  }

  // Respect DO_NOT_TRACK convention (https://consoledonottrack.com)
  if (process.env.DO_NOT_TRACK === "1") {
    return false;
  }

  // CI environments - disable by default
  if (process.env.CI === "true" || process.env.CI === "1") {
    return false;
  }

  // No PostHog key configured
  if (!POSTHOG_KEY) {
    return false;
  }

  // User preference
  try {
    return config.get("telemetryEnabled");
  } catch {
    return false;
  }
}

/**
 * Enable telemetry
 */
export function enableTelemetry(): void {
  try {
    config.set("telemetryEnabled", true);
  } catch {
    // Non-fatal: telemetry preference persistence should not break CLI.
  }
}

/**
 * Disable telemetry
 */
export function disableTelemetry(): void {
  try {
    config.set("telemetryEnabled", false);
  } catch {
    // Non-fatal: telemetry preference persistence should not break CLI.
  }
}

/**
 * Check if first run notice has been shown
 */
export function hasShownFirstRunNotice(): boolean {
  try {
    return config.get("firstRunShown");
  } catch {
    return true;
  }
}

/**
 * Mark first run notice as shown
 */
export function markFirstRunNoticeShown(): void {
  try {
    config.set("firstRunShown", true);
  } catch {
    // Non-fatal: telemetry preference persistence should not break CLI.
  }
}

/**
 * Filesystem path to the Conf-managed telemetry preferences file.
 * Used by `pax8-cta config` to surface where preferences live.
 */
export function getTelemetryConfigPath(): string {
  return config.path;
}

/**
 * Stored telemetry preference (ignores env-var overrides).
 *
 * `isTelemetryEnabled()` factors in env-var opt-outs (DO_NOT_TRACK,
 * PAX8_CTA_TELEMETRY_DISABLED, CI, missing PostHog key). This raw getter
 * lets `config` distinguish a user's saved choice from a runtime override.
 */
export function getStoredTelemetryPreference(): boolean {
  try {
    return config.get("telemetryEnabled");
  } catch {
    return false;
  }
}

/**
 * Reason telemetry is currently disabled, if it is.
 *
 * Mirrors the precedence inside `isTelemetryEnabled()`:
 *   1. PAX8_CTA_TELEMETRY_DISABLED env var
 *   2. DO_NOT_TRACK env var
 *   3. CI env var
 *   4. Missing PostHog key
 *   5. User preference (config file)
 *
 * Returns `null` when telemetry is enabled.
 */
export function getTelemetryDisabledSource():
  | "env"
  | "do-not-track"
  | "ci"
  | "no-key"
  | "config"
  | null {
  if (
    process.env.PAX8_CTA_TELEMETRY_DISABLED === "1" ||
    process.env.PAX8_CTA_TELEMETRY_DISABLED === "true"
  ) {
    return "env";
  }
  if (process.env.DO_NOT_TRACK === "1") return "do-not-track";
  if (process.env.CI === "true" || process.env.CI === "1") return "ci";
  if (!POSTHOG_KEY) return "no-key";
  if (!getStoredTelemetryPreference()) return "config";
  return null;
}

// ============================================================================
// PostHog Client
// ============================================================================

let client: PostHog | null = null;
let clientPromise: Promise<PostHog | null> | null = null;

async function getClient(): Promise<PostHog | null> {
  if (!isTelemetryEnabled()) {
    return null;
  }

  if (client) {
    return client;
  }

  // De-duplicate concurrent initializations
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        // Lazy-load posthog-node so the dependency isn't pulled into
        // every cold start (telemetry is opt-in; most invocations skip this).
        const mod = await import("posthog-node");
        const PostHogCtor = mod.PostHog;
        client = new PostHogCtor(POSTHOG_KEY, {
          host: POSTHOG_HOST,
          // The CLI exits in <1s after a command, so we cannot rely on the
          // default batching (flush every 10 events or 30s) — events would
          // be lost. flushAt: 1 starts the HTTP request immediately after
          // each capture. The caller is still responsible for awaiting
          // shutdownTelemetry() before process exit to let the in-flight
          // request finish.
          flushAt: 1,
          flushInterval: 5000,
        });
        return client;
      } catch {
        // posthog-node may not be installed (e.g. trimmed bundle).
        // Telemetry should silently no-op rather than break the CLI.
        return null;
      }
    })();
  }

  return clientPromise;
}

/**
 * Shutdown telemetry client gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  try {
    // If a client init is still in flight, wait for it so we can flush.
    if (clientPromise) {
      await clientPromise;
    }
    if (client) {
      await client.shutdown();
      client = null;
    }
    clientPromise = null;
  } catch {
    // Telemetry should never affect CLI functionality
  }
}

// ============================================================================
// Event Tracking
// ============================================================================

export type TelemetryEvent = "cli_command" | "cli_error" | "cli_not_found" | "cli_first_run";

export interface CommandContext {
  command: string;
  subcommand?: string;
  flags?: string[];
  success: boolean;
  durationMs: number;
  errorType?: string;
  demoMode?: boolean;
}

/**
 * Track a CLI command execution
 */
export function trackCommand(ctx: CommandContext): void {
  // Fast-path: avoid even kicking off the dynamic import if telemetry is off.
  if (!isTelemetryEnabled()) return;

  void (async () => {
    try {
      const posthog = await getClient();
      if (!posthog) return;

      posthog.capture({
        distinctId: getMachineId(),
        event: "cli_command",
        properties: {
          ...commonProperties(),
          command: ctx.command,
          subcommand: ctx.subcommand,
          flags: ctx.flags,
          success: ctx.success,
          duration_ms: ctx.durationMs,
          error_type: ctx.errorType,
          demo_mode: ctx.demoMode,
        },
      });
    } catch {
      // Telemetry should never affect CLI functionality
    }
  })();
}

/**
 * Track a "not found" error (like a 404)
 */
export function trackNotFound(
  resource: "tenant" | "deployment" | "agent" | "command",
  query: string
): void {
  if (!isTelemetryEnabled()) return;

  // Hash the query synchronously so we don't hold a reference to the raw value.
  const queryHash = createHash("sha256").update(query).digest("hex").substring(0, 8);

  void (async () => {
    try {
      const posthog = await getClient();
      if (!posthog) return;

      // Don't track the actual query value for privacy - just the resource type
      posthog.capture({
        distinctId: getMachineId(),
        event: "cli_not_found",
        properties: {
          ...commonProperties(),
          resource_type: resource,
          query_hash: queryHash,
        },
      });
    } catch {
      // Telemetry should never affect CLI functionality
    }
  })();
}

/**
 * Track an error (without sensitive details)
 */
export function trackError(errorType: string, command?: string): void {
  if (!isTelemetryEnabled()) return;

  void (async () => {
    try {
      const posthog = await getClient();
      if (!posthog) return;

      posthog.capture({
        distinctId: getMachineId(),
        event: "cli_error",
        properties: {
          ...commonProperties(),
          error_type: errorType,
          command,
        },
      });
    } catch {
      // Telemetry should never affect CLI functionality
    }
  })();
}

/**
 * Track first run
 */
export function trackFirstRun(): void {
  if (!isTelemetryEnabled()) return;

  void (async () => {
    try {
      const posthog = await getClient();
      if (!posthog) return;

      posthog.capture({
        distinctId: getMachineId(),
        event: "cli_first_run",
        properties: {
          ...commonProperties(),
        },
      });
    } catch {
      // Telemetry should never affect CLI functionality
    }
  })();
}

// ============================================================================
// First Run Notice
// ============================================================================

/**
 * Get the first run notice text
 */
export function getFirstRunNotice(): string {
  return `
┌────────────────────────────────────────────────────────────────────────────┐
│  Pax8 CTA CLI can collect anonymous usage data to help improve the tool.  │
│                                                                           │
│  Telemetry is disabled by default. To opt in:                             │
│  • Run 'telemetry on'                                                     │
│  • Learn more: github.com/pax8labs/pax8-cta/tree/main/packages/cli       │
└────────────────────────────────────────────────────────────────────────────┘
`;
}
