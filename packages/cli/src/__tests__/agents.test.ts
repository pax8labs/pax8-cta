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
  extractJson,
} from "./test-utils.js";
import { DEMO_SOLUTIONS } from "@pax8/cta-core";

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
      // Issue #406: solutions show now emits a structured envelope with
      // `name`, `displayName`, `latestVersion`, and `summary` keys.
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const agent = DEMO_SOLUTIONS[0];
      await program.parseAsync(["node", "test", "solutions", "show", agent.uniqueName, "--json"]);

      const output = consoleCapture.getAllOutput();

      const json = extractJson<{
        name: string;
        displayName: string;
        latestVersion: string;
        summary: { totalTenants: number };
      }>(output);
      expect(json).not.toBeNull();
      expect(json!.name).toBe(agent.uniqueName);
      expect(json!.displayName).toBe(agent.friendlyName);
      expect(json!.latestVersion).toBe(agent.version);
      expect(json!.summary).toBeTruthy();
      expect(typeof json!.summary.totalTenants).toBe("number");
    });

    it("should include tenant status in JSON when --tenants flag is used", async () => {
      // Issue #406: tenants are exposed under the `tenants` key (formerly
      // `tenantStatus`) as a typed array.
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

      const json = extractJson<{ name: string; tenants: unknown[] }>(output);
      expect(json).not.toBeNull();
      expect(json!.tenants).toBeDefined();
      expect(Array.isArray(json!.tenants)).toBe(true);
    });

    it("should handle agent not found", async () => {
      // Issue #406: 'not found' now routes through handleCommandError, which
      // writes a structured envelope to process.stderr in non-TTY mode (same
      // pattern as `tenants show` from issue #360, `tenants health` from
      // issue #382). Patch stderr.write to assert on the message content.
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      const stderrWrites: string[] = [];
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
        stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });

      try {
        await program.parseAsync(["node", "test", "solutions", "show", "nonexistent-agent-xyz"]);
      } catch {
        // Expected to throw due to process.exit
      }

      writeSpy.mockRestore();

      const consoleOutput = stripAnsi(consoleCapture.getAllOutput());
      const stderrOutput = stripAnsi(stderrWrites.join(""));
      const combined = consoleOutput + "\n" + stderrOutput;

      expect(containsText(combined, "not found")).toBe(true);
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

    it("should show fleet risk analysis with --risk", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--risk"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Fleet Drift Risk Analysis")).toBe(true);
      expect(containsText(cleanOutput, "Recommendation")).toBe(true);
      expect(containsText(cleanOutput, "Score")).toBe(true);
    });

    it("should filter risk analysis by level", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--risk", "medium"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Fleet Drift Risk Analysis")).toBe(true);
      // Should not contain LOW-risk tenants in the table
      expect(containsText(cleanOutput, "current")).toBe(false);
    });

    it("should show tenant risk analysis with --risk -t", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      // Use a tenant that's outdated so the per-factor breakdown is rendered.
      // Fully-current tenants short-circuit the analyzer (factors: []).
      await program.parseAsync(["node", "test", "solutions", "drift", "--risk", "-t", "proseware"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Drift Risk Analysis")).toBe(true);
      expect(containsText(cleanOutput, "Risk Score")).toBe(true);
      expect(containsText(cleanOutput, "Risk Factors")).toBe(true);
    });

    it("should output risk JSON with --risk --json", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--risk", "--json"]);

      const output = consoleCapture.getAllOutput();

      // Issue #401: drift now emits a typed DriftRow envelope rather than the
      // raw FleetDriftAnalysis structure. Rows carry `score`, `risk`,
      // `recommendation`, `topFactor` so agent / pipeline callers can rely on
      // a stable shape.
      const json = extractJson<{
        tenants: Array<{
          tenantName: string;
          tenantId: string;
          score: number;
          risk: string;
          recommendation: string;
          topFactor: string;
        }>;
        summary: { total: number };
      }>(output);
      expect(json).not.toBeNull();
      expect(json!.tenants).toBeDefined();
      expect(json!.summary).toBeDefined();
      expect(json!.summary.total).toBeGreaterThan(0);
      expect(json!.tenants[0].score).toBeDefined();
      expect(json!.tenants[0].risk).toBeDefined();
      expect(json!.tenants[0].recommendation).toBeDefined();
      expect(json!.tenants[0].topFactor).toBeDefined();
    });
  });

  describe("drift fix command", () => {
    it("should show drift fix plan with --fix --dry-run", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--fix", "--dry-run"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should include risk labels
      expect(cleanOutput).toMatch(/low risk|medium risk|high risk/);
    });

    it("should skip high-risk tenants by default", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--fix", "--dry-run"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // With default max-risk=low, medium and high risk tenants should be SKIPPED
      if (cleanOutput.includes("medium risk") || cleanOutput.includes("high risk")) {
        expect(cleanOutput).toMatch(/SKIPPED/);
      }
    });

    it("should include medium-risk tenants with --max-risk medium", async () => {
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync(["node", "test", "solutions", "drift", "--fix", "--yes", "--force"]);

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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      await program.parseAsync([
        "node",
        "test",
        "solutions",
        "drift",
        "--fix",
        "--json",
        "--force",
      ]);

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
      const { solutionsCommand } = await import("../commands/solutions/index.js");
      const program = new Command();
      program.addCommand(solutionsCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "solutions",
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
      const { buildDriftFixPlan } = await import("../commands/solutions/drift.js");
      const { getDemoTenantVersionStatus, DEMO_TENANTS } = await import("@pax8/cta-core");

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
      const { calculateDriftRisk } = await import("../commands/solutions/drift.js");

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
      const { calculateDriftRisk } = await import("../commands/solutions/drift.js");

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
      const { calculateDriftRisk } = await import("../commands/solutions/drift.js");

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
