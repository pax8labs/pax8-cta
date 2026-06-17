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
import { Command } from "commander";
import { ConsoleCapture, mockEnv, stripAnsi, containsText, mockSpinner } from "./test-utils.js";

// Mock PostHog to avoid actual API calls
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock conf to avoid writing to disk
const mockStore: Record<string, unknown> = {
  telemetryEnabled: false, // Matches production default (opt-in)
  firstRunShown: false,
  machineId: "test-machine-id",
};

vi.mock("conf", () => {
  return {
    default: class MockConf {
      get(key: string) {
        return mockStore[key];
      }
      set(key: string, value: unknown) {
        mockStore[key] = value;
      }
    },
  };
});

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Telemetry", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Reset mock store
    mockStore.telemetryEnabled = false;
    mockStore.firstRunShown = false;
    mockStore.machineId = "test-machine-id";

    // Disable telemetry in tests by default
    restoreEnv = mockEnv({
      DEMO_MODE: "true",
      PAX8_CTA_TELEMETRY_DISABLED: "1",
    });

    vi.resetModules();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("telemetry command", () => {
    it("should show telemetry status", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "status"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Telemetry Status")).toBe(true);
      expect(containsText(cleanOutput, "What we collect")).toBe(true);
      expect(containsText(cleanOutput, "What we NEVER collect")).toBe(true);
    });

    it("should show status by default", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Telemetry Status")).toBe(true);
    });

    it("should enable telemetry", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "on"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Telemetry enabled")).toBe(true);
      expect(containsText(cleanOutput, "Thank you")).toBe(true);
    });

    it("should disable telemetry", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "off"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Telemetry disabled")).toBe(true);
      expect(containsText(cleanOutput, "No usage data will be collected")).toBe(true);
    });

    it("should show what data is collected", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "status"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // What we collect
      expect(containsText(cleanOutput, "Command names")).toBe(true);
      expect(containsText(cleanOutput, "Success/failure")).toBe(true);
      expect(containsText(cleanOutput, "Execution duration")).toBe(true);
      expect(containsText(cleanOutput, "CLI version")).toBe(true);

      // What we don't collect
      expect(containsText(cleanOutput, "Tenant IDs")).toBe(true);
      expect(containsText(cleanOutput, "Solution names")).toBe(true);
      expect(containsText(cleanOutput, "Configuration values")).toBe(true);
      expect(containsText(cleanOutput, "personally identifiable")).toBe(true);
    });

    it("should show docs link", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "status"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "github.com/pax8labs/pax8-cta")).toBe(true);
    });
  });

  describe("telemetry module", () => {
    it("should be disabled in CI", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ CI: "true" });

      vi.resetModules();
      const { isTelemetryEnabled } = await import("../lib/telemetry.js");

      expect(isTelemetryEnabled()).toBe(false);
    });

    it("should be disabled when env var is set", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ PAX8_CTA_TELEMETRY_DISABLED: "1" });

      vi.resetModules();
      const { isTelemetryEnabled } = await import("../lib/telemetry.js");

      expect(isTelemetryEnabled()).toBe(false);
    });

    it("should respect DO_NOT_TRACK=1", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ DO_NOT_TRACK: "1" });

      vi.resetModules();
      const { isTelemetryEnabled } = await import("../lib/telemetry.js");

      expect(isTelemetryEnabled()).toBe(false);
    });

    it("should provide first run notice text with quick-start hints and telemetry opt-in", async () => {
      const { getFirstRunNotice } = await import("../lib/telemetry.js");

      const notice = getFirstRunNotice();

      // Telemetry disclosure (load-bearing for the privacy contract).
      expect(notice).toContain("anonymous usage data");
      expect(notice).toContain("telemetry on");
      expect(notice).toContain("disabled by default");

      // Quick-start hints (closes #447 — the in-CLI welcome covers every
      // install surface, including pnpm where the postinstall banner is
      // blocked by default).
      expect(notice).toContain("Welcome to Pax8 CTA");
      expect(notice).toContain("demo on");
      expect(notice).toContain("init");
      expect(notice).toContain("--help");
    });

    it("should track first run shown state", async () => {
      const { hasShownFirstRunNotice, markFirstRunNoticeShown } =
        await import("../lib/telemetry.js");

      // Initially not shown (mocked)
      expect(hasShownFirstRunNotice()).toBe(false);

      markFirstRunNoticeShown();

      // Now shown
      expect(hasShownFirstRunNotice()).toBe(true);
    });

    it("should enable and disable telemetry", async () => {
      const { enableTelemetry, disableTelemetry } = await import("../lib/telemetry.js");

      // These should not throw
      enableTelemetry();
      disableTelemetry();
    });

    it("should not throw when tracking with telemetry disabled", async () => {
      const { trackCommand, trackNotFound, trackError, trackFirstRun } =
        await import("../lib/telemetry.js");

      // None of these should throw when telemetry is disabled
      expect(() =>
        trackCommand({
          command: "test",
          success: true,
          durationMs: 100,
        })
      ).not.toThrow();

      expect(() => trackNotFound("tenant", "test-query")).not.toThrow();
      expect(() => trackError("test_error", "test")).not.toThrow();
      expect(() => trackFirstRun()).not.toThrow();
    });

    it("should hash query values for privacy", async () => {
      const { trackNotFound } = await import("../lib/telemetry.js");

      // Should not throw, and should hash the query
      expect(() => trackNotFound("tenant", "sensitive-tenant-name")).not.toThrow();
    });

    it("should shutdown telemetry without error", async () => {
      const { shutdownTelemetry } = await import("../lib/telemetry.js");

      // Should not throw
      await expect(shutdownTelemetry()).resolves.not.toThrow();
    });

    it("should silently no-op if posthog-node fails to load", async () => {
      // Telemetry is opt-in and lazy-loads posthog-node. If the dynamic
      // import throws (e.g. trimmed bundle, broken install), tracking
      // should still complete without surfacing an error to the CLI.
      restoreEnv();
      restoreEnv = mockEnv({ PAX8_CTA_POSTHOG_KEY: "phc_test_lazy_load" });
      mockStore.telemetryEnabled = true;

      vi.resetModules();
      vi.doMock("posthog-node", () => {
        throw new Error("simulated install failure");
      });

      const { trackCommand, shutdownTelemetry } = await import("../lib/telemetry.js");

      expect(() => trackCommand({ command: "test", success: true, durationMs: 10 })).not.toThrow();

      await expect(shutdownTelemetry()).resolves.not.toThrow();

      vi.doUnmock("posthog-node");
    });
  });

  describe("getCredentialedStatus (issue #450)", () => {
    let workDir: string;
    let originalCwd: string;

    beforeEach(async () => {
      const { mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      originalCwd = process.cwd();
      workDir = mkdtempSync(join(tmpdir(), "creds-status-"));
      process.chdir(workDir);
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      const { rmSync } = await import("node:fs");
      rmSync(workDir, { recursive: true, force: true });
    });

    it("returns 'demo' when DEMO_MODE=true (overrides any other signals)", async () => {
      // Outer beforeEach already sets DEMO_MODE=true. Even if the user also
      // has a real secret env set, the demo-mode signal must win.
      restoreEnv = mockEnv({
        DEMO_MODE: "true",
        PARTNER_CLIENT_SECRET: "should-be-ignored",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("demo");
    });

    it("returns 'unconfigured' when DEMO_MODE off and neither secret nor tenants.yaml present", async () => {
      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("unconfigured");
    });

    it("returns 'partial' when the secret env var is set but tenants.yaml is missing", async () => {
      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PARTNER_CLIENT_SECRET: "fake-secret-for-test",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("partial");
    });

    it("returns 'partial' when tenants.yaml exists but no secret env var is set", async () => {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      mkdirSync(join(workDir, "config"));
      writeFileSync(join(workDir, "config", "tenants.yaml"), 'version: "2.0"\n');

      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("partial");
    });

    it("returns 'configured' when both the secret and tenants.yaml are present", async () => {
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      mkdirSync(join(workDir, "config"));
      writeFileSync(join(workDir, "config", "tenants.yaml"), 'version: "2.0"\n');

      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PARTNER_CLIENT_SECRET: "fake-secret-for-test",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("configured");
    });

    it("honors the PAX8_CTA_CLIENT_SECRET alias for the secret check", async () => {
      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PAX8_CTA_CLIENT_SECRET: "fake-alias-secret",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("partial");
    });

    it("treats an empty secret env var as 'unset' (boolean coercion, not just defined)", async () => {
      restoreEnv = mockEnv({
        DEMO_MODE: "false",
        PARTNER_CLIENT_SECRET: "",
        PAX8_CTA_TELEMETRY_DISABLED: "1",
      });
      const { getCredentialedStatus, resetCredentialedStatusCacheForTests } =
        await import("../lib/telemetry.js");
      resetCredentialedStatusCacheForTests();
      expect(getCredentialedStatus()).toBe("unconfigured");
    });
  });
});
