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
 * Update notifier (issue #500)
 *
 * Tells users when a newer `@pax8/cta` has been published, so a months-old
 * global install doesn't silently keep running an outdated build.
 *
 * Design (mirrors the well-worn `update-notifier` model):
 * - The notice shown at startup is always **one run behind** — it reads a
 *   cached "latest version" from a prior run. Displaying is instant and never
 *   touches the network.
 * - The registry check runs in the **background** and only persists its result
 *   for the next run. It is started at startup and awaited at shutdown (like
 *   telemetry flushing) so it never delays the command that's running.
 * - Fully best-effort: any network/registry/storage failure is swallowed and
 *   must never surface to the user or break the CLI.
 *
 * Opt-out: NO_UPDATE_NOTIFIER=1, PAX8_CTA_NO_UPDATE_NOTIFIER=1, DO_NOT_TRACK=1,
 * or any CI environment.
 */

import Conf from "conf";

const PACKAGE_NAME = "@pax8/cta";
// Overridable for tests / private registries (mirrors PAX8_CTA_POSTHOG_HOST).
// Resolved at module load so later process.env mutations aren't picked up.
const REGISTRY_URL =
  process.env.PAX8_CTA_REGISTRY_URL || `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
// Check the registry at most once per day; the notice is cheap to keep showing
// from cache in between.
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Hard cap on the registry request so a hung/slow network can't stall shutdown.
const FETCH_TIMEOUT_MS = 4500;

interface UpdateState {
  lastUpdateCheck: number;
  latestVersionSeen: string;
}

let store: Conf<UpdateState> | null = null;

/**
 * Lazily open a dedicated `update-check` config file, kept separate from the
 * telemetry preferences so the two concerns don't share a schema. Returns null
 * if config storage isn't usable (read-only home, etc.).
 */
function getStore(): Conf<UpdateState> | null {
  if (store) return store;
  try {
    store = new Conf<UpdateState>({
      projectName: "pax8-cta-cli",
      configName: "update-check",
      defaults: { lastUpdateCheck: 0, latestVersionSeen: "" },
    });
  } catch {
    store = null;
  }
  return store;
}

/**
 * Update checks are suppressed under the same conventions as other opt-out /
 * non-interactive behavior: an explicit notifier opt-out, the DO_NOT_TRACK
 * convention (a registry round-trip is exactly what DNT users want gone), and
 * any CI environment.
 */
export function isUpdateNotifierDisabled(): boolean {
  return (
    process.env.NO_UPDATE_NOTIFIER === "1" ||
    process.env.PAX8_CTA_NO_UPDATE_NOTIFIER === "1" ||
    process.env.PAX8_CTA_NO_UPDATE_NOTIFIER === "true" ||
    process.env.DO_NOT_TRACK === "1" ||
    process.env.CI === "true" ||
    process.env.CI === "1"
  );
}

/**
 * Return true when `candidate` is strictly newer than `current`.
 *
 * Handles the common `x.y.z` shape plus an optional trailing prerelease
 * (`-beta.1`, which sorts *below* the same core release) and build metadata
 * (`+sha`, ignored). Deliberately lightweight to avoid a `semver` dependency;
 * the npm `latest` dist-tag only ever points at a stable release anyway.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const cleaned = v.trim().replace(/^v/, "").split("+", 1)[0];
    const dash = cleaned.indexOf("-");
    const core = dash === -1 ? cleaned : cleaned.slice(0, dash);
    const pre = dash === -1 ? "" : cleaned.slice(dash + 1);
    const nums = core.split(".").map((n) => parseInt(n, 10));
    return { nums, pre };
  };

  const a = parse(candidate);
  const b = parse(current);
  if (a.nums.some(Number.isNaN) || b.nums.some(Number.isNaN)) return false;

  const len = Math.max(a.nums.length, b.nums.length);
  for (let i = 0; i < len; i++) {
    const x = a.nums[i] ?? 0;
    const y = b.nums[i] ?? 0;
    if (x !== y) return x > y;
  }

  // Equal cores: a full release outranks a prerelease of the same core.
  if (!a.pre && b.pre) return true;
  if (a.pre && !b.pre) return false;
  if (a.pre && b.pre) return a.pre > b.pre; // coarse, but latest is stable anyway
  return false;
}

/**
 * If a newer version was recorded on a previous run, return a one-line notice
 * suitable for stderr. Returns null when disabled, nothing is cached, or the
 * running version is already current. Never touches the network.
 */
export function getUpdateNotice(currentVersion: string): string | null {
  if (isUpdateNotifierDisabled()) return null;
  const s = getStore();
  if (!s) return null;

  let latest: string;
  try {
    latest = s.get("latestVersionSeen");
  } catch {
    return null;
  }

  if (!latest || !isNewerVersion(latest, currentVersion)) return null;
  return (
    `⬆  pax8-cta ${latest} is available (you have ${currentVersion}).\n` +
    `   Update with: npm i -g @pax8/cta`
  );
}

let inFlight: Promise<void> | null = null;

/**
 * Kick off a throttled, background registry check that caches the latest
 * published version for the *next* run's notice. Fire-and-forget: never awaited
 * on the hot path. No-ops when disabled, when a check ran within the interval,
 * or when one is already in flight this process.
 */
export function startUpdateCheck(): void {
  if (isUpdateNotifierDisabled() || inFlight) return;
  const s = getStore();
  if (!s) return;

  let last = 0;
  try {
    last = s.get("lastUpdateCheck") ?? 0;
  } catch {
    return;
  }
  if (Date.now() - last < CHECK_INTERVAL_MS) return;

  inFlight = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let version: string | null = null;
      try {
        const res = await fetch(REGISTRY_URL, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const data = (await res.json()) as { version?: unknown };
          if (typeof data.version === "string") version = data.version;
        }
      } finally {
        clearTimeout(timer);
      }
      // Stamp the attempt even on a miss so a flaky registry doesn't get hit
      // on every invocation; only overwrite the version when we actually got one.
      s.set("lastUpdateCheck", Date.now());
      if (version) s.set("latestVersionSeen", version);
    } catch {
      // Best-effort: registry/network/storage failures must never surface.
    }
  })();
}

/**
 * Await the in-flight background check (if any) so its result is persisted
 * before the process exits — the update-notifier analogue of flushing
 * telemetry. Safe to call when no check is running.
 */
export async function finishUpdateCheck(): Promise<void> {
  if (!inFlight) return;
  try {
    await inFlight;
  } catch {
    // Never throw on shutdown.
  } finally {
    inFlight = null;
  }
}
