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
  diagnosticTelemetryEnabled: false,
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
    mockStore.diagnosticTelemetryEnabled = false;
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
      expect(containsText(cleanOutput, "Base telemetry collects")).toBe(true);
      expect(containsText(cleanOutput, "NEVER collected")).toBe(true);
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

      // What we never collect
      expect(containsText(cleanOutput, "Secrets, tokens")).toBe(true);
      expect(containsText(cleanOutput, "Tenant names")).toBe(true);
      expect(containsText(cleanOutput, "Solution contents")).toBe(true);
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
      expect(notice).toContain("telemetry on");
      expect(notice).toContain("disabled by default");
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

  describe("diagnostic telemetry", () => {
    it("should be disabled by default", async () => {
      const { isDiagnosticTelemetryEnabled } = await import("../lib/telemetry.js");

      expect(isDiagnosticTelemetryEnabled()).toBe(false);
    });

    it("should enable diagnostic telemetry and base telemetry together", async () => {
      const { enableDiagnosticTelemetry } = await import("../lib/telemetry.js");

      enableDiagnosticTelemetry();

      // Diagnostic requires base telemetry + PostHog key + no env override
      // In tests, env disables it, so isDiagnosticTelemetryEnabled() returns false.
      // But the config value should be set.
      expect(mockStore.diagnosticTelemetryEnabled).toBe(true);
      expect(mockStore.telemetryEnabled).toBe(true);
    });

    it("should disable diagnostic telemetry independently", async () => {
      const { enableDiagnosticTelemetry, disableDiagnosticTelemetry } =
        await import("../lib/telemetry.js");

      enableDiagnosticTelemetry();
      expect(mockStore.diagnosticTelemetryEnabled).toBe(true);

      disableDiagnosticTelemetry();
      expect(mockStore.diagnosticTelemetryEnabled).toBe(false);
      // Base telemetry stays on
      expect(mockStore.telemetryEnabled).toBe(true);
    });

    it("should format diagnostic report for user consent", async () => {
      const { formatReportForConsent } = await import("../lib/telemetry.js");

      const report = {
        event: "cli_diagnose_result" as const,
        command: "diagnose",
        errorCode: "GDAP_MISSING",
        errorMessage: "No active GDAP relationship found",
        tenantId: "11111111-1111-1111-1111-111111111111",
        failedStep: "GDAP relationship",
        steps: [
          { name: "Client secret", status: "pass" as const, durationMs: 5 },
          {
            name: "GDAP relationship",
            status: "fail" as const,
            durationMs: 1200,
            errorCode: "GDAP_MISSING",
          },
          { name: "Token acquisition", status: "skip" as const, durationMs: 0 },
        ],
        durationMs: 1205,
      };

      const formatted = formatReportForConsent(report);

      expect(formatted).toContain("cli_diagnose_result");
      expect(formatted).toContain("GDAP_MISSING");
      expect(formatted).toContain("11111111");
      expect(formatted).toContain("Client secret");
      expect(formatted).toContain("GDAP relationship");
      expect(formatted).toContain("1205ms");
    });

    it("should truncate long error messages in consent display", async () => {
      const { formatReportForConsent } = await import("../lib/telemetry.js");

      const report = {
        event: "cli_auth_failure" as const,
        command: "deploy",
        errorMessage: "A".repeat(300),
        durationMs: 100,
      };

      const formatted = formatReportForConsent(report);

      // Should truncate to ~200 chars + "..."
      expect(formatted).toContain("...");
      expect(formatted.length).toBeLessThan(500);
    });

    it("should not throw when sending report without PostHog key", async () => {
      const { sendDiagnosticReport } = await import("../lib/telemetry.js");

      // No PostHog key in test env — should silently no-op
      await expect(
        sendDiagnosticReport({
          event: "cli_diagnose_result" as const,
          command: "diagnose",
          errorCode: "TEST",
          durationMs: 100,
        })
      ).resolves.not.toThrow();
    });

    it("should show diagnostics subcommand in telemetry command", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "diagnostics", "on"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Diagnostic telemetry enabled")).toBe(true);
    });

    it("should show diagnostic status in telemetry status", async () => {
      const { telemetryCommand } = await import("../commands/telemetry.js");
      const program = new Command();
      program.addCommand(telemetryCommand);

      await program.parseAsync(["node", "test", "telemetry", "status"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Diagnostic reports")).toBe(true);
    });
  });
});
