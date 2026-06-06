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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POSTHOG_PROJECT_KEY, TELEMETRY_APP } from "../lib/telemetry-key.js";

describe("PostHog project key", () => {
  it("is non-empty and well-formed (catches the 'dead telemetry' bug)", () => {
    // PostHog client keys are `phc_` followed by 20+ base64-ish chars.
    expect(POSTHOG_PROJECT_KEY).toMatch(/^phc_[a-zA-Z0-9_-]{20,}$/);
  });

  it("is not a placeholder (must be replaced before publish)", () => {
    expect(POSTHOG_PROJECT_KEY).not.toMatch(/REPLACE|PLACEHOLDER|TODO|XXX/i);
  });

  it("tags every event with the pax8-cta app identifier (matches @pax8/cli's `app: pax8-cli` convention)", () => {
    expect(TELEMETRY_APP).toBe("pax8-cta");
  });
});

describe("resolveTelemetryKey", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.PAX8_CTA_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("falls back to the baked-in key when no env var is set (the production case)", async () => {
    vi.resetModules();
    const { resolveTelemetryKey } = await import("../lib/telemetry-key.js");
    expect(resolveTelemetryKey()).toBe(POSTHOG_PROJECT_KEY);
  });

  it("uses PAX8_CTA_POSTHOG_KEY when set (env override for dev/staging)", async () => {
    process.env.PAX8_CTA_POSTHOG_KEY = "phc_override_for_dev_environment";
    vi.resetModules();
    const { resolveTelemetryKey } = await import("../lib/telemetry-key.js");
    expect(resolveTelemetryKey()).toBe("phc_override_for_dev_environment");
  });

  it("uses NEXT_PUBLIC_POSTHOG_KEY as a secondary fallback", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_next_public_fallback_key";
    vi.resetModules();
    const { resolveTelemetryKey } = await import("../lib/telemetry-key.js");
    expect(resolveTelemetryKey()).toBe("phc_next_public_fallback_key");
  });
});
