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
 * Collects anonymous usage data to help improve AgentSync CLI.
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
 * - Run: agentsync telemetry off
 * - Or set: AGENTSYNC_TELEMETRY_DISABLED=1
 * - Or set: DO_NOT_TRACK=1 (https://consoledonottrack.com)
 *
 * More info: https://github.com/pax8labs/agentsync/tree/main/packages/cli#telemetry
 */

import { PostHog } from "posthog-node";
import Conf from "conf";
import { createHash } from "crypto";
import { hostname } from "os";

// ============================================================================
// Configuration
// ============================================================================

const CLI_VERSION = "0.1.0";

// PostHog project key - safe to be public, only allows event ingestion
const POSTHOG_KEY = process.env.AGENTSYNC_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.AGENTSYNC_POSTHOG_HOST || "https://us.i.posthog.com";

// Config store for telemetry preferences
const config = new Conf<{
  telemetryEnabled: boolean;
  firstRunShown: boolean;
  machineId: string;
}>({
  projectName: "agentsync-cli",
  defaults: {
    telemetryEnabled: false, // Opt-in: disabled by default, enable with `agentsync telemetry on`
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
    process.env.AGENTSYNC_TELEMETRY_DISABLED === "1" ||
    process.env.AGENTSYNC_TELEMETRY_DISABLED === "true"
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
  return config.get("telemetryEnabled");
}

/**
 * Enable telemetry
 */
export function enableTelemetry(): void {
  config.set("telemetryEnabled", true);
}

/**
 * Disable telemetry
 */
export function disableTelemetry(): void {
  config.set("telemetryEnabled", false);
}

/**
 * Check if first run notice has been shown
 */
export function hasShownFirstRunNotice(): boolean {
  return config.get("firstRunShown");
}

/**
 * Mark first run notice as shown
 */
export function markFirstRunNoticeShown(): void {
  config.set("firstRunShown", true);
}

// ============================================================================
// PostHog Client
// ============================================================================

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!isTelemetryEnabled()) {
    return null;
  }

  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 10,
      flushInterval: 30000, // 30 seconds
    });
  }

  return client;
}

/**
 * Shutdown telemetry client gracefully
 */
export async function shutdownTelemetry(): Promise<void> {
  try {
    if (client) {
      await client.shutdown();
      client = null;
    }
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
  try {
    const posthog = getClient();
    if (!posthog) return;

    posthog.capture({
      distinctId: getMachineId(),
      event: "cli_command",
      properties: {
        command: ctx.command,
        subcommand: ctx.subcommand,
        flags: ctx.flags,
        success: ctx.success,
        duration_ms: ctx.durationMs,
        error_type: ctx.errorType,
        demo_mode: ctx.demoMode,
        cli_version: CLI_VERSION,
        os: process.platform,
        node_version: process.version,
      },
    });
  } catch {
    // Telemetry should never affect CLI functionality
  }
}

/**
 * Track a "not found" error (like a 404)
 */
export function trackNotFound(
  resource: "tenant" | "deployment" | "agent" | "command",
  query: string
): void {
  try {
    const posthog = getClient();
    if (!posthog) return;

    // Don't track the actual query value for privacy - just the resource type
    posthog.capture({
      distinctId: getMachineId(),
      event: "cli_not_found",
      properties: {
        resource_type: resource,
        // Hash the query so we can see patterns without seeing actual values
        query_hash: createHash("sha256").update(query).digest("hex").substring(0, 8),
        cli_version: CLI_VERSION,
        os: process.platform,
      },
    });
  } catch {
    // Telemetry should never affect CLI functionality
  }
}

/**
 * Track an error (without sensitive details)
 */
export function trackError(errorType: string, command?: string): void {
  try {
    const posthog = getClient();
    if (!posthog) return;

    posthog.capture({
      distinctId: getMachineId(),
      event: "cli_error",
      properties: {
        error_type: errorType,
        command,
        cli_version: CLI_VERSION,
        os: process.platform,
      },
    });
  } catch {
    // Telemetry should never affect CLI functionality
  }
}

/**
 * Track first run
 */
export function trackFirstRun(): void {
  try {
    const posthog = getClient();
    if (!posthog) return;

    posthog.capture({
      distinctId: getMachineId(),
      event: "cli_first_run",
      properties: {
        cli_version: CLI_VERSION,
        os: process.platform,
        node_version: process.version,
      },
    });
  } catch {
    // Telemetry should never affect CLI functionality
  }
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
│  AgentSync CLI can collect anonymous usage data to help improve the tool.  │
│                                                                           │
│  Telemetry is disabled by default. To opt in:                             │
│  • Run 'agentsync telemetry on'                                           │
│  • Learn more: github.com/pax8labs/agentsync/tree/main/packages/cli       │
└────────────────────────────────────────────────────────────────────────────┘
`;
}
