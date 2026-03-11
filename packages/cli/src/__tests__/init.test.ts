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
import {
  ConsoleCapture,
  mockEnv,
  containsText,
  mockSpinner,
  mockProcessExit,
} from "./test-utils.js";
import * as fs from "node:fs";
import * as readline from "node:readline/promises";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

// Mock readline
vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(),
}));

describe("Init Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: any;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    restoreEnv = mockEnv({});
    exitSpy = mockProcessExit();

    // Reset modules
    vi.resetModules();
    vi.clearAllMocks();

    // Default mock - directory doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("demo mode", () => {
    it("should enable demo mode with --demo flag", async () => {
      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--demo"]);

      const output = consoleCapture.getAllOutput();

      // Should show setup wizard header
      expect(containsText(output, "AgentSync Setup Wizard")).toBe(true);

      // Should show demo mode messages
      expect(containsText(output, "Setting up in DEMO MODE")).toBe(true);
      expect(containsText(output, "explore AgentSync features without credentials")).toBe(true);

      // Should show success
      expect(containsText(output, "Demo mode enabled")).toBe(true);
      expect(containsText(output, "Setup complete")).toBe(true);

      // Should show next steps
      expect(containsText(output, "Try these commands")).toBe(true);
      expect(containsText(output, "agentsync fleet list")).toBe(true);
    });

    it("should show how to switch to production mode", async () => {
      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--demo"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "agentsync demo off")).toBe(true);
    });
  });

  describe("production mode", () => {
    it("should prompt for Partner Tenant ID and Client ID", async () => {
      // Mock readline interface
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("partner-tenant-id") // Partner Tenant ID
        .mockResolvedValueOnce("partner-client-id") // Partner Client ID
        .mockResolvedValueOnce("n"); // Don't include sample

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      const output = consoleCapture.getAllOutput();

      // Should show setup wizard
      expect(containsText(output, "AgentSync Setup Wizard")).toBe(true);
      expect(containsText(output, "Let's set up your Partner Center credentials")).toBe(true);

      // Should prompt for credentials
      expect(mockQuestion).toHaveBeenCalledTimes(3);

      // Should show client secret instructions
      expect(containsText(output, "Client Secret")).toBe(true);
      expect(containsText(output, "AGENTSYNC_CLIENT_SECRET")).toBe(true);

      // Should close readline
      expect(mockRl.close).toHaveBeenCalled();
    });

    it("should create config file with credentials", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("n");

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      // Should create config file
      expect(fs.writeFileSync).toHaveBeenCalled();

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const configPath = writeCall[0];
      const configContent = writeCall[1] as string;

      // Check config path
      expect(configPath).toContain("config/tenants.yaml");

      // Check config content
      expect(configContent).toContain("AgentSync Configuration");
      expect(configContent).toContain("test-tenant-id");
      expect(configContent).toContain("test-client-id");
      expect(configContent).toContain("AGENTSYNC_CLIENT_SECRET");
    });

    it("should include sample tenant when requested", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("yes"); // Include sample

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const configContent = writeCall[1] as string;

      // Should include sample tenant
      expect(configContent).toContain("Sample Client");
      expect(configContent).toContain("sample.crm.dynamics.com");
      expect(configContent).toContain("production");
      expect(configContent).toContain("enterprise");
    });

    it("should not include sample tenant when declined", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("n"); // Don't include sample

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const configContent = writeCall[1] as string;

      // Should NOT include sample tenant
      expect(configContent).not.toContain("Sample Client");
      expect(configContent).toContain("Add your tenants here");
    });

    it("should create config directory if it does not exist", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("n");

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      // Should create directory
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("config"), {
        recursive: true,
      });
    });

    it("should show next steps after config creation", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("n");

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      const output = consoleCapture.getAllOutput();

      // Should show success
      expect(containsText(output, "Setup complete")).toBe(true);

      // Should show next steps
      expect(containsText(output, "Next steps")).toBe(true);
      expect(containsText(output, "client secret")).toBe(true);
      expect(containsText(output, "auth login")).toBe(true);
      expect(containsText(output, "agentsync tenants inspect")).toBe(true);
      expect(containsText(output, "agentsync demo on")).toBe(true);
    });

    it("should use custom config path when specified", async () => {
      const mockQuestion = vi
        .fn()
        .mockResolvedValueOnce("test-tenant-id")
        .mockResolvedValueOnce("test-client-id")
        .mockResolvedValueOnce("n");

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--config", "./custom/path.yaml"]);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const configPath = writeCall[0];

      expect(configPath).toContain("custom/path.yaml");
    });
  });

  describe("configuration options", () => {
    it("should use default config path", async () => {
      const { initCommand } = await import("../commands/init.js");

      const configOption = initCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should support --demo flag", async () => {
      const { initCommand } = await import("../commands/init.js");

      const demoOption = initCommand.options.find((opt) => opt.long === "--demo");
      expect(demoOption).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle readline errors gracefully", async () => {
      const mockQuestion = vi.fn().mockRejectedValueOnce(new Error("Readline error"));

      const mockRl = {
        question: mockQuestion,
        close: vi.fn(),
      };

      vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      try {
        await program.parseAsync(["node", "test", "init"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();

      // Should show error
      expect(containsText(output, "Setup failed")).toBe(true);
      expect(containsText(output, "Readline error")).toBe(true);

      // Should exit with error code
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { initCommand } = await import("../commands/init.js");

      expect(initCommand.description()).toContain("Initialize");
      expect(initCommand.description()).toContain("AgentSync");
    });
  });
});
