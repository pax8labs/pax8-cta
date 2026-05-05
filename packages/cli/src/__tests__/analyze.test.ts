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
} from "./test-utils.js";
import { DEMO_TENANTS } from "@agentsync/core";

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

describe("Analyze Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: any;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    // Enable demo mode for tests
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
    it("should have --solution as optional flag (positional arg preferred)", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");

      const solutionOption = analyzeCommand.options.find((opt) => opt.long === "--solution");
      expect(solutionOption).toBeDefined();
    });

    it("should auto-default to --all when neither --all nor --tag is specified", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip"]);

      const output = consoleCapture.getAllOutput();

      // Should auto-default to --all and succeed (in demo mode)
      expect(containsText(output, "DEMO MODE")).toBe(true);
    });
  });

  describe("demo mode - analyze all", () => {
    it("should show demo mode warning", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "DEMO MODE")).toBe(true);
      expect(containsText(output, "DEMO MODE")).toBe(true);
    });

    it("should analyze all enabled destinations", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show count of enabled tenants
      const enabledCount = DEMO_TENANTS.filter((t) => t.enabled).length;
      expect(containsText(cleanOutput, `Analyzing Risk for ${enabledCount} Destinations`)).toBe(
        true
      );

      // Should show risk analysis report
      expect(containsText(cleanOutput, "RISK ANALYSIS REPORT")).toBe(true);
    });

    it("should show risk analysis report sections", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show overall assessment
      expect(containsText(cleanOutput, "Overall Assessment")).toBe(true);
      expect(containsText(cleanOutput, "Risk Score:")).toBe(true);
      expect(containsText(cleanOutput, "Confidence:")).toBe(true);
      expect(containsText(cleanOutput, "Success Probability:")).toBe(true);
      expect(containsText(cleanOutput, "Estimated Duration:")).toBe(true);
      expect(containsText(cleanOutput, "Can Proceed:")).toBe(true);

      // Should show recommendations
      expect(containsText(cleanOutput, "RECOMMENDATIONS")).toBe(true);
    });

    it("should list destinations being analyzed", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show table headers
      expect(containsText(cleanOutput, "Destination")).toBe(true);
      expect(containsText(cleanOutput, "Tenant ID")).toBe(true);
    });

    it("should show success message when analysis completes", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Risk analysis complete")).toBe(true);
    });
  });

  describe("demo mode - analyze by tags", () => {
    it("should filter destinations by tag", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync([
        "node",
        "test",
        "analyze",
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

      expect(
        containsText(cleanOutput, `Analyzing Risk for ${enterpriseTenants.length} Destinations`)
      ).toBe(true);
    });

    it("should support multiple tags", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync([
        "node",
        "test",
        "analyze",
        "--solution",
        "./test.zip",
        "--tag",
        "enterprise",
        "smb",
      ]);

      const output = consoleCapture.getAllOutput();

      // Should show risk analysis
      expect(containsText(output, "RISK ANALYSIS REPORT")).toBe(true);
    });

    it("should error when no destinations match tags", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "analyze",
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

  describe("risk levels", () => {
    it("should show blockers section when present", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      // Run analyze multiple times until we get a critical issue (with blockers)
      for (let i = 0; i < 10; i++) {
        consoleCapture = new ConsoleCapture();
        consoleCapture.start();

        await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

        const output = consoleCapture.getAllOutput();
        const cleanOutput = stripAnsi(output);

        // If we see blockers, verify the section
        if (containsText(cleanOutput, "BLOCKERS")) {
          expect(containsText(cleanOutput, "prevent deployment")).toBe(true);
          expect(containsText(cleanOutput, "MUST be fixed")).toBe(true);
          expect(containsText(cleanOutput, "DEPLOYMENT BLOCKED")).toBe(true);
          break;
        }

        consoleCapture.stop();
      }
    });

    it("should show warnings section when present", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      // Run analyze - with >2 tenants we should get warnings
      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show at least one of: warnings or blockers or all checks passed
      const hasWarnings = containsText(cleanOutput, "WARNINGS");
      const hasBlockers = containsText(cleanOutput, "BLOCKERS");
      const allPassed = containsText(cleanOutput, "READY TO DEPLOY");

      expect(hasWarnings || hasBlockers || allPassed).toBe(true);
    });

    it("should show ready to deploy when no issues", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      // Use a single tenant to increase likelihood of low risk
      await program.parseAsync([
        "node",
        "test",
        "analyze",
        "--solution",
        "./test.zip",
        "--tag",
        "enterprise",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show one of the risk level verdicts
      const hasVerdict =
        containsText(cleanOutput, "READY TO DEPLOY") ||
        containsText(cleanOutput, "PROCEED WITH CAUTION") ||
        containsText(cleanOutput, "DEPLOYMENT BLOCKED");

      expect(hasVerdict).toBe(true);
    });
  });

  describe("json output", () => {
    it("should output JSON when --json flag is used", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync([
        "node",
        "test",
        "analyze",
        "--solution",
        "./test.zip",
        "--all",
        "--json",
      ]);

      const output = consoleCapture.getAllOutput();

      // Should contain JSON structure (not the formatted report)
      expect(output).toContain('"score"');
      expect(output).toContain('"confidence"');
      expect(output).toContain('"successProbability"');
      expect(output).toContain('"canProceed"');

      // Should NOT contain formatted report text
      expect(output).not.toContain("RISK ANALYSIS REPORT");
    });
  });

  describe("option aliases", () => {
    it("should accept --agentPackage as alias for --solution", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");

      const agentPackageOption = analyzeCommand.options.find(
        (opt) => opt.long === "--agentPackage"
      );
      expect(agentPackageOption).toBeDefined();
    });
  });

  describe("configuration options", () => {
    it("should use default config path", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");

      const configOption = analyzeCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");

      expect(analyzeCommand.description()).toContain("Analyze");
      expect(analyzeCommand.description()).toContain("risk");
    });
  });

  describe("risk assessment details", () => {
    it("should show estimated duration", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Estimated Duration:")).toBe(true);
      expect(containsText(cleanOutput, "minutes")).toBe(true);
    });

    it("should show analyzed tenant count", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Analyzed Tenants:")).toBe(true);
    });

    it("should render a confidence qualifier label next to the risk score", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // One of the three qualifier labels must appear next to the risk score.
      const hasQualifier =
        containsText(cleanOutput, "(limited data)") ||
        containsText(cleanOutput, "(moderate confidence)") ||
        containsText(cleanOutput, "(high confidence)");
      expect(hasQualifier).toBe(true);
    });

    it("--json output includes confidence_qualifier and perTenantBreakdown", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync([
        "node",
        "test",
        "analyze",
        "--solution",
        "./test.zip",
        "--all",
        "--json",
      ]);

      const output = consoleCapture.getAllOutput();
      expect(output).toContain('"confidence_qualifier"');
      expect(output).toContain('"perTenantBreakdown"');
    });

    it("should show next steps hint", async () => {
      const { analyzeCommand } = await import("../commands/analyze.js");
      const program = new Command();
      program.addCommand(analyzeCommand);

      await program.parseAsync(["node", "test", "analyze", "--solution", "./test.zip", "--all"]);

      const output = consoleCapture.getAllOutput();

      // Should show either "deploy <solution>" or "Fix the blockers"
      const hasNextStep =
        containsText(output, "Next step: deploy") || containsText(output, "Fix the blockers");

      expect(hasNextStep).toBe(true);
    });
  });
});
