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
import { ConsoleCapture, mockEnv, containsText, mockProcessExit } from "./test-utils.js";
import * as fs from "node:fs";

// Mock fs and os modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/tmp/test-home"),
}));

describe("Demo Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: any;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Mock environment
    restoreEnv = mockEnv({});

    // Mock process.exit
    exitSpy = mockProcessExit();

    // Reset modules to get fresh command instance
    vi.resetModules();

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock behavior - config file doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("toggle action (default)", () => {
    it("should enable demo mode when currently disabled", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      // Config file doesn't exist (demo mode disabled)
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await program.parseAsync(["node", "test", "demo"]);

      const output = consoleCapture.getAllOutput();

      // Should show enabled message
      expect(containsText(output, "Demo mode enabled")).toBe(true);
      expect(containsText(output, "You can now use all commands without credentials")).toBe(true);
      expect(containsText(output, "agentsync tenants list")).toBe(true);

      // Should write config
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/tmp/test-home/.agentsync/cli-config.json",
        expect.stringContaining('"demoMode": true')
      );
    });

    it("should disable demo mode when currently enabled", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      // Config file exists with demo mode enabled
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"demoMode": true}');

      await program.parseAsync(["node", "test", "demo"]);

      const output = consoleCapture.getAllOutput();

      // Should show disabled message
      expect(containsText(output, "Demo mode disabled")).toBe(true);
      expect(containsText(output, "Real credentials required")).toBe(true);
      expect(containsText(output, "agentsync init")).toBe(true);

      // Should write config
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/tmp/test-home/.agentsync/cli-config.json",
        expect.stringContaining('"demoMode": false')
      );
    });

    it("should create config directory if it does not exist", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      // Config directory doesn't exist
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // Config dir doesn't exist, but we'll create it
        return path.toString().endsWith("cli-config.json") ? false : false;
      });

      await program.parseAsync(["node", "test", "demo"]);

      // Should create directory
      expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/test-home/.agentsync", { recursive: true });
    });
  });

  describe("on/enable action", () => {
    it('should enable demo mode with "on" action', async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      await program.parseAsync(["node", "test", "demo", "on"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Demo mode enabled")).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/tmp/test-home/.agentsync/cli-config.json",
        expect.stringContaining('"demoMode": true')
      );
    });

    it('should enable demo mode with "enable" action', async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      await program.parseAsync(["node", "test", "demo", "enable"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Demo mode enabled")).toBe(true);
    });
  });

  describe("off/disable action", () => {
    it('should disable demo mode with "off" action', async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      await program.parseAsync(["node", "test", "demo", "off"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Demo mode disabled")).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/tmp/test-home/.agentsync/cli-config.json",
        expect.stringContaining('"demoMode": false')
      );
    });

    it('should disable demo mode with "disable" action', async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      await program.parseAsync(["node", "test", "demo", "disable"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Demo mode disabled")).toBe(true);
    });
  });

  describe("status action", () => {
    it("should show enabled status when demo mode is on", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      // Config file exists with demo mode enabled
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"demoMode": true}');

      await program.parseAsync(["node", "test", "demo", "status"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Status: ENABLED")).toBe(true);
      expect(containsText(output, "agentsync demo off")).toBe(true);

      // Should NOT write config
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("should show disabled status when demo mode is off", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      // Config file doesn't exist (demo mode disabled)
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await program.parseAsync(["node", "test", "demo", "status"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Status: DISABLED")).toBe(true);
      expect(containsText(output, "agentsync demo on")).toBe(true);

      // Should NOT write config
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("invalid action", () => {
    it("should show error for unknown action", async () => {
      const { demoCommand } = await import("../commands/demo.js");
      const program = new Command();
      program.addCommand(demoCommand);

      try {
        await program.parseAsync(["node", "test", "demo", "invalid"]);
      } catch (error: any) {
        // Expected to throw due to process.exit
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Unknown action: invalid")).toBe(true);
      expect(containsText(output, "Valid actions: on, off, status, toggle")).toBe(true);

      // Should call process.exit(1)
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("isDemoModeEnabled helper", () => {
    it("should return true when DEMO_MODE env var is set", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ DEMO_MODE: "true" });

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      expect(isDemoModeEnabled()).toBe(true);
    });

    it("should return true when config file has demoMode: true", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"demoMode": true}');

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      expect(isDemoModeEnabled()).toBe(true);
    });

    it("should return false when config file has demoMode: false", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"demoMode": false}');

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      expect(isDemoModeEnabled()).toBe(false);
    });

    it("should return false when config file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      expect(isDemoModeEnabled()).toBe(false);
    });

    it("should return false when config file is corrupted", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("invalid json{");

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      expect(isDemoModeEnabled()).toBe(false);
    });

    it("should prioritize DEMO_MODE env var over config file", async () => {
      restoreEnv();
      restoreEnv = mockEnv({ DEMO_MODE: "true" });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{"demoMode": false}');

      const { isDemoModeEnabled } = await import("../commands/demo.js");

      // Should return true from env var, not false from config
      expect(isDemoModeEnabled()).toBe(true);
    });
  });
});
