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
    it("should list all agents in demo mode", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show demo mode warning
      expect(containsText(output, "DEMO MODE")).toBe(true);

      // Should show all demo agents
      DEMO_SOLUTIONS.forEach((solution) => {
        expect(containsText(cleanOutput, solution.uniqueName)).toBe(true);
      });

      // Should show count
      expect(containsText(cleanOutput, `${DEMO_SOLUTIONS.length} agents available`)).toBe(true);
    });

    it('should support "ls" alias', async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "ls"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should work the same as "list"
      expect(containsText(cleanOutput, `${DEMO_SOLUTIONS.length} agents available`)).toBe(true);
    });

    it("should filter by tag", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      // Filter by "production" tag
      await program.parseAsync(["node", "test", "agents", "list", "--tag", "production"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show filtered count
      const filtered = DEMO_SOLUTIONS.filter((s) =>
        s.tags.some((t) => t.toLowerCase().includes("production"))
      );
      expect(containsText(cleanOutput, `${filtered.length} agents available`)).toBe(true);
    });

    it("should filter by category", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      // Filter by "Customer Service" category
      await program.parseAsync([
        "node",
        "test",
        "agents",
        "list",
        "--category",
        "Customer Service",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show filtered count
      const filtered = DEMO_SOLUTIONS.filter((s) =>
        s.category.toLowerCase().includes("customer service")
      );
      expect(containsText(cleanOutput, `${filtered.length} agents available`)).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "list", "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output
      const json = extractJson<unknown[]>(output);
      expect(json).not.toBeNull();
      expect(Array.isArray(json)).toBe(true);
      expect(json!.length).toBe(DEMO_SOLUTIONS.length);
    });

    it("should display table with correct headers", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should have table headers
      expect(containsText(cleanOutput, "Agent")).toBe(true);
      expect(containsText(cleanOutput, "Version")).toBe(true);
      expect(containsText(cleanOutput, "Category")).toBe(true);
      expect(containsText(cleanOutput, "Tags")).toBe(true);
      expect(containsText(cleanOutput, "Last Published")).toBe(true);
    });
  });

  describe("show command", () => {
    it("should show agent details by name", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName]);

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
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      // Search for "Customer" which should match "CustomerServiceAgent"
      await program.parseAsync(["node", "test", "agents", "show", "customer"]);

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
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show description section
      expect(containsText(cleanOutput, "Description:")).toBe(true);
    });

    it("should show capabilities", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show capabilities section
      expect(containsText(cleanOutput, "Capabilities:")).toBe(true);
    });

    it("should show dependencies", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show dependencies section
      expect(containsText(cleanOutput, "Dependencies:")).toBe(true);
    });

    it("should show tenant status when --tenants flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName, "--tenants"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show tenant deployment status
      expect(containsText(cleanOutput, "Tenant Deployment Status")).toBe(true);
      expect(containsText(cleanOutput, "Tenant")).toBe(true);
      expect(containsText(cleanOutput, "Version")).toBe(true);
      expect(containsText(cleanOutput, "Status")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "agents", "show", agent.uniqueName, "--json"]);

      const output = consoleCapture.getAllOutput();

      // Extract JSON from output
      const json = extractJson<{ uniqueName: string; version: string }>(output);
      expect(json).not.toBeNull();
      expect(json!.uniqueName).toBe(agent.uniqueName);
      expect(json!.version).toBe(agent.version);
    });

    it("should include tenant status in JSON when --tenants flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync([
        "node",
        "test",
        "agents",
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
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      try {
        await program.parseAsync(["node", "test", "agents", "show", "nonexistent-agent-xyz"]);
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
    it("should format time ago correctly", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "list"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show time ago (d ago, h ago, m ago, etc.)
      expect(cleanOutput).toMatch(/\d+[dhms] ago|just now/);
    });
  });

  describe("drift command", () => {
    it("should show fleet-wide version drift summary", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show summary sections
      expect(containsText(cleanOutput, "Version Drift Summary")).toBe(true);
      expect(containsText(cleanOutput, "Tenants:")).toBe(true);
      expect(containsText(cleanOutput, "Current:")).toBe(true);
      expect(containsText(cleanOutput, "Per-Agent Status")).toBe(true);
    });

    it("should output JSON when --json flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--json"]);

      const output = consoleCapture.getAllOutput();

      const json = extractJson<{ totalTenants: number; solutionSummary: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.totalTenants).toBeGreaterThan(0);
      expect(json!.solutionSummary).toBeDefined();
      expect(Array.isArray(json!.solutionSummary)).toBe(true);
    });

    it("should filter by agent name", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--agent", "customer"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show filtered results
      expect(containsText(cleanOutput, "Per-Agent Status")).toBe(true);
    });

    it("should show outdated tenants when --outdated flag is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--outdated"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show outdated tenants section
      expect(containsText(cleanOutput, "Outdated Tenants")).toBe(true);
    });

    it("should show tenant-specific status when --tenant is used", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      // Use a partial tenant name to test the search
      await program.parseAsync(["node", "test", "agents", "drift", "--tenant", "contoso"]);

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
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "agents",
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
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "agents",
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

  describe("drift fix command", () => {
    it("should show drift fix plan with --fix --dry-run", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "agents",
        "drift",
        "--fix",
        "--dry-run",
        "--force",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show either the fix plan or indicate all tenants are current
      const hasPlan = containsText(cleanOutput, "Drift Fix Plan:");
      const allCurrent = containsText(cleanOutput, "up to date");
      expect(hasPlan || allCurrent).toBe(true);

      // If there's a plan, it should indicate dry-run
      if (hasPlan) {
        expect(containsText(cleanOutput, "--dry-run")).toBe(true);
      }
    });

    it("should show risk labels in fix plan", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--fix", "--dry-run"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should include risk labels
      expect(cleanOutput).toMatch(/low risk|medium risk|high risk/);
    });

    it("should skip high-risk tenants by default", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--fix", "--dry-run"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // With default max-risk=low, medium and high risk tenants should be SKIPPED
      if (cleanOutput.includes("medium risk") || cleanOutput.includes("high risk")) {
        expect(cleanOutput).toMatch(/SKIPPED/);
      }
    });

    it("should include medium-risk tenants with --max-risk medium", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "agents",
        "drift",
        "--fix",
        "--dry-run",
        "--max-risk",
        "medium",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show fix plan
      expect(containsText(cleanOutput, "Drift Fix Plan:")).toBe(true);
      // Medium risk tenants should be included not skipped
      if (cleanOutput.includes("medium risk")) {
        expect(cleanOutput).toMatch(/medium risk -- included/);
      }
    });

    it("should include all tenants with --force", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "agents",
        "drift",
        "--fix",
        "--dry-run",
        "--force",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should not show any SKIPPED entries
      expect(containsText(cleanOutput, "SKIPPED")).toBe(false);
      expect(containsText(cleanOutput, "Drift Fix Plan:")).toBe(true);
    });

    it("should execute fix with --yes flag", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--fix", "--yes", "--force"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show either results summary or indicate all tenants are current
      const hasResults = containsText(cleanOutput, "Results:");
      const allCurrent = containsText(cleanOutput, "up to date");
      expect(hasResults || allCurrent).toBe(true);

      if (hasResults) {
        expect(containsText(cleanOutput, "Updated:")).toBe(true);
      }
    });

    it("should filter to specific tenant with --tenant", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync([
        "node",
        "test",
        "agents",
        "drift",
        "--fix",
        "--dry-run",
        "--tenant",
        "contoso",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should either show a plan for Contoso or say all up to date
      expect(
        containsText(cleanOutput, "Drift Fix Plan:") || containsText(cleanOutput, "up to date")
      ).toBe(true);
    });

    it("should output JSON with --fix --json", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      await program.parseAsync(["node", "test", "agents", "drift", "--fix", "--json", "--force"]);

      const output = consoleCapture.getAllOutput();
      const json = extractJson<{ plan: unknown[]; willFix: string[]; maxRisk: string }>(output);

      // Might be null if all tenants are current
      if (json) {
        expect(json.plan).toBeDefined();
        expect(json.willFix).toBeDefined();
        expect(json.maxRisk).toBe("high");
      }
    });

    it("should handle tenant not found with --fix --tenant", async () => {
      const { agentsCommand } = await import("../commands/agents/index.js");
      const program = new Command();
      program.addCommand(agentsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "agents",
          "drift",
          "--fix",
          "--tenant",
          "nonexistent-tenant",
        ]);
      } catch {
        // Expected to throw due to process.exit
      }

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "not found")).toBe(true);
    });
  });

  describe("drift risk calculation", () => {
    it("should calculate risk levels correctly", async () => {
      const { buildDriftFixPlan } = await import("../commands/agents/drift.js");
      const { getDemoTenantVersionStatus, DEMO_TENANTS } = await import("@agentsync/core");

      const enabledTenants = DEMO_TENANTS.filter((t) => t.enabled);
      const tenantStatuses = enabledTenants.map((tenant) => ({
        tenant,
        status: getDemoTenantVersionStatus(tenant.tenantId)!,
      }));

      const plan = buildDriftFixPlan(tenantStatuses);

      // Each entry should have a valid risk level
      for (const entry of plan) {
        expect(["low", "medium", "high"]).toContain(entry.risk);
        expect(entry.outdatedSolutions.length).toBeGreaterThan(0);
      }

      // Plan should be sorted by risk (low first)
      const riskOrder = { low: 0, medium: 1, high: 2 };
      for (let i = 1; i < plan.length; i++) {
        expect(riskOrder[plan[i].risk]).toBeGreaterThanOrEqual(riskOrder[plan[i - 1].risk]);
      }
    });

    it("should classify not_deployed as high risk", async () => {
      const { calculateDriftRisk } = await import("../commands/agents/drift.js");

      const status = {
        tenantId: "test",
        tenantName: "Test",
        environmentUrl: "https://test.crm.dynamics.com",
        solutions: [
          {
            uniqueName: "TestAgent",
            friendlyName: "Test Agent",
            expectedVersion: "1.0.0.5",
            deployedVersion: null,
            isManaged: true,
            status: "not_deployed" as const,
            versionDrift: 0,
          },
        ],
        overallStatus: "outdated" as const,
        lastChecked: new Date().toISOString(),
      };

      expect(calculateDriftRisk(status)).toBe("high");
    });

    it("should classify 1-version drift as low risk", async () => {
      const { calculateDriftRisk } = await import("../commands/agents/drift.js");

      const status = {
        tenantId: "test",
        tenantName: "Test",
        environmentUrl: "https://test.crm.dynamics.com",
        solutions: [
          {
            uniqueName: "TestAgent",
            friendlyName: "Test Agent",
            expectedVersion: "1.0.0.5",
            deployedVersion: "1.0.0.4",
            isManaged: true,
            status: "outdated" as const,
            versionDrift: -1,
          },
        ],
        overallStatus: "outdated" as const,
        lastChecked: new Date().toISOString(),
      };

      expect(calculateDriftRisk(status)).toBe("low");
    });

    it("should classify 2-version drift as medium risk", async () => {
      const { calculateDriftRisk } = await import("../commands/agents/drift.js");

      const status = {
        tenantId: "test",
        tenantName: "Test",
        environmentUrl: "https://test.crm.dynamics.com",
        solutions: [
          {
            uniqueName: "TestAgent",
            friendlyName: "Test Agent",
            expectedVersion: "1.0.0.5",
            deployedVersion: "1.0.0.3",
            isManaged: true,
            status: "outdated" as const,
            versionDrift: -2,
          },
        ],
        overallStatus: "outdated" as const,
        lastChecked: new Date().toISOString(),
      };

      expect(calculateDriftRisk(status)).toBe("medium");
    });
  });
});
