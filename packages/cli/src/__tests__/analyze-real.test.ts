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
 * Real-mode tests for the analyze command
 *
 * These tests verify real-mode behavior by using a temporary config file
 * and running commands without DEMO_MODE set. The analyze command uses
 * the risk analyzer from core which works without network calls, so
 * we can exercise the full pipeline end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, stripAnsi } from "./test-utils.js";

const TEST_DIR = join(tmpdir(), `pax8-cta-analyze-test-${Date.now()}`);
const CONFIG_PATH = join(TEST_DIR, "config", "tenants.yaml");
const require = createRequire(import.meta.url);
const { writeFileSync, mkdirSync, rmSync, existsSync } =
  require("node:fs") as typeof import("node:fs");

const TEST_CONFIG = `
version: "2.0"
partner:
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  clientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
source:
  tenantId: "cccccccc-cccc-cccc-cccc-cccccccccccc"
  environmentUrl: "https://source.crm.dynamics.com"
tenants:
  - name: "Analyze Alpha Corp"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    tags:
      - enterprise
      - production
    enabled: true
  - name: "Analyze Beta LLC"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://beta.crm.dynamics.com"
    tags:
      - smb
    enabled: true
  - name: "Analyze Gamma Inc"
    tenantId: "33333333-3333-3333-3333-333333333333"
    environmentUrl: "https://gamma.crm.dynamics.com"
    tags:
      - enterprise
    enabled: true
  - name: "Analyze Disabled"
    tenantId: "44444444-4444-4444-4444-444444444444"
    environmentUrl: "https://disabled.crm.dynamics.com"
    enabled: false
`;

describe("Analyze Command (Real Mode - Config File)", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, "config"), { recursive: true });
    writeFileSync(CONFIG_PATH, TEST_CONFIG);
    mkdirSync(join(TEST_DIR, ".pax8-cta"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".pax8-cta", "cli-config.json"),
      JSON.stringify({ demoMode: false })
    );
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("real-mode analysis with --all", () => {
    it("should analyze all enabled tenants from config", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);

      // Should NOT show demo mode
      expect(containsText(output, "DEMO MODE")).toBe(false);

      // Should show 3 enabled tenants
      expect(containsText(output, "3 Destinations")).toBe(true);

      // Should show tenant names
      expect(containsText(output, "Analyze Alpha Corp")).toBe(true);
      expect(containsText(output, "Analyze Beta LLC")).toBe(true);
      expect(containsText(output, "Analyze Gamma Inc")).toBe(true);

      // Should NOT show disabled tenant
      expect(containsText(output, "Analyze Disabled")).toBe(false);

      // Should show risk analysis report
      expect(containsText(output, "RISK ANALYSIS REPORT")).toBe(true);
      expect(containsText(output, "Risk Score:")).toBe(true);
      expect(containsText(output, "Confidence:")).toBe(true);
      expect(containsText(output, "Success Probability:")).toBe(true);
    });

    it("should show risk analysis completed message", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(containsText(result.output, "Risk analysis complete")).toBe(true);
    });
  });

  describe("real-mode analysis with tag filters", () => {
    it("should filter by enterprise tag", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "enterprise"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);

      // Should show 2 enterprise tenants (Alpha and Gamma)
      expect(containsText(output, "2 Destinations")).toBe(true);
      expect(containsText(output, "Analyze Alpha Corp")).toBe(true);
      expect(containsText(output, "Analyze Gamma Inc")).toBe(true);
      expect(containsText(output, "Analyze Beta LLC")).toBe(false);
    });

    it("should filter by smb tag", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "smb"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);

      // Should show only Beta
      expect(containsText(output, "1 Destination")).toBe(true);
      expect(containsText(output, "Analyze Beta LLC")).toBe(true);
    });

    it("should error when no tenants match tag", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "nonexistent"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(containsText(result.output, "No destinations matched")).toBe(true);
    });

    it("should support multiple tags", async () => {
      const result = await runCli(
        [
          "analyze",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--tag",
          "enterprise",
          "smb",
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);

      // Should show all 3 enabled tenants (enterprise: Alpha+Gamma, smb: Beta)
      expect(containsText(output, "3 Destinations")).toBe(true);
    });
  });

  describe("JSON output", () => {
    it("should output valid JSON with --json flag", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all", "--json"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = result.output;
      // Should contain JSON fields
      expect(output).toContain('"score"');
      expect(output).toContain('"confidence"');
      expect(output).toContain('"successProbability"');
      expect(output).toContain('"canProceed"');

      // Should NOT contain formatted report text
      expect(output).not.toContain("RISK ANALYSIS REPORT");
    });
  });

  describe("error handling", () => {
    it("should error when config file not found", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", "/nonexistent/config.yaml", "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "not found") ||
          containsText(result.output, "Failed") ||
          containsText(result.output, "Risk analysis failed")
      ).toBe(true);
    });

    it("should default to all tenants when neither --all nor --tag specified", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      // analyze defaults to --all when no --tag specified
      expect(result.exitCode).toBe(0);
    });
  });

  describe("production flag detection", () => {
    it("should detect production tenants from tags", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "production"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);
      // Alpha has the production tag
      expect(containsText(output, "Analyze Alpha Corp")).toBe(true);
      // Should complete analysis (even for production tenants)
      expect(
        containsText(output, "Risk analysis complete") ||
          containsText(output, "RISK ANALYSIS REPORT")
      ).toBe(true);
    });
  });

  describe("risk report sections", () => {
    it("should show recommendations section", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);
      expect(containsText(output, "RECOMMENDATIONS")).toBe(true);
    });

    it("should show a deployment verdict", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);
      const hasVerdict =
        containsText(output, "READY TO DEPLOY") ||
        containsText(output, "PROCEED WITH CAUTION") ||
        containsText(output, "DEPLOYMENT BLOCKED");
      expect(hasVerdict).toBe(true);
    });

    it("should show estimated duration", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);
      expect(containsText(output, "Estimated Duration:")).toBe(true);
      expect(containsText(output, "minutes")).toBe(true);
    });

    it("should show analyzed tenant count", async () => {
      const result = await runCli(
        ["analyze", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const output = stripAnsi(result.output);
      expect(containsText(output, "Analyzed Tenants:")).toBe(true);
      expect(containsText(output, "3")).toBe(true);
    });
  });
});
