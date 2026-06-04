/**
 * Copyright 2026 Pax8 Labs
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
 * Real-mode tests for the deploy command
 *
 * These tests verify real-mode behavior by using a temporary config file
 * and running commands without DEMO_MODE set.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, stripAnsi, expectJson } from "./test-utils.js";

// Create a temporary directory with a test config
const TEST_DIR = join(tmpdir(), `agentsync-deploy-test-${Date.now()}`);
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
  - name: "Deploy Test Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    connectionMappings:
      - sourceLogicalName: "bot-connection"
        targetConnectionId: "conn-{tenant}"
    environmentVariables:
      - schemaName: "TENANT_PORTAL_URL"
        value: "https://portal.{tenant}.example.com"
        type: "String"
    tags:
      - enterprise
      - priority
    enabled: true
  - name: "Deploy Test Beta"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://beta.crm.dynamics.com"
    tags:
      - smb
    enabled: true
  - name: "Deploy Test Gamma"
    tenantId: "33333333-3333-3333-3333-333333333333"
    environmentUrl: "https://gamma.crm.dynamics.com"
    tags:
      - enterprise
    enabled: false
settings:
  defaultConnectionMappings:
    - sourceLogicalName: "shared-sp"
      targetConnectionId: "sp-{tenant}"
  defaultEnvironmentVariables:
    - schemaName: "API_URL"
      value: "https://api.{tenant}.example.com"
      type: "String"
  waves:
    - name: "Pilot"
      order: 1
      tenants: ["enterprise"]
      maxParallel: 2
      continueOnFailure: false
    - name: "Main"
      order: 2
      tenants: ["smb"]
      continueOnFailure: true
`;

describe("Deploy Command (Real Mode - Config File)", () => {
  beforeAll(() => {
    // Create test directory and config
    mkdirSync(join(TEST_DIR, "config"), { recursive: true });
    writeFileSync(CONFIG_PATH, TEST_CONFIG);
    // Create empty .agentsync config to disable demo mode
    mkdirSync(join(TEST_DIR, ".agentsync"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".agentsync", "cli-config.json"),
      JSON.stringify({ demoMode: false })
    );
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("required options validation", () => {
    it("should auto-default to --all when neither --all nor --tag is specified", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--dry-run",
          "--skip-validation",
        ],
        {
          // PAX8_CTA_DEFAULT_FORMAT forces the table dry-run output even though
          // subprocess stdout is non-TTY (which would default to JSON per #357).
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            USERPROFILE: TEST_DIR,
            PAX8_CTA_DEFAULT_FORMAT: "table",
          },
          cwd: TEST_DIR,
        }
      );

      // Should auto-default to --all and show all enabled tenants
      const cleanOutput = stripAnsi(result.output);
      expect(containsText(cleanOutput, "Dry run")).toBe(true);
      expect(containsText(cleanOutput, "to 2 tenants")).toBe(true);
    });
  });

  describe("dry-run mode", () => {
    it("should show preview with --all and --dry-run", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--all",
          "--dry-run",
          "--skip-validation",
        ],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            USERPROFILE: TEST_DIR,
            PAX8_CTA_DEFAULT_FORMAT: "table",
          },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Should NOT show demo mode warning
      expect(containsText(result.output, "DEMO MODE")).toBe(false);

      // Should show dry run indication
      expect(containsText(cleanOutput, "Dry run")).toBe(true);

      // Should show enabled tenants (2 enabled: Alpha and Beta)
      expect(containsText(cleanOutput, "to 2 tenants")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Beta")).toBe(true);
      expect(containsText(cleanOutput, "Wave 1 (Pilot)")).toBe(true);
      expect(containsText(cleanOutput, "Wave 2 (Main)")).toBe(true);
      expect(containsText(cleanOutput, "bot-connection")).toBe(true);
      expect(containsText(cleanOutput, "API_URL")).toBe(true);
    });

    it("should filter tenants by tag in dry-run", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--tag",
          "enterprise",
          "--dry-run",
          "--skip-validation",
        ],
        {
          // PAX8_CTA_DEFAULT_FORMAT forces table even though subprocess stdout is non-TTY.
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            USERPROFILE: TEST_DIR,
            PAX8_CTA_DEFAULT_FORMAT: "table",
          },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Only Alpha has enterprise tag and is enabled
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      // Should show count of 1
      expect(containsText(cleanOutput, "to 1 tenant")).toBe(true);
    });

    it("should filter tenants by multiple tags in dry-run", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--tag",
          "enterprise",
          "smb",
          "--dry-run",
          "--skip-validation",
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Should include both enterprise (Alpha) and smb (Beta)
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Beta")).toBe(true);
    });

    it("should filter tenants by --tenant in dry-run", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--tenant",
          "Deploy Test Beta",
          "--dry-run",
          "--skip-validation",
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      expect(result.exitCode).toBe(0);
      expect(containsText(cleanOutput, "Deploy Test Beta")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(false);
    });

    it("should emit JSON dry-run output", async () => {
      const result = await runCli(
        [
          "deploy",
          "--solution",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--all",
          "--dry-run",
          "--skip-validation",
          "--json",
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const json = expectJson<any>(result.output);
      expect(result.exitCode).toBe(0);
      expect(json.dryRun).toBe(true);
      expect(json.summary.totalTenants).toBe(2);
      expect(json.summary.totalWaves).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(json.waves)).toBe(true);
    });

    it("should error when no tenants match tag filter", async () => {
      const result = await runCli(
        ["deploy", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "nonexistent"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(containsText(result.output, "No destinations matched")).toBe(true);
    });
  });

  describe("positional argument", () => {
    it("should accept solution as positional argument", async () => {
      const result = await runCli(
        [
          "deploy",
          "./test.zip",
          "--config",
          CONFIG_PATH,
          "--all",
          "--dry-run",
          "--skip-validation",
        ],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            USERPROFILE: TEST_DIR,
            PAX8_CTA_DEFAULT_FORMAT: "table",
          },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      // Should work with positional arg
      expect(containsText(cleanOutput, "Dry run")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle config file not found", async () => {
      const result = await runCli(
        ["deploy", "--solution", "./test.zip", "--config", "/nonexistent/config.yaml", "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "Config file not found") ||
          containsText(result.output, "Configuration file") ||
          containsText(result.output, "not found") ||
          containsText(result.output, "Failed")
      ).toBe(true);
    });
  });
});
