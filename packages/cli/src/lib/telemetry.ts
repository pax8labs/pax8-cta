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
 * How we distinguish users:
 * - Events are attributed to a stable distinct ID derived one-way (SHA-256)
 *   from the authenticated partner credentials the CLI operates as (Azure AD
 *   tenant + app client IDs). The raw IDs never leave the machine — only their
 *   digest is sent — so per-user analytics work without transmitting any
 *   identifying config value. Runs with no resolvable identity fall back to an
 *   anonymous, per-machine random ID persisted on first run.
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
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveTelemetryKey, TELEMETRY_APP } from "./telemetry-key.js";
import { isDemoModeEnabled } from "../commands/demo.js";

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
    credentialed_status: getCredentialedStatus(),
  };
}

// ============================================================================
// Credentialed status (issue #450)
// ============================================================================

/**
 * Coarse, anonymous classification of the user's setup state, reported as a
 * property on every telemetry event so PostHog funnel analysis can show the
 * demo → configured conversion path without any PII.
 *
 *   "demo"         — DEMO_MODE env var or persistent `demo on` flag is active.
 *   "unconfigured" — no client secret and no tenants.yaml at default path.
 *   "partial"      — secret OR tenants.yaml present, but not both.
 *   "configured"   — both present (real config, ready to validate/deploy).
 *
 * Categorical only. We never read the secret value, the file contents, or any
 * config field — only the presence/absence of two signals. See issue #450.
 */
export type CredentialedStatus = "demo" | "unconfigured" | "partial" | "configured";

const CLIENT_SECRET_ENV_VARS = ["PARTNER_CLIENT_SECRET", "PAX8_CTA_CLIENT_SECRET"] as const;
const DEFAULT_CONFIG_PATH = "config/tenants.yaml";

let cachedCredentialedStatus: CredentialedStatus | null = null;

/**
 * Resolve credentialed status, cached for the process lifetime. Setup state
 * doesn't meaningfully change inside a single CLI invocation and a per-event
 * `existsSync` on every captured event would be unnecessary work.
 */
export function getCredentialedStatus(): CredentialedStatus {
  if (cachedCredentialedStatus) return cachedCredentialedStatus;
  if (isDemoModeEnabled()) {
    cachedCredentialedStatus = "demo";
    return cachedCredentialedStatus;
  }
  const hasSecret = CLIENT_SECRET_ENV_VARS.some((k) => Boolean(process.env[k]));
  const hasConfig = existsSync(resolve(process.cwd(), DEFAULT_CONFIG_PATH));
  if (hasSecret && hasConfig) cachedCredentialedStatus = "configured";
  else if (hasSecret || hasConfig) cachedCredentialedStatus = "partial";
  else cachedCredentialedStatus = "unconfigured";
  return cachedCredentialedStatus;
}

