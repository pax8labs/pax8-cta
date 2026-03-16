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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConsoleCapture, stripAnsi, containsText } from "./test-utils.js";

describe("Banner Module", () => {
  let consoleCapture: ConsoleCapture;

  beforeEach(() => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();
  });

  afterEach(() => {
    consoleCapture.stop();
  });

  describe("showBanner", () => {
    it("should display the full ASCII art banner", async () => {
      const { showBanner } = await import("../lib/banner.js");

      showBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should contain banner box and content
      expect(cleanOutput.length).toBeGreaterThan(100); // Banner is large
      expect(cleanOutput).toContain("╔"); // Has top border
      expect(cleanOutput).toContain("╚"); // Has bottom border
    });

    it("should display tagline", async () => {
      const { showBanner } = await import("../lib/banner.js");

      showBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Sync your Copilot Studio agents")).toBe(true);
      expect(containsText(cleanOutput, "Multi-tenant deployment automation")).toBe(true);
    });

    it("should display version number", async () => {
      const { showBanner } = await import("../lib/banner.js");

      showBanner("1.2.3");

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Version 1.2.3")).toBe(true);
    });

    it("should use default version when not provided", async () => {
      const { showBanner } = await import("../lib/banner.js");

      showBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Version 0.1.0")).toBe(true);
    });

    it("should display border characters", async () => {
      const { showBanner } = await import("../lib/banner.js");

      showBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should have box drawing characters
      expect(cleanOutput).toContain("╔");
      expect(cleanOutput).toContain("═");
      expect(cleanOutput).toContain("╗");
      expect(cleanOutput).toContain("║");
      expect(cleanOutput).toContain("╚");
      expect(cleanOutput).toContain("╝");
    });
  });

  describe("showWelcome", () => {
    it("should display quick start section", async () => {
      const { showWelcome } = await import("../lib/banner.js");

      showWelcome();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Quick Start")).toBe(true);
    });

    it("should display deployment command examples", async () => {
      const { showWelcome } = await import("../lib/banner.js");

      showWelcome();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Deploy to all tenants")).toBe(true);
      expect(containsText(cleanOutput, "deploy --all")).toBe(true);
    });

    it("should display status command", async () => {
      const { showWelcome } = await import("../lib/banner.js");

      showWelcome();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "deployment status")).toBe(true);
      expect(containsText(cleanOutput, "status --deployment")).toBe(true);
    });

    it("should display tenants command", async () => {
      const { showWelcome } = await import("../lib/banner.js");

      showWelcome();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "List your tenants")).toBe(true);
      expect(containsText(cleanOutput, "tenants list")).toBe(true);
    });

    it("should display help hint", async () => {
      const { showWelcome } = await import("../lib/banner.js");

      showWelcome();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Need help")).toBe(true);
      expect(containsText(cleanOutput, "help")).toBe(true);
    });
  });

  describe("showCompactBanner", () => {
    it("should display compact banner", async () => {
      const { showCompactBanner } = await import("../lib/banner.js");

      showCompactBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "AgentSync")).toBe(true);
      expect(containsText(cleanOutput, "Multi-Tenant Deployment")).toBe(true);
    });

    it("should display border", async () => {
      const { showCompactBanner } = await import("../lib/banner.js");

      showCompactBanner();

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should have box drawing characters
      expect(cleanOutput).toContain("╔");
      expect(cleanOutput).toContain("═");
      expect(cleanOutput).toContain("╗");
      expect(cleanOutput).toContain("║");
      expect(cleanOutput).toContain("╚");
      expect(cleanOutput).toContain("╝");
    });

    it("should be more compact than full banner", async () => {
      const { showBanner, showCompactBanner } = await import("../lib/banner.js");

      // Capture full banner
      showBanner();
      const fullOutput = consoleCapture.getAllOutput();
      consoleCapture.stop();

      // Capture compact banner
      consoleCapture = new ConsoleCapture();
      consoleCapture.start();
      showCompactBanner();
      const compactOutput = consoleCapture.getAllOutput();

      // Compact banner should have fewer lines
      const fullLines = fullOutput.split("\n").length;
      const compactLines = compactOutput.split("\n").length;

      expect(compactLines).toBeLessThan(fullLines);
    });
  });
});
