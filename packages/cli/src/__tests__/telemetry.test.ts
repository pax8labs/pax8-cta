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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleCapture, mockEnv, stripAnsi, containsText, mockSpinner } from "./test-utils.js";

// Mock PostHog to avoid actual API calls. Instances are collected so tests can
// assert on capture()/identify() calls even across vi.resetModules().
const mockPostHogInstances: Array<{
  capture: ReturnType<typeof vi.fn>;
  identify: ReturnType<typeof vi.fn>;
  groupIdentify: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
}> = [];

// Prefixed with `mock` so it can be referenced inside vi.mock/vi.doMock
// factories (vitest hoists those above imports and only allows `mock*` refs).
function mockPostHogModule() {
  return {
    PostHog: vi.fn(function (this: Record<string, unknown>) {
      this.capture = vi.fn();
      this.identify = vi.fn();
      this.groupIdentify = vi.fn();
      this.shutdown = vi.fn().mockResolvedValue(undefined);
      mockPostHogInstances.push(this as unknown as (typeof mockPostHogInstances)[number]);
    }),
  };
}

vi.mock("posthog-node", () => mockPostHogModule());

// Mock conf to avoid writing to disk
const mockStore: Record<string, unknown> = {
  telemetryEnabled: true, // Matches production default (opt-out)
  firstRunShown: false,
  // Most tests care about steady state, not the one run that shows the notice.
  // `noticeVersion` at the current version keeps the pending-notice gate in
  // `isTelemetryEnabled()` out of the way; the tests that exercise the gate set
  // it back to 0 themselves.
  noticeVersion: 2,
  machineId: "test-machine-id",
};

