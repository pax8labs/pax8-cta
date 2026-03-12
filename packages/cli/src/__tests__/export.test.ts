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
import * as fs from "node:fs";

// Mock fs module
vi.mock("node:fs", () => ({
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Export Command (pack)", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Enable demo mode
    restoreEnv = mockEnv({ DEMO_MODE: "true" });

    // Reset modules
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("required options", () => {
    it("should have --solution as optional flag (positional arg preferred)", async () => {
      const { exportCommand } = await import("../commands/export.js");

      const solutionOption = exportCommand.options.find((opt) => opt.long === "--solution");
      expect(solutionOption).toBeDefined();
    });
  });

  describe("demo mode", () => {
    it("should show demo mode warning", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync(["node", "test", "export", "--solution", "TestAgent"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "Using mock data")).toBe(true);
    });

    it("should create agent package in demo mode", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync(["node", "test", "export", "--solution", "TestAgent"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Agent Package Packed")).toBe(true);
      expect(containsText(cleanOutput, "TestAgent")).toBe(true);
      expect(containsText(cleanOutput, "Version:")).toBe(true);
      expect(containsText(cleanOutput, "Type:")).toBe(true);
      expect(containsText(cleanOutput, "Package:")).toBe(true);
    });

    it("should create managed package by default", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync(["node", "test", "export", "--solution", "TestAgent"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Managed")).toBe(true);
    });

    it("should create unmanaged package when --unmanaged flag is used", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync([
        "node",
        "test",
        "export",
        "--solution",
        "TestAgent",
        "--unmanaged",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Unmanaged")).toBe(true);
    });

    it("should show usage hint after packing", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync(["node", "test", "export", "--solution", "TestAgent"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "agentsync deploy")).toBe(true);
    });

    it("should create output directory if it does not exist", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync(["node", "test", "export", "--solution", "TestAgent"]);

      // Should call mkdirSync to create directory
      expect(fs.mkdirSync).toHaveBeenCalled();
    });
  });

  describe("command name", () => {
    it('should have "export" as command name', async () => {
      const { exportCommand } = await import("../commands/export.js");

      expect(exportCommand.name()).toBe("export");
    });
  });

  describe("configuration", () => {
    it("should use default output directory if not specified", async () => {
      const { exportCommand } = await import("../commands/export.js");

      const outputOption = exportCommand.options.find((opt) => opt.long === "--output");
      expect(outputOption?.defaultValue).toBe("./agent packages");
    });

    it("should use default config path if not specified", async () => {
      const { exportCommand } = await import("../commands/export.js");

      const configOption = exportCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should support custom output directory", async () => {
      const { exportCommand } = await import("../commands/export.js");
      const program = new Command();
      program.addCommand(exportCommand);

      await program.parseAsync([
        "node",
        "test",
        "export",
        "--solution",
        "TestAgent",
        "--output",
        "./custom-output",
      ]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "custom-output")).toBe(true);
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { exportCommand } = await import("../commands/export.js");

      expect(exportCommand.description()).toContain("Export");
      expect(exportCommand.description()).toContain("solution");
    });
  });
});
