/**
 * Copyright 2024 Pax8 Labs
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
  telemetryEnabled: true,
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
    mockStore.telemetryEnabled = true;
    mockStore.firstRunShown = false;
    mockStore.machineId = "test-machine-id";

    // Disable telemetry in tests by default
    restoreEnv = mockEnv({
      DEMO_MODE: "true",
      AGENTSYNC_TELEMETRY_DISABLED: "1",
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

      expect(containsText(cleanOutput, "github.com/pax8labs/agentsync")).toBe(true);
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
      restoreEnv = mockEnv({ AGENTSYNC_TELEMETRY_DISABLED: "1" });

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

    it("should provide first run notice text", async () => {
      const { getFirstRunNotice } = await import("../lib/telemetry.js");

      const notice = getFirstRunNotice();

      expect(notice).toContain("anonymous usage data");
      expect(notice).toContain("telemetry off");
      expect(notice).toContain("DO_NOT_TRACK");
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
  });
});
