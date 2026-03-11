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
  stripAnsi,
  containsText,
  mockSpinner,
  mockProcessExit,
} from "./test-utils.js";
import { DEMO_TENANTS } from "@agentsync/core";

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Deploy Command (ship)", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: any;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Enable demo mode
    restoreEnv = mockEnv({ DEMO_MODE: "true" });
    exitSpy = mockProcessExit();

    // Reset modules
    vi.resetModules();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("required options", () => {
    it("should have --solution as required option", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const solutionOption = deployCommand.options.find((opt) => opt.long === "--solution");
      expect(solutionOption).toBeDefined();
      expect(solutionOption?.required).toBe(true);
    });

    it("should error when neither --all nor --tag is specified", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      try {
        await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Must specify --all or --tag")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("demo mode - ship to all", () => {
    it("should show demo mode warning", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "Showing preview")).toBe(true);
    });

    it("should list all enabled destinations", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show "Shipping Destinations"
      expect(containsText(cleanOutput, "Shipping Destinations")).toBe(true);

      // Should show count of enabled tenants
      const enabledCount = DEMO_TENANTS.filter((t) => t.enabled).length;
      expect(containsText(cleanOutput, `(${enabledCount})`)).toBe(true);
    });

    it("should generate shipment tracking ID", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Shipment dispatched successfully")).toBe(true);
      expect(containsText(cleanOutput, "Tracking #:")).toBe(true);
      expect(containsText(cleanOutput, "dep-demo-")).toBe(true);
    });

    it("should show shipment details", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Shipment Details")).toBe(true);
      expect(containsText(cleanOutput, "Package:")).toBe(true);
      expect(containsText(cleanOutput, "Destinations:")).toBe(true);
    });

    it("should show tracking hint", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "agentsync track --shipment")).toBe(true);
    });

    it("should show demo mode disclaimer", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "no actual deployment occurs")).toBe(true);
    });
  });

  describe("demo mode - ship by tags", () => {
    it("should filter destinations by tag", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync([
        "node",
        "test",
        "ship",
        "--solution",
        "./test.zip",
        "--tag",
        "enterprise",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show only enterprise tenants
      const enterpriseTenants = DEMO_TENANTS.filter(
        (t) => t.enabled && t.tags?.includes("enterprise")
      );

      expect(containsText(cleanOutput, `(${enterpriseTenants.length})`)).toBe(true);
    });

    it("should support multiple tags", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync([
        "node",
        "test",
        "ship",
        "--solution",
        "./test.zip",
        "--tag",
        "enterprise",
        "smb",
      ]);

      const output = consoleCapture.getAllOutput();

      // Should show shipment dispatched
      expect(containsText(output, "Shipment dispatched successfully")).toBe(true);
    });

    it("should error when no destinations match tags", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "ship",
          "--solution",
          "./test.zip",
          "--tag",
          "nonexistent-tag",
        ]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "No destinations matched")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("option aliases", () => {
    it('should accept "ship" as alias for "deploy"', async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      expect(deployCommand.aliases()).toContain("ship");
    });

    it("should accept --agentPackage as alias for --solution", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const agentPackageOption = deployCommand.options.find((opt) => opt.long === "--agentPackage");
      expect(agentPackageOption).toBeDefined();
    });
  });

  describe("configuration options", () => {
    it("should support --dry-run flag", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const dryRunOption = deployCommand.options.find((opt) => opt.long === "--dry-run");
      expect(dryRunOption).toBeDefined();
    });

    it("should use default config path", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const configOption = deployCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should use default redis URL", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const redisOption = deployCommand.options.find((opt) => opt.long === "--redis");
      expect(redisOption?.defaultValue).toBe("redis://localhost:6379");
    });

    it("should support --managed flag", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const managedOption = deployCommand.options.find((opt) => opt.long === "--managed");
      expect(managedOption).toBeDefined();
    });

    it("should support --unmanaged flag", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const unmanagedOption = deployCommand.options.find((opt) => opt.long === "--unmanaged");
      expect(unmanagedOption).toBeDefined();
    });

    it("should support --keep-package flag", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const keepPackageOption = deployCommand.options.find((opt) => opt.long === "--keep-package");
      expect(keepPackageOption).toBeDefined();
    });

    it("should support --package-dir option", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      const packageDirOption = deployCommand.options.find((opt) => opt.long === "--package-dir");
      expect(packageDirOption).toBeDefined();
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { deployCommand } = await import("../commands/deploy.js");

      expect(deployCommand.description()).toContain("agent packages");
      expect(deployCommand.description()).toContain("tenants");
    });
  });

  describe("demo mode - solution name vs file path", () => {
    it("should detect and handle solution name in demo mode", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync([
        "node",
        "test",
        "ship",
        "--solution",
        "CustomerServiceAgent",
        "--all",
      ]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Export Simulation")).toBe(true);
      expect(containsText(output, "CustomerServiceAgent")).toBe(true);
      expect(containsText(output, "Managed")).toBe(true);
    });

    it("should detect and handle file path in demo mode", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      // Should NOT show export simulation for file paths
      expect(containsText(output, "Export Simulation")).toBe(false);
      expect(containsText(output, "Shipment dispatched successfully")).toBe(true);
    });

    it("should show unmanaged type when --unmanaged flag is used", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync([
        "node",
        "test",
        "ship",
        "--solution",
        "TestAgent",
        "--unmanaged",
        "--all",
      ]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Export Simulation")).toBe(true);
      expect(containsText(output, "Unmanaged")).toBe(true);
    });

    it("should show exported indicator in package details for solution names", async () => {
      const { deployCommand } = await import("../commands/deploy.js");
      const program = new Command();
      program.addCommand(deployCommand);

      await program.parseAsync(["node", "test", "ship", "--solution", "TestAgent", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "TestAgent (exported)")).toBe(true);
    });
  });
});
