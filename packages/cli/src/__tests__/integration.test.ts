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

/**
 * Integration tests demonstrating CLI test utilities
 *
 * These tests run the CLI as a subprocess and verify end-to-end behavior.
 * They serve as examples for how to write integration tests for new commands.
 */

import { describe, it, expect } from "vitest";
import {
  runCli,
  runCliExpectSuccess,
  runCliExpectFailure,
  extractJson,
  stripAnsi,
  containsText,
} from "./test-utils.js";
import { DEMO_TENANTS } from "./fixtures/index.js";

describe("CLI Integration Tests", () => {
  describe("runCli utility", () => {
    it("should capture stdout and stderr", async () => {
      const result = await runCli(["--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("agentsync");
      expect(result.stderr).toBe("");
      expect(result.duration).toBeGreaterThan(0);
    });

    it("should handle non-zero exit codes", async () => {
      const result = await runCli(["nonexistent-command"]);

      expect(result.exitCode).not.toBe(0);
    });

    it("should respect environment variables", async () => {
      const result = await runCli(["demo", "status"], {
        env: { DEMO_MODE: "true" },
      });

      expect(result.exitCode).toBe(0);
      expect(containsText(result.output, "Demo Mode Status")).toBe(true);
    });
  });

  describe("runCliExpectSuccess utility", () => {
    it("should return result on success", async () => {
      const result = await runCliExpectSuccess(["--version"]);
      expect(result.stdout).toContain("0.1.0");
    });

    it("should throw on failure", async () => {
      // deploy with no solution arg should fail
      await expect(
        runCliExpectSuccess(["deploy"]) // Missing solution name
      ).rejects.toThrow();
    });
  });

  describe("runCliExpectFailure utility", () => {
    it("should return result on failure", async () => {
      const result = await runCliExpectFailure(["deploy"]); // Missing required args
      expect(result.exitCode).not.toBe(0);
    });

    it("should throw on unexpected success", async () => {
      await expect(runCliExpectFailure(["--help"])).rejects.toThrow("unexpectedly succeeded");
    });
  });

  describe("tenants list command", () => {
    it("should list all tenants in demo mode", async () => {
      // Use --json since subprocess stdout is piped (non-TTY) and defaults to JSON
      const result = await runCliExpectSuccess(["tenants", "list", "--json"]);

      expect(containsText(result.output, "DEMO MODE")).toBe(true);
      const json = extractJson<{ tenants: unknown[]; total: number; active: number }>(
        result.stdout
      );
      expect(json).not.toBeNull();
      expect(json!.tenants.length).toBeGreaterThan(0);
    });

    it("should show correct tenant count", async () => {
      // Use --json since subprocess stdout is piped (non-TTY) and defaults to JSON
      const result = await runCliExpectSuccess(["tenants", "list", "--json"]);

      const enabledCount = DEMO_TENANTS.filter((t) => t.enabled).length;
      const json = extractJson<{ tenants: unknown[]; total: number; active: number }>(
        result.stdout
      );
      expect(json).not.toBeNull();
      expect(json!.active).toBe(enabledCount);
    });

    it("should filter by tag", async () => {
      const result = await runCliExpectSuccess(["tenants", "list", "--tag", "enterprise"]);

      // Should only show enterprise tenants
      expect(containsText(result.output, "Contoso")).toBe(true);
      expect(containsText(result.output, "enterprise")).toBe(true);
    });
  });

  describe("parseTable utility", () => {
    // Note: subprocess stdout is piped (non-TTY) so agentsync defaults to JSON.
    // These tests use --json and verify JSON structure, which also exercises extractJson.
    it("should parse CLI JSON output for tenants list", async () => {
      const result = await runCliExpectSuccess(["tenants", "list", "--json"]);

      const json = extractJson<{ tenants: Array<{ name: string; tags?: string[] }> }>(
        result.stdout
      );
      expect(json).not.toBeNull();
      expect(json!.tenants.some((t) => t.name === "Contoso Corporation")).toBe(true);
      expect(json!.tenants.some((t) => t.name === "Fabrikam Inc")).toBe(true);
    });

    it("should extract column values from JSON output", async () => {
      const result = await runCliExpectSuccess(["tenants", "list", "--json"]);

      const json = extractJson<{ tenants: Array<{ name: string }> }>(result.stdout);
      expect(json).not.toBeNull();
      const names = json!.tenants.map((t) => t.name);
      expect(names).toContain("Contoso Corporation");
      expect(names).toContain("Fabrikam Inc");
    });

    it("should find tenant with specific tag from JSON output", async () => {
      const result = await runCliExpectSuccess(["tenants", "list", "--json"]);

      const json = extractJson<{
        tenants: Array<{ name: string; tags?: string[] }>;
      }>(result.stdout);
      expect(json).not.toBeNull();
      const cohoTenant = json!.tenants.find((t) => t.name.includes("Coho"));
      expect(cohoTenant).toBeDefined();
      expect(cohoTenant!.tags).toContain("hospitality");
    });
  });

  describe("demo command", () => {
    it("should show demo mode status", async () => {
      const result = await runCliExpectSuccess(["demo", "status"]);

      // Should show some indication of demo mode state
      expect(
        containsText(result.output, "Demo mode") ||
          containsText(result.output, "DEMO") ||
          containsText(result.output, "enabled") ||
          containsText(result.output, "disabled")
      ).toBe(true);
    });

    it("should toggle demo mode on", async () => {
      const result = await runCliExpectSuccess(["demo", "on"], {
        env: { HOME: "/tmp" },
      });

      expect(
        containsText(result.output, "enabled") || containsText(result.output, "Demo mode")
      ).toBe(true);
    });
  });

  describe("deploy command (dry run)", () => {
    it("should preview deployment in demo mode", async () => {
      const result = await runCliExpectSuccess(["deploy", "--solution", "./test.zip", "--all"]);

      expect(containsText(result.output, "DEMO MODE")).toBe(true);
      expect(containsText(result.output, "Shipment dispatched")).toBe(true);
      expect(containsText(result.output, "Tracking #")).toBe(true);
    });

    it("should show deployment ID", async () => {
      const result = await runCliExpectSuccess([
        "deploy",
        "--solution",
        "./test.zip",
        "--tag",
        "enterprise",
      ]);

      // Should contain a deployment ID
      expect(result.output).toMatch(/dep-demo-[a-z0-9]+/);
    });

    it("should fail when no tenants match tag", async () => {
      const result = await runCliExpectFailure([
        "deploy",
        "--solution",
        "./test.zip",
        "--tag",
        "nonexistent-tag",
      ]);

      expect(containsText(result.output, "No destinations matched")).toBe(true);
    });
  });

  describe("deployments command", () => {
    it("should list deployments", async () => {
      const result = await runCliExpectSuccess(["deployments", "list"]);

      // Should show deployment listing
      expect(
        containsText(result.output, "Deployment") ||
          containsText(result.output, "deployment") ||
          containsText(result.output, "Status") ||
          containsText(result.output, "DEMO")
      ).toBe(true);
    });
  });

  describe("oss-only behavior", () => {
    it("should reject status --list outside demo mode", async () => {
      const result = await runCliExpectFailure(["status", "--list"], {
        env: { DEMO_MODE: "false" },
      });

      expect(result.exitCode).toBe(2);
      expect(containsText(result.output, "open-source CLI")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should show helpful error for missing solution", async () => {
      const result = await runCliExpectFailure(["deploy"]); // Missing solution name

      expect(containsText(result.output, "solution name or path required")).toBe(true);
    });

    it("should show help on unknown command", async () => {
      const result = await runCli(["unknown-command"]);

      expect(result.exitCode).not.toBe(0);
    });
  });
});

describe("Output parsing utilities", () => {
  describe("stripAnsi", () => {
    it("should remove ANSI color codes", () => {
      const input = "\x1B[32mgreen\x1B[0m text";
      expect(stripAnsi(input)).toBe("green text");
    });

    it("should handle multiple codes", () => {
      const input = "\x1B[1m\x1B[31mBold Red\x1B[0m";
      expect(stripAnsi(input)).toBe("Bold Red");
    });
  });

  describe("containsText", () => {
    it("should find text ignoring ANSI codes", () => {
      const output = "\x1B[32mSuccess\x1B[0m: Operation completed";
      expect(containsText(output, "Success")).toBe(true);
      expect(containsText(output, "completed")).toBe(true);
      expect(containsText(output, "failure")).toBe(false);
    });
  });

  describe("extractJson", () => {
    it("should extract JSON from mixed output", () => {
      const output = 'Some text\n{"key": "value"}\nMore text';
      const json = extractJson(output);
      expect(json).toEqual({ key: "value" });
    });

    it("should extract JSON arrays", () => {
      const output = 'Header\n[{"id": 1}, {"id": 2}]\nFooter';
      const json = extractJson(output);
      expect(json).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("should return null for invalid JSON", () => {
      const output = "No JSON here";
      expect(extractJson(output)).toBeNull();
    });
  });
});
