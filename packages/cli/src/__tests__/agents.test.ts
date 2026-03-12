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
  extractJson,
} from "./test-utils.js";
import { DEMO_SOLUTIONS } from "@agentsync/core";

// Mock ora to avoid spinner interference with console capture
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Agents Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Enable demo mode for tests
    restoreEnv = mockEnv({ DEMO_MODE: "true" });

    // Reset modules to get fresh command instance for each test
    vi.resetModules();
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("list command", () => {
    it("should list all solutions in demo mode", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show demo mode warning
      expect(containsText(output, "DEMO MODE")).toBe(true);

      // Should show all demo solutions
      DEMO_SOLUTIONS.forEach((solution) => {
        expect(containsText(cleanOutput, solution.uniqueName)).toBe(true);
      });

      // Should show count
      expect(containsText(cleanOutput, `Total: ${DEMO_SOLUTIONS.length} solutions`)).toBe(true);
    });

    it('should support "ls" alias', async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "ls"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should work the same as "list"
      expect(containsText(cleanOutput, `Total: ${DEMO_SOLUTIONS.length} solutions`)).toBe(true);
    });

    it("should show solutions in table format", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show solution names and versions
      expect(containsText(cleanOutput, DEMO_SOLUTIONS[0].uniqueName)).toBe(true);
      expect(containsText(cleanOutput, DEMO_SOLUTIONS[0].version)).toBe(true);
    });

    it("should show managed/unmanaged type", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show solution type
      expect(containsText(cleanOutput, "Managed") || containsText(cleanOutput, "Unmanaged")).toBe(
        true
      );
    });

    it("should output JSON when --json flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list", "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output - solutions list returns {solutions: [...], total: N}
      const json = extractJson<{ solutions: unknown[]; total: number }>(output);
      expect(json).not.toBeNull();
      expect(json!.solutions).toBeDefined();
      expect(json!.total).toBe(DEMO_SOLUTIONS.length);
    });

    it("should display table with correct headers", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should have table headers
      expect(containsText(cleanOutput, "Solution")).toBe(true);
      expect(containsText(cleanOutput, "Version")).toBe(true);
      expect(containsText(cleanOutput, "Type")).toBe(true);
      expect(containsText(cleanOutput, "Unique Name")).toBe(true);
    });
  });

  describe("show command", () => {
    it("should show agent details by name", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show agent details
      expect(containsText(cleanOutput, agent.uniqueName)).toBe(true);
      expect(containsText(cleanOutput, agent.friendlyName)).toBe(true);
      expect(containsText(cleanOutput, agent.version)).toBe(true);
      expect(containsText(cleanOutput, agent.category)).toBe(true);
      expect(containsText(cleanOutput, agent.publisherName)).toBe(true);
    });

    it("should show agent details by partial name", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      // Search for "Customer" which should match "CustomerServiceAgent"
      await program.parseAsync(["node", "test", "solutions", "show", "customer"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should find the agent
      const customerAgent = DEMO_SOLUTIONS.find((s) =>
        s.uniqueName.toLowerCase().includes("customer")
      );
      if (customerAgent) {
        expect(containsText(cleanOutput, customerAgent.uniqueName)).toBe(true);
      }
    });

    it("should show description", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show description section
      expect(containsText(cleanOutput, "Description:")).toBe(true);
    });

    it("should show capabilities", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show capabilities section
      expect(containsText(cleanOutput, "Capabilities:")).toBe(true);
    });

    it("should show dependencies", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show dependencies section
      expect(containsText(cleanOutput, "Dependencies:")).toBe(true);
    });

    it("should show tenant status when --tenants flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync([
        "node",
        "test",
        "solutions",
        "show",
        agent.uniqueName,
        "--tenants",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show tenant deployment status
      expect(containsText(cleanOutput, "Tenant Deployment Status")).toBe(true);
      expect(containsText(cleanOutput, "Tenant")).toBe(true);
      expect(containsText(cleanOutput, "Version")).toBe(true);
      expect(containsText(cleanOutput, "Status")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName, "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output
      const json = extractJson<{ uniqueName: string; version: string }>(output);
      expect(json).not.toBeNull();
      expect(json!.uniqueName).toBe(agent.uniqueName);
      expect(json!.version).toBe(agent.version);
    });

    it("should include tenant status in JSON when --tenants flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync([
        "node",
        "test",
        "solutions",
        "show",
        agent.uniqueName,
        "--tenants",
        "--json",
      ]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output
      const json = extractJson<{ uniqueName: string; tenantStatus: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.tenantStatus).toBeDefined();
      expect(Array.isArray(json!.tenantStatus)).toBe(true);
    });

    it("should handle agent not found", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      try {
        await program.parseAsync(["node", "test", "solutions", "show", "nonexistent-agent-xyz"]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show error message
      expect(containsText(cleanOutput, "not found")).toBe(true);
      // Should show available agents
      expect(containsText(cleanOutput, "Available agents:")).toBe(true);
    });
  });

  describe("output formatting", () => {
    it("should show solution count in output", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show total solutions count
      expect(cleanOutput).toMatch(/Total: \d+ solutions/);
    });
  });

  describe("drift command", () => {
    it("should show fleet-wide version drift summary", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show summary sections
      expect(containsText(cleanOutput, "Version Drift Summary")).toBe(true);
      expect(containsText(cleanOutput, "Tenants:")).toBe(true);
      expect(containsText(cleanOutput, "Current:")).toBe(true);
      expect(containsText(cleanOutput, "Per-Agent Status")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--json"]);

      const output = consoleCapture.getAllOutput();

      const json = extractJson<{ totalTenants: number; solutionSummary: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.totalTenants).toBeGreaterThan(0);
      expect(json!.solutionSummary).toBeDefined();
      expect(Array.isArray(json!.solutionSummary)).toBe(true);
    });

    it("should filter by agent name", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--agent", "customer"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show filtered results
      expect(containsText(cleanOutput, "Per-Agent Status")).toBe(true);
    });

    it("should show outdated tenants when --outdated flag is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--outdated"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show outdated tenants section
      expect(containsText(cleanOutput, "Outdated Tenants")).toBe(true);
    });

    it("should show tenant-specific status when --tenant is used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      // Use a partial tenant name to test the search
      await program.parseAsync(["node", "test", "solutions", "drift", "--tenant", "contoso"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show tenant-specific version status
      expect(containsText(cleanOutput, "Version Status")).toBe(true);
      expect(containsText(cleanOutput, "Agent")).toBe(true);
      expect(containsText(cleanOutput, "Expected")).toBe(true);
      expect(containsText(cleanOutput, "Deployed")).toBe(true);
      expect(containsText(cleanOutput, "Overall:")).toBe(true);
    });

    it("should output JSON for tenant when --tenant and --json are used", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
        "drift",
        "--tenant",
        "contoso",
        "--json",
      ]);

      const output = consoleCapture.getAllOutput();

      const json = extractJson<{ tenantId: string; tenantName: string; solutions: unknown[] }>(
        output
      );
      expect(json).not.toBeNull();
      expect(json!.tenantId).toBeDefined();
      expect(json!.tenantName).toBeDefined();
      expect(json!.solutions).toBeDefined();
    });

    it("should handle tenant not found", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "solutions",
          "drift",
          "--tenant",
          "nonexistent-tenant",
        ]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show error message
      expect(containsText(cleanOutput, "not found")).toBe(true);
    });
  });
});