vi.mock("conf", () => {
  return {
    default: class MockConf {
      // Mirror Conf's real behaviour: an unset key falls back to the
      // `defaults` the store was constructed with. The mock used to ignore
      // `defaults` entirely and report `undefined` for an untouched key, which
      // made the production default (telemetry on) impossible to assert.
      private readonly defaults: Record<string, unknown>;

      constructor(options?: { defaults?: Record<string, unknown> }) {
        this.defaults = options?.defaults ?? {};
      }

      get(key: string) {
        return key in mockStore ? mockStore[key] : this.defaults[key];
      }

      set(key: string, value: unknown) {
        mockStore[key] = value;
      }

      get path() {
        return "/mock/pax8-cta-cli/config.json";
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
    mockStore.noticeVersion = 2;
    mockStore.machineId = "test-machine-id";
    mockPostHogInstances.length = 0;

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

    it("status names the actual disable source instead of a hint that does nothing", async () => {
      // `telemetry on` only writes the config file, so suggesting it for an
      // env-var or CI disable sends the user to run a no-op. Each source must
      // name the lever that actually controls it.
      const cases: Array<{
        env: Record<string, string>;
        store?: Record<string, unknown>;
        expected: string;
        notExpected?: string;
      }> = [
        {
          env: { PAX8_CTA_TELEMETRY_DISABLED: "1" },
          expected: "unset PAX8_CTA_TELEMETRY_DISABLED",
          notExpected: "To re-enable: telemetry on",
        },
        {
          env: { PAX8_CTA_TELEMETRY_DISABLED: "", DO_NOT_TRACK: "1" },
          expected: "unset DO_NOT_TRACK",
          notExpected: "To re-enable: telemetry on",
        },
        {
          env: { PAX8_CTA_TELEMETRY_DISABLED: "", DO_NOT_TRACK: "", CI: "true" },
          expected: "never collected in CI",
          notExpected: "To re-enable: telemetry on",
        },
        // The `no-key` source is deliberately absent: `resolveTelemetryKey()`
        // falls back to the baked-in project key, so an empty
        // PAX8_CTA_POSTHOG_KEY still resolves and the branch is unreachable
        // from env alone. It would need the key module itself mocked out.
        {
          env: {
            PAX8_CTA_TELEMETRY_DISABLED: "",
            DO_NOT_TRACK: "",
            CI: "",
            PAX8_CTA_POSTHOG_KEY: "phc_test_status",
          },
          store: { noticeVersion: 0, firstRunShown: true },
          expected: "Paused until the telemetry notice",
          notExpected: "To re-enable: telemetry on",
        },
        {
          env: {
            PAX8_CTA_TELEMETRY_DISABLED: "",
            DO_NOT_TRACK: "",
            CI: "",
            PAX8_CTA_POSTHOG_KEY: "phc_test_status",
          },
          store: { telemetryEnabled: false },
          expected: "To re-enable: telemetry on",
        },
      ];

      for (const c of cases) {
        restoreEnv();
        restoreEnv = mockEnv({ DEMO_MODE: "true", ...c.env });
        mockStore.telemetryEnabled = false;
        mockStore.firstRunShown = false;
        mockStore.noticeVersion = 2;
        Object.assign(mockStore, c.store ?? {});

        consoleCapture.stop();
        consoleCapture = new ConsoleCapture();
        consoleCapture.start();

        vi.resetModules();
        const { telemetryCommand } = await import("../commands/telemetry.js");
        const program = new Command();
        program.addCommand(telemetryCommand);
        await program.parseAsync(["node", "test", "telemetry", "status"]);

        const out = stripAnsi(consoleCapture.getAllOutput());
        expect(
          containsText(out, c.expected),
          `expected "${c.expected}" for ${JSON.stringify(c.env)}`
        ).toBe(true);
        if (c.notExpected) {
          expect(
            containsText(out, c.notExpected),
            `did not expect "${c.notExpected}" for ${JSON.stringify(c.env)}`
          ).toBe(false);
        }
      }
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

    it("collects by default — a fresh install with no stored preference is on", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      // No stored preference at all — the Conf `defaults` block decides.
      delete mockStore.telemetryEnabled;

      vi.resetModules();
      const { isTelemetryEnabled, getStoredTelemetryPreference } =
        await import("../lib/telemetry.js");

      expect(getStoredTelemetryPreference()).toBe(true);
      expect(isTelemetryEnabled()).toBe(true);

      mockStore.telemetryEnabled = true;
    });

    it("an explicit `telemetry off` still wins over the on-by-default setting", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.telemetryEnabled = false;

      vi.resetModules();
      const { isTelemetryEnabled, getTelemetryDisabledSource } =
        await import("../lib/telemetry.js");

      expect(isTelemetryEnabled()).toBe(false);
      expect(getTelemetryDisabledSource()).toBe("config");

      mockStore.telemetryEnabled = true;
    });

    it("an install upgrading into on-by-default owes the change notice, not the welcome", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      // Shape of a pre-existing install: it saw the old welcome, so
      // `firstRunShown` is set, but it predates disclosure versioning.
      mockStore.firstRunShown = true;
      mockStore.noticeVersion = 0;
      delete mockStore.telemetryEnabled;

      vi.resetModules();
      const { getPendingNotice, isTelemetryEnabled, getTelemetryDisabledSource } =
        await import("../lib/telemetry.js");

      expect(getPendingNotice()).toBe("default-change");
      // The whole point: the default flipped on, but nothing is collected until
      // the user has actually been told.
      expect(isTelemetryEnabled()).toBe(false);
      expect(getTelemetryDisabledSource()).toBe("pending-notice");
    });

    it("showing the change notice records the version and lets collection start", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.firstRunShown = true;
      mockStore.noticeVersion = 0;
      delete mockStore.telemetryEnabled;

      vi.resetModules();
      const { getPendingNotice, markNoticeShown, isTelemetryEnabled, TELEMETRY_NOTICE_VERSION } =
        await import("../lib/telemetry.js");

      // "first-run" so the assertion below is about the gate clearing, not the
      // default-change suppression flag.
      markNoticeShown("first-run");

      expect(mockStore.noticeVersion).toBe(TELEMETRY_NOTICE_VERSION);
      expect(getPendingNotice()).toBeNull();
      expect(isTelemetryEnabled()).toBe(true);
    });

    it("the command that printed the change notice is itself never captured", async () => {
      // Drives the real index.ts ordering: print notice -> markNoticeShown()
      // -> command runs -> postAction hook calls trackCommand(). Asserting on
      // markNoticeShown()/isTelemetryEnabled() alone misses this, because the
      // persist clears the getPendingNotice() gate before the command runs.
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.firstRunShown = true;
      mockStore.noticeVersion = 0;
      delete mockStore.telemetryEnabled;
      mockPostHogInstances.length = 0;

      vi.resetModules();
      const { getPendingNotice, markNoticeShown, trackCommand, shutdownTelemetry } =
        await import("../lib/telemetry.js");

      expect(getPendingNotice()).toBe("default-change");
      markNoticeShown("default-change");

      // The gate itself is now clear - the version was persisted...
      expect(getPendingNotice()).toBeNull();

      // ...but the run that showed the notice must still capture nothing.
      trackCommand({ command: "tenants list", success: true, durationMs: 12 });
      await shutdownTelemetry();

      const captures = mockPostHogInstances.flatMap((i) => i.capture.mock.calls);
      expect(captures).toHaveLength(0);
    });

    it("the run after the change notice does collect", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      // Store as it looks on the *next* invocation: version already recorded.
      mockStore.firstRunShown = true;
      mockStore.noticeVersion = 2;
      delete mockStore.telemetryEnabled;
      mockPostHogInstances.length = 0;

      vi.resetModules();
      const { getPendingNotice, isTelemetryEnabled } = await import("../lib/telemetry.js");

      expect(getPendingNotice()).toBeNull();
      // Suppression is per-process, so a fresh module graph collects normally.
      expect(isTelemetryEnabled()).toBe(true);
    });

    it("the first-run welcome does not suppress, so new installs still report", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.firstRunShown = false;
      mockStore.noticeVersion = 0;
      delete mockStore.telemetryEnabled;

      vi.resetModules();
      const { markNoticeShown, isTelemetryEnabled } = await import("../lib/telemetry.js");

      markNoticeShown("first-run");

      // Unlike the upgrade path, a brand-new install is measurable immediately -
      // otherwise trackFirstRun() would never fire for anyone.
      expect(isTelemetryEnabled()).toBe(true);
    });

    it("opting out on the notice run means the default flip never collects", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.firstRunShown = true;
      mockStore.noticeVersion = 0;
      delete mockStore.telemetryEnabled;

      vi.resetModules();
      const {
        markNoticeShown,
        disableTelemetry,
        isTelemetryEnabled,
        getTelemetryDisabledSource,
        resetNoticeSuppressionForTests,
      } = await import("../lib/telemetry.js");

      // The run that prints the notice is itself not collected...
      expect(isTelemetryEnabled()).toBe(false);
      markNoticeShown("default-change");
      expect(isTelemetryEnabled()).toBe(false);

      // ...the user reads it and opts out, which in practice is a later
      // invocation - so drop the per-process suppression to model that.
      disableTelemetry();
      resetNoticeSuppressionForTests();

      // They land on a stored opt-out, never having been measured.
      expect(isTelemetryEnabled()).toBe(false);
      expect(getTelemetryDisabledSource()).toBe("config");
    });

    it("a fresh install owes the first-run welcome, not the change notice", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        PAX8_CTA_TELEMETRY_DISABLED: "",
        PAX8_CTA_POSTHOG_KEY: "phc_test_default",
      });
      mockStore.firstRunShown = false;
      mockStore.noticeVersion = 0;

      vi.resetModules();
      const { getPendingNotice } = await import("../lib/telemetry.js");

      expect(getPendingNotice()).toBe("first-run");
    });

    it("the change notice names the change and says nothing has been sent yet", async () => {
      const { getDefaultChangeNotice } = await import("../lib/telemetry.js");

      const notice = getDefaultChangeNotice();
      expect(notice).toContain("collected by default");
      expect(notice).toContain("Nothing has been sent yet");
      expect(notice).toContain("telemetry off");
      expect(notice).toContain("DO_NOT_TRACK");
    });

    it("should provide first run notice text with quick-start hints and telemetry disclosure", async () => {
      const { getFirstRunNotice } = await import("../lib/telemetry.js");

      const notice = getFirstRunNotice();

      // Telemetry disclosure (load-bearing for the privacy contract).
      // Collection is on by default, so this notice is the only place the
      // user is told it is happening — it must say so and must carry the
      // opt-out. Do not weaken these assertions.
      expect(notice).toContain("anonymous usage data");
      expect(notice).toContain("on by default");
      expect(notice).toContain("telemetry off");
      expect(notice).toContain("DO_NOT_TRACK");

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

      // Restore the standard posthog-node mock (vi.doUnmock would revert to the
      // real module) and reset the registry so later tests re-import cleanly.
      vi.doMock("posthog-node", () => mockPostHogModule());
      vi.resetModules();
    });
  });

  describe("user identity attribution", () => {
    it("does not throw when identifying with telemetry disabled", async () => {
      const { identifyUser } = await import("../lib/telemetry.js");
      expect(() =>
        identifyUser({
          tenantId: "11111111-1111-1111-1111-111111111111",
          clientId: "22222222-2222-2222-2222-222222222222",
        })
      ).not.toThrow();
    });

    it("attributes events to a stable per-user hash of the partner credentials, not the machine ID", async () => {
      const tenantId = "11111111-1111-1111-1111-111111111111";
      const clientId = "22222222-2222-2222-2222-222222222222";

      restoreEnv();
      restoreEnv = mockEnv({
        // CI/DO_NOT_TRACK are neutralized so telemetry is actually enabled —
        // GitHub Actions sets CI=true, which would otherwise disable it and
        // leave no PostHog client to assert against.
        CI: "",
        DO_NOT_TRACK: "",
        DEMO_MODE: "false",
        PAX8_CTA_POSTHOG_KEY: "phc_test_identity",
        PARTNER_TENANT_ID: tenantId,
        PARTNER_CLIENT_ID: clientId,
      });
      mockStore.telemetryEnabled = true;
      mockStore.machineId = "test-machine-id";

      vi.resetModules();
      const { trackCommand, shutdownTelemetry } = await import("../lib/telemetry.js");

      trackCommand({ command: "deploy", success: true, durationMs: 100 });

      // The event capture runs in a fire-and-forget async task (lazy client
      // import + identity resolution), so wait for it to settle.
      await vi.waitFor(() => {
        expect(mockPostHogInstances.at(-1)?.capture).toHaveBeenCalled();
      });

      const instance = mockPostHogInstances.at(-1)!;

      const { createHash } = await import("node:crypto");
      const expectedId = createHash("sha256")
        .update(`pax8-cta-user:${tenantId}:${clientId}`)
        .digest("hex")
        .substring(0, 32);

      // identify() is emitted once with the derived per-user distinct ID.
      expect(instance.identify).toHaveBeenCalledWith(
        expect.objectContaining({ distinctId: expectedId })
      );

      // The captured event is attributed to that same per-user ID — NOT the
      // per-machine fallback that previously collapsed everyone into one user.
      const captureArg = instance.capture.mock.calls[0][0];
      expect(captureArg.distinctId).toBe(expectedId);
      expect(captureArg.distinctId).not.toBe("test-machine-id");

      // Credentialed runs also attach a partner-account group so PostHog can
      // count unique accounts. The key is a salted hash of the clientId alone
      // (app-scoped salt), independent of the per-user distinct ID above.
      const expectedAccountKey = createHash("sha256")
        .update(`pax8-cta:account:v1${clientId}`)
        .digest("hex");
      expect(instance.groupIdentify).toHaveBeenCalledWith(
        expect.objectContaining({ groupType: "account", groupKey: expectedAccountKey })
      );
      expect(captureArg.groups).toEqual({ account: expectedAccountKey });

      // Regression guard: identify + groupIdentify must each fire exactly once.
      // ensureIdentified() calls identifyUser() (a fire-and-forget emit) and
      // then awaits emitIdentify() itself; a non-atomic guard let both slip
      // through and double-sent identify/groupIdentify on every run.
      expect(instance.identify).toHaveBeenCalledTimes(1);
      expect(instance.groupIdentify).toHaveBeenCalledTimes(1);

      await shutdownTelemetry();
    });

    it("attaches no account group for uncredentialed runs (anonymous machine ID)", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        DEMO_MODE: "false",
        PAX8_CTA_POSTHOG_KEY: "phc_test_anon",
        // No PARTNER_TENANT_ID / PARTNER_CLIENT_ID — nothing to derive an
        // identity or account from, so events stay on the anonymous machine ID.
      });
      mockStore.telemetryEnabled = true;
      mockStore.machineId = "test-machine-id";

      // "Uncredentialed" must also mean "no config/tenants.yaml to fall back
      // to". The test process runs from packages/cli, which has a real one,
      // so point cwd at an empty directory for this case.
      const emptyCwd = mkdtempSync(join(tmpdir(), "pax8-cta-telemetry-"));
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(emptyCwd);

      vi.resetModules();
      const { trackCommand, shutdownTelemetry } = await import("../lib/telemetry.js");

      trackCommand({ command: "deploy", success: true, durationMs: 100 });

      await vi.waitFor(() => {
        expect(mockPostHogInstances.at(-1)?.capture).toHaveBeenCalled();
      });

      const instance = mockPostHogInstances.at(-1)!;
      const captureArg = instance.capture.mock.calls[0][0];
      // Anonymous fallback: machine ID, and crucially NO account group.
      expect(captureArg.distinctId).toBe("test-machine-id");
      expect(captureArg.groups).toBeUndefined();
      expect(instance.groupIdentify).not.toHaveBeenCalled();

      await shutdownTelemetry();
      cwdSpy.mockRestore();
      rmSync(emptyCwd, { recursive: true, force: true });
    });

    it("identifies from config/tenants.yaml even when the config is not deploy-valid", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        DEMO_MODE: "false",
        PAX8_CTA_POSTHOG_KEY: "phc_test_cfg",
        // No PARTNER_* env vars — identity has to come from the config file.
      });
      mockStore.telemetryEnabled = true;

      // A partner block with real GUIDs, but the rest of the document is
      // missing `source:` and would fail loadConfig's schema. Identity
      // resolution must not depend on the config being deploy-ready — that
      // regression silently demoted these runs to the anonymous machine ID
      // and emitted no `identify` at all.
      const cwd = mkdtempSync(join(tmpdir(), "pax8-cta-telemetry-"));
      mkdirSync(join(cwd, "config"));
      writeFileSync(
        join(cwd, "config", "tenants.yaml"),
        [
          "partner:",
          "  tenantId: 11111111-2222-3333-4444-555555555555",
          "  clientId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "tenants: []",
        ].join("\n")
      );
      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwd);

      vi.resetModules();
      const { trackCommand, shutdownTelemetry, accountGroupKey } =
        await import("../lib/telemetry.js");

      trackCommand({ command: "deploy", success: true, durationMs: 100 });

      await vi.waitFor(() => {
        expect(mockPostHogInstances.at(-1)?.capture).toHaveBeenCalled();
      });

      const instance = mockPostHogInstances.at(-1)!;
      const captureArg = instance.capture.mock.calls[0][0];
      const expectedAccountKey = accountGroupKey("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

      expect(captureArg.distinctId).not.toBe("test-machine-id");
      expect(captureArg.groups).toEqual({ account: expectedAccountKey });
      expect(instance.identify).toHaveBeenCalledTimes(1);

      await shutdownTelemetry();
      cwdSpy.mockRestore();
      rmSync(cwd, { recursive: true, force: true });
    });
  });

  describe("command_executed schema (parity with @pax8/cli)", () => {
    async function captureOne(
      ctx: Parameters<Awaited<typeof import("../lib/telemetry.js")>["trackCommand"]>[0]
    ) {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        DEMO_MODE: "false",
        PAX8_CTA_POSTHOG_KEY: "phc_test_schema",
        PARTNER_TENANT_ID: "11111111-1111-1111-1111-111111111111",
        PARTNER_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
      });
      mockStore.telemetryEnabled = true;

      vi.resetModules();
      const { trackCommand, shutdownTelemetry } = await import("../lib/telemetry.js");
      trackCommand(ctx);
      await vi.waitFor(() => {
        expect(mockPostHogInstances.at(-1)?.capture).toHaveBeenCalled();
      });
      const call = mockPostHogInstances.at(-1)!.capture.mock.calls[0][0];
      await shutdownTelemetry();
      return call;
    }

    it("emits `command_executed`, the name @pax8/cli and every shared dashboard uses", async () => {
      const call = await captureOne({ command: "deploy", success: true, durationMs: 100 });
      // Regression guard for the rename away from `cli_command`, which no
      // shared PostHog insight ever matched.
      expect(call.event).toBe("command_executed");
    });

    it("carries the full @pax8/cli property set", async () => {
      const call = await captureOne({
        command: "tenants",
        subcommand: "tenants.list",
        success: false,
        durationMs: 42,
        errorCode: "ERROR_USAGE",
      });

      expect(call.properties).toMatchObject({
        app: "pax8-cta",
        command: "tenants",
        subcommand: "tenants.list",
        success: false,
        error_code: "ERROR_USAGE",
        duration_ms: 42,
        node_version: process.version,
        os: process.platform,
        demo_mode: false,
      });
      // cli_version must track package.json, not a hand-maintained literal —
      // it read "0.1.0" for every release from 0.1.1 onward.
      expect(call.properties.cli_version).toMatch(/^\d+\.\d+\.\d+/);
      expect(call.properties.cli_version).not.toBe("0.1.0");
      // `error_type` was CTA's old spelling; @pax8/cli breaks failures down by
      // `error_code` and would never have matched it.
      expect(call.properties).not.toHaveProperty("error_type");
    });

    it("omits error_code on success", async () => {
      const call = await captureOne({ command: "deploy", success: true, durationMs: 5 });
      expect(call.properties.error_code).toBeUndefined();
      expect(call.properties.success).toBe(true);
    });
  });

  describe("shutdown drains in-flight captures", () => {
    it("delivers an event whose capture is still pending when shutdown starts", async () => {
      restoreEnv();
      restoreEnv = mockEnv({
        CI: "",
        DO_NOT_TRACK: "",
        DEMO_MODE: "false",
        PAX8_CTA_POSTHOG_KEY: "phc_test_drain",
        PARTNER_TENANT_ID: "11111111-1111-1111-1111-111111111111",
        PARTNER_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
      });
      mockStore.telemetryEnabled = true;

      vi.resetModules();
      const { trackCommand, shutdownTelemetry } = await import("../lib/telemetry.js");

      // No waitFor here: shut down immediately, exactly as the entry point
      // does after parseAsync resolves. trackCommand is fire-and-forget and
      // does several awaits (dynamic import, identity resolution) before it
      // reaches capture(); shutdown used to win that race, call
      // client.shutdown() and let the caller process.exit() with the event
      // never sent. That is why failures and REPL sessions went dark.
      trackCommand({ command: "deploy", success: false, durationMs: 1, errorCode: "ERROR_CLI" });
      await shutdownTelemetry();

      const instance = mockPostHogInstances.at(-1)!;
      expect(instance.capture).toHaveBeenCalledTimes(1);
      expect(instance.capture.mock.calls[0][0].event).toBe("command_executed");
      // The drain must happen before the flush, not after it.
      expect(instance.capture.mock.invocationCallOrder[0]).toBeLessThan(
        instance.shutdown.mock.invocationCallOrder[0]
      );
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
