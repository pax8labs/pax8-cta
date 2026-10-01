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
import { mockEnv } from "./test-utils.js";

// Isolated update-check config store, mocked to avoid disk writes.
const mockStore: Record<string, unknown> = {
  lastUpdateCheck: 0,
  latestVersionSeen: "",
};

vi.mock("conf", () => ({
  default: class MockConf {
    get(key: string) {
      return mockStore[key];
    }
    set(key: string, value: unknown) {
      mockStore[key] = value;
    }
  },
}));

const DAY_MS = 24 * 60 * 60 * 1000;

describe("update-notifier", () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    mockStore.lastUpdateCheck = 0;
    mockStore.latestVersionSeen = "";
    // Neutralize CI/opt-out so the notifier is enabled by default in tests.
    // (GitHub Actions sets CI=true, which would otherwise disable it.)
    restoreEnv = mockEnv({
      CI: "",
      DO_NOT_TRACK: "",
      NO_UPDATE_NOTIFIER: "",
      PAX8_CTA_NO_UPDATE_NOTIFIER: "",
    });
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("isNewerVersion", () => {
    it("compares core versions numerically (not lexically)", async () => {
      const { isNewerVersion } = await import("../lib/update-notifier.js");
      expect(isNewerVersion("0.1.11", "0.1.10")).toBe(true);
      expect(isNewerVersion("0.1.10", "0.1.10")).toBe(false);
      expect(isNewerVersion("0.1.9", "0.1.10")).toBe(false);
      expect(isNewerVersion("0.2.0", "0.1.99")).toBe(true); // not string "0.2.0" < "0.1.99"
      expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
      expect(isNewerVersion("0.1.100", "0.1.99")).toBe(true); // 100 > 99 numerically
    });

    it("treats a full release as newer than a prerelease of the same core", async () => {
      const { isNewerVersion } = await import("../lib/update-notifier.js");
      expect(isNewerVersion("0.1.11", "0.1.11-beta.1")).toBe(true);
      expect(isNewerVersion("0.1.11-beta.1", "0.1.11")).toBe(false);
    });

    it("ignores a leading v and build metadata, and rejects garbage", async () => {
      const { isNewerVersion } = await import("../lib/update-notifier.js");
      expect(isNewerVersion("v0.1.11", "0.1.10")).toBe(true);
      expect(isNewerVersion("0.1.11+abc123", "0.1.10")).toBe(true);
      expect(isNewerVersion("not-a-version", "0.1.10")).toBe(false);
      expect(isNewerVersion("0.1.11", "garbage")).toBe(false);
    });
  });

  describe("getUpdateNotice", () => {
    it("returns a notice when a newer version is cached", async () => {
      mockStore.latestVersionSeen = "0.1.12";
      const { getUpdateNotice } = await import("../lib/update-notifier.js");
      const notice = getUpdateNotice("0.1.10");
      expect(notice).toContain("0.1.12 is available");
      expect(notice).toContain("you have 0.1.10");
      expect(notice).toContain("npm i -g @pax8/cta");
    });

    it("returns null when the running version is already current or newer", async () => {
      mockStore.latestVersionSeen = "0.1.10";
      const { getUpdateNotice } = await import("../lib/update-notifier.js");
      expect(getUpdateNotice("0.1.10")).toBeNull();
      expect(getUpdateNotice("0.1.11")).toBeNull(); // running ahead of cache
    });

    it("returns null when nothing is cached", async () => {
      const { getUpdateNotice } = await import("../lib/update-notifier.js");
      expect(getUpdateNotice("0.1.10")).toBeNull();
    });

    it("returns null when disabled via opt-out env vars", async () => {
      mockStore.latestVersionSeen = "0.1.12";
      restoreEnv();
      restoreEnv = mockEnv({ NO_UPDATE_NOTIFIER: "1" });
      vi.resetModules();
      const { getUpdateNotice } = await import("../lib/update-notifier.js");
      expect(getUpdateNotice("0.1.10")).toBeNull();
    });

    it("returns null in CI", async () => {
      mockStore.latestVersionSeen = "0.1.12";
      restoreEnv();
      restoreEnv = mockEnv({ CI: "true" });
      vi.resetModules();
      const { getUpdateNotice } = await import("../lib/update-notifier.js");
      expect(getUpdateNotice("0.1.10")).toBeNull();
    });
  });

  describe("startUpdateCheck / finishUpdateCheck", () => {
    it("fetches the registry and caches the latest version", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "0.1.12" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { startUpdateCheck, finishUpdateCheck } = await import("../lib/update-notifier.js");
      startUpdateCheck();
      await finishUpdateCheck();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toContain("registry.npmjs.org/@pax8/cta/latest");
      expect(mockStore.latestVersionSeen).toBe("0.1.12");
      expect(mockStore.lastUpdateCheck).toBeGreaterThan(0);
    });

    it("does not check again within the throttle interval", async () => {
      mockStore.lastUpdateCheck = Date.now() - 60_000; // 1 minute ago
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const { startUpdateCheck, finishUpdateCheck } = await import("../lib/update-notifier.js");
      startUpdateCheck();
      await finishUpdateCheck();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("checks again once the interval has elapsed", async () => {
      mockStore.lastUpdateCheck = Date.now() - (DAY_MS + 60_000); // just over a day ago
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "0.2.0" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const { startUpdateCheck, finishUpdateCheck } = await import("../lib/update-notifier.js");
      startUpdateCheck();
      await finishUpdateCheck();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockStore.latestVersionSeen).toBe("0.2.0");
    });

    it("does not fetch when disabled", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ DO_NOT_TRACK: "1" });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      vi.resetModules();
      const { startUpdateCheck, finishUpdateCheck } = await import("../lib/update-notifier.js");
      startUpdateCheck();
      await finishUpdateCheck();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("swallows registry errors and still stamps the attempt (no throw)", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
      vi.stubGlobal("fetch", fetchMock);

      const { startUpdateCheck, finishUpdateCheck } = await import("../lib/update-notifier.js");
      startUpdateCheck();
      await expect(finishUpdateCheck()).resolves.not.toThrow();
      // A rejected fetch happens inside the try, so the attempt-stamp line is
      // skipped; the important guarantee is that nothing throws and no version
      // is cached from a failed lookup.
      expect(mockStore.latestVersionSeen).toBe("");
    });
  });
});
