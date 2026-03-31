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
  runCliExpectFailure,
  parseTable,
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
        const json = extractJson(output);

        expect(json).toBeDefined();
        expect(json).toHaveProperty("deployments");
        expect(json).toHaveProperty("pagination");
        expect((json as any).deployments).toHaveLength(3);
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

        expect(json.pagination.limit).toBe(5);
        expect(json.pagination.offset).toBe(10);
        expect(json.pagination).toHaveProperty("total");
        expect(json.pagination).toHaveProperty("hasMore");
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

describe("Deployments Lifecycle Commands", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();
    restoreEnv = mockEnv({ DEMO_MODE: "true" });
    mockProcessExit();
    vi.resetModules();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("deployments approve", () => {
    it("should have approve subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const approveCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "approve");
      expect(approveCommand).toBeDefined();
    });

    it("should show not-implemented warning in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync(["node", "test", "deployments", "approve", "demo-hist-001"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(2)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "not yet implemented")).toBe(true);
    });
  });

  describe("deployments reject", () => {
    it("should have reject subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const rejectCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "reject");
      expect(rejectCommand).toBeDefined();
    });

    it("should show not-implemented warning in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync(["node", "test", "deployments", "reject", "demo-hist-001"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(2)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "not yet implemented")).toBe(true);
    });

    it("should show reason when provided", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "deployments",
          "reject",
          "demo-hist-001",
          "--reason",
          "Missing QA approval",
        ]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(2)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Missing QA approval")).toBe(true);
    });
  });

  describe("deployments cancel", () => {
    it("should have cancel subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const cancelCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "cancel");
      expect(cancelCommand).toBeDefined();
    });

    it("should cancel deployment in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "cancel", "demo-hist-001"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "cancelled")).toBe(true);
    });
  });

  describe("deployments retry", () => {
    it("should have retry subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const retryCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "retry");
      expect(retryCommand).toBeDefined();
    });

    it("should retry deployment in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "retry", "demo-hist-001"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "Retrying")).toBe(true);
    });

    it("should show tenant-specific retry when specified", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "deployments",
        "retry",
        "demo-hist-001",
        "--tenant",
        "contoso",
      ]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "contoso")).toBe(true);
    });
  });

  describe("deployments rollback", () => {
    it("should have rollback subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const rollbackCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "rollback");
      expect(rollbackCommand).toBeDefined();
    });

    it("should show not-implemented warning in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync(["node", "test", "deployments", "rollback", "demo-hist-001"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(2)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "not yet implemented")).toBe(true);
    });
  });

  describe("deployments watch", () => {
    it("should have watch subcommand", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const watchCommand = deploymentsCommand.commands.find((cmd) => cmd.name() === "watch");
      expect(watchCommand).toBeDefined();
    });

    it("should watch deployment in demo mode", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      await program.parseAsync(["node", "test", "deployments", "watch", "demo-hist-001"]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "Deployment Details")).toBe(true);
    });

    it("should handle non-existent deployment in watch", async () => {
      const { deploymentsCommand } = await import("../commands/deployments/index.js");
      const program = new Command();
      program.addCommand(deploymentsCommand);

      try {
        await program.parseAsync(["node", "test", "deployments", "watch", "non-existent-id"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "not found")).toBe(true);
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
    expect(cleanOutput).toContain("Failed");
  });

  it("should output JSON via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "list", "--json", "--limit", "3"]);

    const json = extractJson(result.output) as any;
    expect(json.deployments).toBeDefined();
    expect(json.deployments.length).toBeLessThanOrEqual(3);
  });

  it("should show deployment details via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "show", "demo-hist-000"]);

    expect(containsText(result.output, "Deployment Details")).toBe(true);
    expect(containsText(result.output, "demo-hist-000")).toBe(true);
  });

  it("should parse deployment table correctly", async () => {
    const result = await runCliExpectSuccess(["deployments", "list", "--limit", "5"]);
    const table = parseTable(result.stdout);

    expect(table.headers).toContain("ID");
    expect(table.headers).toContain("Agent");
    expect(table.headers).toContain("Status");
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it("should show approve not-implemented via CLI", async () => {
    const result = await runCliExpectFailure(["deployments", "approve", "demo-hist-001"]);
    expect(containsText(result.output, "not yet implemented")).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("should show reject not-implemented via CLI", async () => {
    const result = await runCliExpectFailure([
      "deployments",
      "reject",
      "demo-hist-001",
      "--reason",
      "Test rejection",
    ]);
    expect(containsText(result.output, "not yet implemented")).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("should cancel deployment via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "cancel", "demo-hist-001"]);
    expect(containsText(result.output, "cancelled")).toBe(true);
  });

  it("should retry deployment via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "retry", "demo-hist-001"]);
    expect(containsText(result.output, "Retrying")).toBe(true);
  });

  it("should show rollback not-implemented via CLI", async () => {
    const result = await runCliExpectFailure(["deployments", "rollback", "demo-hist-001"]);
    expect(containsText(result.output, "not yet implemented")).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("should watch deployment via CLI", async () => {
    const result = await runCliExpectSuccess(["deployments", "watch", "demo-hist-001"]);
    expect(containsText(result.output, "DEMO MODE")).toBe(true);
    expect(containsText(result.output, "demo-hist-001")).toBe(true);
  });

  it("should reject watch outside demo mode with an OSS message", async () => {
    const result = await runCliExpectFailure(["deployments", "watch", "demo-hist-001"], {
      env: { DEMO_MODE: "false" },
    });

    expect(result.exitCode).toBe(2);
    expect(containsText(result.output, "open-source CLI")).toBe(true);
  });

  it("should show rollback not-implemented for any ID via CLI", async () => {
    const result = await runCliExpectFailure(["deployments", "rollback", "nonexistent-id"]);
    expect(containsText(result.output, "not yet implemented")).toBe(true);
    expect(result.exitCode).toBe(2);
  });

  it("should handle watch not found via CLI", async () => {
    const result = await runCliExpectFailure(["deployments", "watch", "nonexistent-id"]);
    expect(containsText(result.output, "not found")).toBe(true);
  });

  it("should hide queue-only actions from help", async () => {
    const result = await runCliExpectSuccess(["deployments", "--help"]);

    expect(containsText(result.output, "watch")).toBe(false);
    expect(containsText(result.output, "cancel")).toBe(false);
    expect(containsText(result.output, "retry")).toBe(false);
    expect(containsText(result.output, "approve")).toBe(false);
    expect(containsText(result.output, "reject")).toBe(false);
    expect(containsText(result.output, "rollback")).toBe(false);
  });
});
