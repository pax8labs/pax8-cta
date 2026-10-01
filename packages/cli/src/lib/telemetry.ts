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
 * Collection is on by default and disclosed on first run. Opt out with any of:
 * - Run: pax8-cta telemetry off
 * - Or set: PAX8_CTA_TELEMETRY_DISABLED=1
 * - Or set: DO_NOT_TRACK=1 (https://consoledonottrack.com)
 *
 * CI environments (CI=true) are excluded automatically, without opting out.
 *
 * More info: https://github.com/pax8labs/pax8-cta/tree/main/packages/cli#telemetry
 */

import type { PostHog } from "posthog-node";
import Conf from "conf";
import { createHash } from "crypto";
import { hostname } from "os";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pkgJson from "../../package.json" with { type: "json" };
import { resolveTelemetryKey, TELEMETRY_APP } from "./telemetry-key.js";
import { isDemoModeEnabled } from "../commands/demo.js";

// ============================================================================
// Configuration
// ============================================================================

// Read from package.json rather than a hand-maintained constant. The literal
// that used to live here said "0.1.0" for every release from 0.1.1 onward, so
// every event PostHog received claimed to come from 0.1.0 and no dashboard
// could segment by version or spot a regression landing in a specific release.
const CLI_VERSION = (pkgJson as { version: string }).version;

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
    // Opt-out for a *fresh* install: enabled unless the user opts out.
    //
    // This does not reach an existing install. `conf` writes its `defaults`
    // into the config file the first time the store is constructed, so any
    // machine that ran the opt-in build already has a literal
    // `"telemetryEnabled": false` on disk, and a stored value beats a default.
    // That is deliberate and left alone: on disk, a user who ran
    // `telemetry off` and a user who never chose are byte-identical, so no
    // migration can flip the latter without silently reversing the former.
    telemetryEnabled: true,
    firstRunShown: false,
    machineId: "",
  },
});

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
 * Check if telemetry is enabled.
 *
 * Note the lifecycle coupling: this returns `false` while a disclosure is owed,
 * and `index.ts` is what discharges that by showing the notice and calling
 * `markFirstRunNoticeShown()`. Any caller reached from a different entry point - a
 * background task, an alternate binary, an embedding of this package - that
 * runs before that path will see `false` simply because the notice has not been
 * shown yet, not because the user opted out. Use `getTelemetryDisabledSource()`
 * to tell the two apart; it reports `"pending-notice"` for this case.
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

  // Disclosure owed but not yet shown. A fresh install collects nothing until
  // the first-run notice has actually been displayed, so no one is measured
  // before being told - including someone who only ever runs with --quiet.
  if (!hasShownFirstRunNotice()) {
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
 * Mark the first-run notice as shown.
 *
 * Also ungates collection: `isTelemetryEnabled()` stays false until this is
 * recorded, so a fresh install sends nothing before the user has been told.
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
 *   5. Disclosure owed but not yet shown
 *   6. User preference (config file)
 *
 * Returns `null` when telemetry is enabled.
 */
export function getTelemetryDisabledSource():
  | "env"
  | "do-not-track"
  | "ci"
  | "no-key"
  | "pending-notice"
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
  if (!hasShownFirstRunNotice()) return "pending-notice";
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
        // every cold start (opted-out runs never reach this point).
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
 * Captures that have been requested but have not yet reached `posthog.capture()`.
 *
 * Every track* function is fire-and-forget and does real async work before it
 * can capture: a dynamic `import("posthog-node")`, then `ensureIdentified()`,
 * which itself dynamically imports and reads the tenants config. Shutdown used
 * to await only the *client* promise, so it regularly won — it called
 * `client.shutdown()` and the entry point called `process.exit()` while the
 * capture was still several awaits away, and the event was simply never sent.
 *
 * Successful one-shot runs mostly survived this by luck (nothing calls
 * `process.exit()` on that path, so Node stayed alive for the in-flight HTTP
 * request), which is why failures and REPL sessions went dark while successes
 * kept trickling in. Registering the work here makes the flush deterministic.
 */
const pendingCaptures = new Set<Promise<void>>();

/**
 * Run a fire-and-forget telemetry task, tracked so {@link shutdownTelemetry}
 * can wait for it. Never rejects — telemetry must not affect CLI behaviour.
 */
function schedule(task: () => Promise<void>): void {
  const promise = task().catch(() => {
    // Telemetry should never affect CLI functionality
  });
  pendingCaptures.add(promise);
  void promise.finally(() => pendingCaptures.delete(promise));
}

/**
 * Upper bound on how long shutdown waits for in-flight captures. Telemetry
 * must never be the reason a CLI invocation feels slow, so a wedged import or
 * a hung config read costs at most this much before we give up and exit.
 */
const SHUTDOWN_DRAIN_MS = 2000;

/**
 * Shutdown telemetry client gracefully.
 *
 * Drains queued captures first, then flushes the PostHog client. Callers must
 * await this before `process.exit()`.
 */
export async function shutdownTelemetry(): Promise<void> {
  try {
    // If a client init is still in flight, wait for it so we can flush.
    if (clientPromise) {
      await clientPromise;
    }

    // Let every requested capture actually reach posthog.capture() before we
    // flush, bounded so a stuck task can't hang the CLI.
    if (pendingCaptures.size > 0) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...pendingCaptures]),
        new Promise((r) => {
          timer = setTimeout(r, SHUTDOWN_DRAIN_MS);
          // Don't hold the event loop open purely for the drain timeout.
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);
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

  // 2. Default config file.
  //
  //    This deliberately does NOT go through `loadConfig`. That function
  //    validates the *whole* config against the deploy schema, so a file with
  //    a valid `partner:` block but a missing `source:` section (or any other
  //    unrelated validation miss) threw — and the catch below quietly demoted
  //    the run to the anonymous machine ID with no `identify` ever emitted.
  //    Attribution shouldn't require the config to be deploy-ready; scrape the
  //    two partner GUIDs directly and tolerate anything else being wrong.
  try {
    const identity = readPartnerIdentityFromConfig(resolve(process.cwd(), DEFAULT_CONFIG_PATH));
    if (identity) {
      identifyUser(identity);
      await emitIdentify();
    }
  } catch {
    // No resolvable identity — fall back to the anonymous machine ID.
  }
}

/**
 * Pull `partner.tenantId` / `partner.clientId` out of the tenants config
 * without validating the rest of the document.
 *
 * Intentionally a narrow line scanner rather than a YAML parse: it needs only
 * two scalars from a known top-level block, must never throw on a malformed
 * document, and avoids pulling a YAML parser into the telemetry path. Returns
 * `null` when the file is absent or has no usable partner identity.
 */
function readPartnerIdentityFromConfig(path: string): AuthenticatedIdentity | null {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  const identity: AuthenticatedIdentity = {};
  let inPartner = false;
  for (const line of lines) {
    if (/^\S/.test(line)) {
      // A new top-level key ends the partner block.
      inPartner = /^partner\s*:/.test(line);
      continue;
    }
    if (!inPartner) continue;
    const match = /^\s+(tenantId|clientId)\s*:\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2]!.replace(/^["']|["']$/g, "").replace(/\s+#.*$/, "");
    if (value) identity[match[1] as "tenantId" | "clientId"] = value;
  }
  return identity.tenantId || identity.clientId ? identity : null;
}

/**
 * Resolve and register the user identity at CLI startup.
 *
 * Called once from the entry point before any command runs, so that PostHog
 * receives an `identify` (and the partner `account` group) even for runs that
 * never load partner credentials — `demo`, `--help`, `telemetry`, `config`,
 * REPL sessions. Without this, those runs all reported the per-machine
 * anonymous ID and PostHog's unique-user counts collapsed onto it.
 *
 * Fire-and-forget by design: never awaited on the hot path, never throws.
 */
export function initTelemetryIdentity(): void {
  if (!isTelemetryEnabled()) return;
  void ensureIdentified().catch(() => {
    // Telemetry should never affect CLI functionality
  });
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

/**
 * `command_executed` is the canonical per-invocation event name across the Pax8
 * CLI portfolio — `@pax8/cli` emits it too, and every shared PostHog insight,
 * funnel and alert filters on it. CTA previously emitted `cli_command`, which
 * meant none of those dashboards ever saw a single CTA run. Keep this string
 * identical to `@pax8/cli`'s; the `app` property is what separates the two
 * products, not the event name.
 */
export const COMMAND_EVENT = "command_executed";

export type TelemetryEvent = typeof COMMAND_EVENT | "cli_error" | "cli_not_found" | "cli_first_run";

export interface CommandContext {
  /** Root command, e.g. "tenants". */
  command: string;
  /** Full dotted command path, e.g. "tenants.list". Matches `@pax8/cli`. */
  subcommand?: string;
  flags?: string[];
  success: boolean;
  durationMs: number;
  /**
   * Machine-readable failure code, e.g. "ERROR_USAGE" / "ERROR_VALIDATION".
   * Named to match `@pax8/cli`'s `error_code` property (CTA previously sent
   * this as `error_type`, so cross-product failure breakdowns saw nothing).
   * Omitted on success.
   */
  errorCode?: string;
  demoMode?: boolean;
}

/**
 * Track a CLI command execution.
 *
 * Emits the portfolio-canonical `command_executed` event with the property set
 * `@pax8/cli` uses: app, command, subcommand, success, error_code, duration_ms,
 * cli_version, node_version, os, demo_mode (plus CTA's own `flags` and
 * `credentialed_status`).
 */
export function trackCommand(ctx: CommandContext): void {
  // Fast-path: avoid even kicking off the dynamic import if telemetry is off.
  if (!isTelemetryEnabled()) return;

  schedule(async () => {
    const posthog = await getClient();
    if (!posthog) return;
    await ensureIdentified();

    posthog.capture({
      distinctId: getDistinctId(),
      event: COMMAND_EVENT,
      groups: accountGroups(),
      properties: {
        ...commonProperties(),
        command: ctx.command,
        subcommand: ctx.subcommand,
        flags: ctx.flags,
        success: ctx.success,
        duration_ms: ctx.durationMs,
        // Only present on failures, matching @pax8/cli's contract.
        error_code: ctx.errorCode,
        // Always a boolean. This used to be `process.env.DEMO_MODE === "true"`
        // read at the call site, which reported `false` for anyone who had
        // turned demo on persistently via `pax8-cta demo on`.
        demo_mode: ctx.demoMode ?? isDemoModeEnabled(),
      },
    });
  });
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

  schedule(async () => {
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
  });
}

/**
 * Track an error (without sensitive details)
 */
export function trackError(errorType: string, command?: string): void {
  if (!isTelemetryEnabled()) return;

  schedule(async () => {
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
  });
}

/**
 * Track first run
 */
export function trackFirstRun(): void {
  if (!isTelemetryEnabled()) return;

  schedule(async () => {
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
  });
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
 * surface) with the telemetry disclosure.
 *
 * Because collection now defaults to on, this notice is the point at which the
 * user is told it is happening, so it states that plainly and puts the opt-out
 * next to it rather than burying it in docs.
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
│  Pax8 CTA CLI collects anonymous usage data to help improve the tool.     │
│  Command names, success/failure, duration, CLI version and OS — never     │
│  tenant data, file paths, config values or anything personal.             │
│                                                                           │
│  This is on by default. To opt out:                                       │
│  • Run 'telemetry off', or set DO_NOT_TRACK=1                             │
│  • Learn more: github.com/pax8labs/pax8-cta/tree/main/packages/cli         │
└────────────────────────────────────────────────────────────────────────────┘
`;
}
