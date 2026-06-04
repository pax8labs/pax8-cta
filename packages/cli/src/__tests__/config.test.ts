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
 * Subprocess tests for `pax8-cta config` (issue #309).
 *
 * Coverage:
 *   - Bare run prints expected sections (Demo mode, Credentials, Config file, Paths)
 *   - --json output is parseable and structurally complete
 *   - --quiet emits zero stdout
 *   - Secret values supplied via env vars are NEVER echoed in any output mode
 */

import { describe, it, expect } from "vitest";
import { runCli, runCliExpectSuccess, stripAnsi } from "./test-utils.js";

const FAKE_SECRET = "fake-secret-do-not-leak-309";

describe("pax8-cta config (human-readable)", () => {
  it("renders all expected sections", async () => {
    // Subprocess stdout is piped, which would otherwise default to JSON.
    // Force the human-readable format via PAX8_CTA_DEFAULT_FORMAT.
    const result = await runCliExpectSuccess(["config"], {
      env: { NO_COLOR: "1", PAX8_CTA_DEFAULT_FORMAT: "table" },
      timeout: 60000,
    });

    const text = stripAnsi(result.stdout);
    expect(text).toContain("Pax8 CTA Configuration");
    expect(text).toContain("Demo mode:");
    expect(text).toContain("Default format:");
    expect(text).toContain("Quiet mode:");
    expect(text).toContain("Credentials:");
    expect(text).toContain("PARTNER_CLIENT_SECRET");
    expect(text).toContain("OS keychain:");
    expect(text).toContain("Telemetry:");
    expect(text).toContain("Config file:");
    expect(text).toContain("Paths:");
  }, 60000);

  it("reports demo mode ENABLED when DEMO_MODE=true", async () => {
    const result = await runCliExpectSuccess(["config"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true", PAX8_CTA_DEFAULT_FORMAT: "table" },
      timeout: 60000,
    });
    const text = stripAnsi(result.stdout);
    expect(text).toMatch(/Demo mode:\s+ENABLED/);
  }, 60000);
});

describe("pax8-cta config --json", () => {
  it("emits parseable JSON with all top-level sections", async () => {
    const result = await runCliExpectSuccess(["config", "--json"], {
      env: { NO_COLOR: "1" },
      timeout: 60000,
    });

    // The JSON should be the full stdout (no banners around config in subcommand mode).
    // First-run notice may appear; locate the leading `{`.
    const idx = result.stdout.indexOf("{");
    expect(idx).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(result.stdout.slice(idx));

    expect(parsed).toHaveProperty("demoMode");
    expect(parsed).toHaveProperty("defaultFormat");
    expect(parsed).toHaveProperty("quietMode");
    expect(parsed).toHaveProperty("credentials");
    expect(parsed).toHaveProperty("telemetry");
    expect(parsed).toHaveProperty("tenantsConfig");
    expect(parsed).toHaveProperty("paths");

    // Credentials section reports presence, never value
    expect(parsed.credentials).toHaveProperty("partnerClientSecretEnv");
    expect(["set", "not-set"]).toContain(parsed.credentials.partnerClientSecretEnv);
    expect(["set", "not-set", "unavailable"]).toContain(parsed.credentials.osKeychain);
  }, 60000);

  it("reflects PARTNER_CLIENT_SECRET=<value> as set without leaking the value", async () => {
    const result = await runCliExpectSuccess(["config", "--json"], {
      env: { NO_COLOR: "1", PARTNER_CLIENT_SECRET: FAKE_SECRET },
      timeout: 60000,
    });

    expect(result.stdout).not.toContain(FAKE_SECRET);
    expect(result.stderr).not.toContain(FAKE_SECRET);

    const idx = result.stdout.indexOf("{");
    const parsed = JSON.parse(result.stdout.slice(idx));
    expect(parsed.credentials.partnerClientSecretEnv).toBe("set");
    expect(parsed.credentials.effectiveSource).toBe("env");
  }, 60000);
});

describe("pax8-cta config --quiet", () => {
  it("produces zero stdout and exits 0", async () => {
    const result = await runCli(["config", "--quiet"], {
      env: { NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);
});

describe("pax8-cta config: secret hygiene", () => {
  it("never echoes PARTNER_CLIENT_SECRET in human-readable output", async () => {
    const result = await runCliExpectSuccess(["config"], {
      env: {
        NO_COLOR: "1",
        PAX8_CTA_DEFAULT_FORMAT: "table",
        PARTNER_CLIENT_SECRET: FAKE_SECRET,
      },
      timeout: 60000,
    });

    expect(result.stdout).not.toContain(FAKE_SECRET);
    expect(result.stderr).not.toContain(FAKE_SECRET);
    // Sanity: ensure the section was actually rendered (not silently empty)
    expect(stripAnsi(result.stdout)).toContain("PARTNER_CLIENT_SECRET");
  }, 60000);

  it("never echoes PAX8_CTA_CLIENT_SECRET even when only that alias is set", async () => {
    const result = await runCliExpectSuccess(["config", "--json"], {
      env: { NO_COLOR: "1", PAX8_CTA_CLIENT_SECRET: FAKE_SECRET },
      timeout: 60000,
    });

    expect(result.stdout).not.toContain(FAKE_SECRET);
    expect(result.stderr).not.toContain(FAKE_SECRET);
    const parsed = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
    expect(parsed.credentials.pax8 - ctaClientSecretEnv).toBe("set");
  }, 60000);
});
