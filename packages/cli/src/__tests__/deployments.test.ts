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
import {
  ConsoleCapture,
  mockEnv,
  stripAnsi,
  containsText,
  mockSpinner,
  mockProcessExit,
  runCliExpectSuccess,
  extractJson,
} from "./test-utils.js";

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Deployments Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: ReturnType<typeof mockProcessExit>;

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

  describe("deployments list", () => {
    it("should have list subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      expect(listCommand).toBeDefined();
    });

    it("should have ls alias for list", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      expect(listCommand?.aliases()).toContain("ls");
    });

    it("should show demo mode warning", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "list"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
    });

    it("should display deployments table", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "list"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "ID")).toBe(true);
      expect(containsText(output, "Agent")).toBe(true);
      expect(containsText(output, "Status")).toBe(true);
      expect(containsText(output, "Progress")).toBe(true);
    });

    it("should show pagination info", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "list"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Showing")).toBe(true);
      expect(containsText(output, "of")).toBe(true);
    });

    describe("filtering", () => {
      it("should filter by status", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync(["node", "test", "deployments", "list", "--status", "failed"]);

        const output = consoleCapture.getAllOutput();
        const cleanOutput = stripAnsi(output);

        // Should only show failed deployments
        expect(cleanOutput).toContain("Failed");
        // Should not contain 'Completed' or 'In Progress' in status column
        const lines = cleanOutput.split("\n").filter((l) => l.includes("demo-hist"));
        lines.forEach((line) => {
          expect(line).toContain("Failed");
        });
      });

      it("should filter by agent name", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync(["node", "test", "deployments", "list", "--agent", "Sales"]);

        const output = consoleCapture.getAllOutput();
        const cleanOutput = stripAnsi(output);

        // Should only show SalesAssistant deployments
        expect(cleanOutput).toContain("SalesAssistant");
      });
    });

    describe("pagination", () => {
      it("should respect --limit option", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync(["node", "test", "deployments", "list", "--limit", "5"]);

        const output = consoleCapture.getAllOutput();
        expect(containsText(output, "Showing 1-5")).toBe(true);
      });

      it("should respect --offset option", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync([
          "node",
          "test",
          "deployments",
          "list",
          "--limit",
          "5",
          "--offset",
          "10",
        ]);

        const output = consoleCapture.getAllOutput();
        expect(containsText(output, "Showing 11-15")).toBe(true);
      });
    });

    describe("JSON output", () => {
      it("should output JSON when --json flag is used", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync(["node", "test", "deployments", "list", "--json", "--limit", "3"]);

        const output = consoleCapture.getAllOutput();
        const json = extractJson(output) as any;

        // Standardized envelope (#465): data[] rows, pagination under summary.
        expect(json).toBeDefined();
        expect(json.meta.command).toBe("deployments list");
        expect(json).toHaveProperty("data");
        expect(json).toHaveProperty("summary");
        expect(json.data).toHaveLength(3);
      });

      it("should include pagination info in JSON output", async () => {
        const { deploymentsCommand } = await import("../commands/deployments/index.js");
        const program = new Command();
        program.addCommand(deploymentsCommand);

        await program.parseAsync([
          "node",
          "test",
          "deployments",
          "list",
          "--json",
          "--limit",
          "5",
          "--offset",
          "10",
        ]);

        const output = consoleCapture.getAllOutput();
        const json = extractJson(output) as any;

        expect(json.summary.limit).toBe(5);
        expect(json.summary.offset).toBe(10);
        expect(json.summary).toHaveProperty("total");
        expect(json.summary).toHaveProperty("hasMore");
      });
    });
  });

  describe("deployments show", () => {
    it("should have show subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const showCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "show");
      expect(showCommand).toBeDefined();
    });

    it("should display deployment details", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "show", "demo-hist-001"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Deployment Details")).toBe(true);
      expect(containsText(output, "demo-hist-001")).toBe(true);
      expect(containsText(output, "SalesAssistant")).toBe(true);
    });

    it("should show tenant results", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "show", "demo-hist-001"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Tenant Results")).toBe(true);
      expect(containsText(output, "Contoso")).toBe(true);
    });

    it("should handle non-existent deployment", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync(["node", "test", "deployments", "show", "non-existent-id"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "not found")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should output JSON when --json flag is used", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "show", "demo-hist-001", "--json"]);

      const output = consoleCapture.getAllOutput();
      const json = extractJson(output) as any;

      expect(json).toBeDefined();
      expect(json.id).toBe("demo-hist-001");
      expect(json.solutionName).toBe("SalesAssistant");
      expect(json.tenantResults).toBeDefined();
    });
  });

  describe("command options", () => {
    it("should have --status option", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const statusOption = listCommand?.options.find((opt) => opt.long === "--status");
      expect(statusOption).toBeDefined();
    });

    it("should have --tenant option", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const tenantOption = listCommand?.options.find((opt) => opt.long === "--tenant");
      expect(tenantOption).toBeDefined();
    });

    it("should have --agent option", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const agentOption = listCommand?.options.find((opt) => opt.long === "--agent");
      expect(agentOption).toBeDefined();
    });

    it("should have --limit option with default value", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const limitOption = listCommand?.options.find((opt) => opt.long === "--limit");
      expect(limitOption).toBeDefined();
      expect(limitOption?.defaultValue).toBe("20");
    });

    it("should have --offset option with default value", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const offsetOption = listCommand?.options.find((opt) => opt.long === "--offset");
      expect(offsetOption).toBeDefined();
      expect(offsetOption?.defaultValue).toBe("0");
    });

    it("should have --json option", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const jsonOption = listCommand?.options.find((opt) => opt.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("should have --since option", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");

      const listCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "list");
      const sinceOption = listCommand?.options.find((opt) => opt.long === "--since");
      expect(sinceOption).toBeDefined();
    });
  });
});

describe("Deployments Integration Tests", () => {
  it("should list deployments via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "list", "--limit", "5"]);

    expect(containsText(result.output, "DEMO MODE")).toBe(true);
    expect(containsText(result.output, "demo-hist")).toBe(true);
  });

  it("should filter by status via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "list", "--status", "failed"]);

    const cleanOutput = stripAnsi(result.output);
    // Subprocess stdout is piped (non-TTY) so output defaults to JSON.
    // Check the status value as it appears in JSON ("failed" lowercase).
    expect(cleanOutput).toContain("failed");
  });

  it("should output JSON via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "list", "--json", "--limit", "3"]);

    const json = extractJson(result.output) as any;
    expect(json.data).toBeDefined();
    expect(json.data.length).toBeLessThanOrEqual(3);
  });

  it("should show deployment details via CLI", async () => {
    // Pass --json since piped stdout defaults to JSON format.
    const result = await runCliExpectSuccess(["deployments", "show", "demo-hist-000", "--json"]);

    expect(containsText(result.output, "demo-hist-000")).toBe(true);
    const json = extractJson(result.output) as any;
    expect(json).not.toBeNull();
    expect(json.id).toBe("demo-hist-000");
  });

  it("should parse deployment table correctly", async () => {
    // Pass --json since piped stdout defaults to JSON format.
    const result = await runCliExpectSuccess(["deployments", "list", "--json", "--limit", "5"]);

    const json = extractJson(result.output) as any;
    expect(json).not.toBeNull();
    expect(json.data).toBeDefined();
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.length).toBeLessThanOrEqual(5);
    // Verify expected keys are present in the JSON shape
    const firstDeploy = json.data[0];
    expect(firstDeploy).toHaveProperty("id");
    expect(firstDeploy).toHaveProperty("solutionName");
    expect(firstDeploy).toHaveProperty("status");
  });
});