/** Test-only: invalidate the per-process cache so a new resolution can run. */
export function resetCredentialedStatusCacheForTests(): void {
  cachedCredentialedStatus = null;
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
// User Identity
// ============================================================================

/**
 * The authenticated identity the CLI is operating as. Sourced from the loaded
 * partner config (Azure AD tenant + app registration client IDs). Both are
 * GUIDs; neither is transmitted — they are only hashed to derive a distinct ID.
 */
export interface AuthenticatedIdentity {
  tenantId?: string;
  clientId?: string;
}

/**
 * Distinct ID resolved from an authenticated identity this process, if any.
 * Cached because the identity can't change within a single CLI invocation.
 */
let resolvedDistinctId: string | null = null;
/**
 * Account-group key for the resolved identity, if credentialed this run (a
 * salted hash of the partner clientId — see {@link accountGroupKey}). Null for
 * uncredentialed/demo runs, which attach no group. Populated alongside
 * {@link resolvedDistinctId} in {@link identifyUser}.
 */
let resolvedAccountKey: string | null = null;
/** Ensures at most one PostHog `identify` is emitted per process. */
let identifySent = false;
/** Ensures the best-effort auto-resolution runs at most once per process. */
let autoResolveAttempted = false;

/**
 * Derive a stable, one-way distinct ID from an authenticated identity.
 *
 * Two runs configured as the same partner app hash to the same ID; different
 * operators hash differently. Returns `null` when there isn't enough of an
 * identity to attribute events to a specific user (so the caller can fall back
 * to the anonymous machine ID).
 */
function deriveDistinctId(identity: AuthenticatedIdentity): string | null {
  const clientId = identity.clientId?.trim();
  const tenantId = identity.tenantId?.trim();
  if (!clientId && !tenantId) return null;
  return createHash("sha256")
    .update(`pax8-cta-user:${tenantId ?? ""}:${clientId ?? ""}`)
    .digest("hex")
    .substring(0, 32);
}

/**
 * Domain-separation salt for the account-group key. NOT a secret — the CLI is
 * open source; it only stops the key from being a bare `sha256(clientId)` that
 * an unrelated system could trivially recompute and correlate. App-scoped
 * ("pax8-cta") so a partner is a distinct account entity here versus other
 * Pax8 CLIs (e.g. `@pax8/cli`, which salts with "pax8-cli:account:v1").
 */
const ACCOUNT_GROUP_SALT = "pax8-cta:account:v1";

/**
 * Derive the PostHog `account` group key from the partner's OAuth clientId: a
 * salted one-way hash that is identical across every machine and CI job for a
 * given partner. This lets PostHog report account-level unique counts and
 * retention without touching the per-user {@link resolvedDistinctId}. The salt
 * is a public domain-separation constant, so the key is a pseudonym, not an
 * anonymization guarantee.
 */
export function accountGroupKey(clientId: string): string {
  return createHash("sha256").update(`${ACCOUNT_GROUP_SALT}${clientId}`).digest("hex");
}

/** The account group to tag events with, or undefined for uncredentialed runs. */
function accountGroups(): { account: string } | undefined {
  return resolvedAccountKey ? { account: resolvedAccountKey } : undefined;
}

/** Emit the one-time PostHog `identify` for the currently resolved user. */
async function emitIdentify(): Promise<void> {
  if (identifySent || !resolvedDistinctId) return;
  // Claim the emit synchronously, before the first await. identifyUser fires
  // this fire-and-forget while ensureIdentified also awaits it, so without an
  // atomic guard both callers slip past the check above and double-send the
  // identify + groupIdentify. Reset on a missing client so a later call retries.
  identifySent = true;
  const posthog = await getClient();
  if (!posthog) {
    identifySent = false;
    return;
  }
  posthog.identify({
    distinctId: resolvedDistinctId,
    // Only non-identifying properties — see the privacy note at the top.
    properties: commonProperties(),
  });
  // Register the partner-account group once (if credentialed this run) so
  // PostHog reports real account-level unique counts instead of one "user" per
  // ephemeral install. Only the salted clientId hash leaves the machine; every
  // captured event also carries `groups.account` via accountGroups().
  if (resolvedAccountKey) {
    posthog.groupIdentify({
      groupType: "account",
      groupKey: resolvedAccountKey,
      properties: commonProperties(),
    });
  }
}

/**
 * Associate all subsequent telemetry with the authenticated user.
 *
 * Commands call this as soon as they have loaded the partner credentials they
 * will operate as (see `command-wrapper`). It switches the distinct ID away
 * from the anonymous per-machine fallback to a stable hash of the identity and
 * emits a PostHog `identify` so the person is created/updated server-side.
 * Without it, every execution collapses onto one machine ID and PostHog reports
 * a single user for the whole fleet.
 *
 * Safe to call repeatedly, before telemetry is enabled, and with a partial
 * identity: it no-ops when telemetry is off or no identity can be derived, and
 * only the first successful call emits `identify`.
 */
export function identifyUser(identity: AuthenticatedIdentity): void {
  if (!isTelemetryEnabled()) return;
  const distinctId = deriveDistinctId(identity);
  if (!distinctId) return;
  resolvedDistinctId = distinctId;
  // Attribute credentialed runs to a partner-account group, keyed on the
  // clientId alone (stable across machines). A tenant-only identity resolves a
  // distinct ID but no account group, matching the clientId-based convention.
  const clientId = identity.clientId?.trim();
  resolvedAccountKey = clientId ? accountGroupKey(clientId) : null;
  void emitIdentify();
}

/**
 * Best-effort resolution of the authenticated identity for commands that never
 * call {@link identifyUser} explicitly. Tries the environment first (covers
 * CI / env-configured runs), then the default config file. Runs once; on
 * failure the anonymous machine ID remains the distinct ID.
 */
async function ensureIdentified(): Promise<void> {
  if (resolvedDistinctId || autoResolveAttempted) return;
  autoResolveAttempted = true;

  // 1. Environment variables (also how loadConfig sources partner overrides).
  if (
    deriveDistinctId({
      tenantId: process.env.PARTNER_TENANT_ID,
      clientId: process.env.PARTNER_CLIENT_ID,
    })
  ) {
    identifyUser({
      tenantId: process.env.PARTNER_TENANT_ID,
      clientId: process.env.PARTNER_CLIENT_ID,
    });
    await emitIdentify();
    return;
  }

  // 2. Default config file. Best-effort: loadConfig validates and may throw for
  //    an absent/invalid file — that just means "no identity", not an error.
  try {
    const { loadConfig } = await import("@pax8/cta-core");
    const config = await loadConfig(resolve(process.cwd(), DEFAULT_CONFIG_PATH));
    identifyUser({ tenantId: config.partner?.tenantId, clientId: config.partner?.clientId });
    await emitIdentify();
  } catch {
    // No resolvable identity — fall back to the anonymous machine ID.
  }
}

/**
 * The distinct ID to attribute an event to: the authenticated user when known,
 * otherwise the anonymous per-machine fallback.
 */
function getDistinctId(): string {
  return resolvedDistinctId ?? getMachineId();
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
      await ensureIdentified();

      posthog.capture({
        distinctId: getDistinctId(),
        event: "cli_command",
        groups: accountGroups(),
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
      await ensureIdentified();

      // Don't track the actual query value for privacy - just the resource type
      posthog.capture({
        distinctId: getDistinctId(),
        event: "cli_not_found",
        groups: accountGroups(),
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
      await ensureIdentified();

      posthog.capture({
        distinctId: getDistinctId(),
        event: "cli_error",
        groups: accountGroups(),
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
      await ensureIdentified();

      posthog.capture({
        distinctId: getDistinctId(),
        event: "cli_first_run",
        groups: accountGroups(),
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
 * Get the first run notice text.
 *
 * Combines a quick-start hint (closes #447 — pnpm 10 default settings block
 * the npm postinstall banner, so the install-time welcome doesn't fire for
 * `pnpm add` users or for users running the prebuilt standalone binaries;
 * routing the welcome through this first-run code path covers every install
 * surface) with the telemetry opt-in disclosure.
 */
export function getFirstRunNotice(): string {
  return `
┌────────────────────────────────────────────────────────────────────────────┐
│  ✓ Welcome to Pax8 CTA!                                                   │
│                                                                           │
│  Quick start:                                                             │
│  • pax8-cta demo on       — try it with mock data, no credentials needed  │
│  • pax8-cta init          — initialize real config and authenticate       │
│  • pax8-cta --help        — show all commands                             │
│                                                                           │
│  Pax8 CTA CLI can collect anonymous usage data to help improve the tool.  │
│  Telemetry is disabled by default. To opt in:                             │
│  • Run 'telemetry on'                                                     │
│  • Learn more: github.com/pax8labs/pax8-cta/tree/main/packages/cli         │
└────────────────────────────────────────────────────────────────────────────┘
`;
}
