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
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, stripAnsi } from "./test-utils.js";

// Create a temporary directory with a test config
const TEST_DIR = join(tmpdir(), `agentsync-deploy-test-${Date.now()}`);
const CONFIG_PATH = join(TEST_DIR, "config", "tenants.yaml");

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
    it("should error when neither --all nor --tag is specified", async () => {
      const result = await runCli(["deploy", "--solution", "./test.zip", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(containsText(result.output, "Must specify --all or --tag")).toBe(true);
    });
  });

  describe("dry-run mode", () => {
    it("should show preview with --all and --dry-run", async () => {
      const result = await runCli(
        ["deploy", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all", "--dry-run"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Should NOT show demo mode warning
      expect(containsText(result.output, "DEMO MODE")).toBe(false);

      // Should show dry run indication
      expect(containsText(cleanOutput, "Dry run")).toBe(true);

      // Should show enabled tenants (2 enabled: Alpha and Beta)
      expect(containsText(cleanOutput, "(2)")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Beta")).toBe(true);
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
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Only Alpha has enterprise tag and is enabled
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      // Should show count of 1
      expect(containsText(cleanOutput, "(1)")).toBe(true);
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
        ],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Should include both enterprise (Alpha) and smb (Beta)
      expect(containsText(cleanOutput, "Deploy Test Alpha")).toBe(true);
      expect(containsText(cleanOutput, "Deploy Test Beta")).toBe(true);
    });

    it("should error when no tenants match tag filter", async () => {
      const result = await runCli(
        ["deploy", "--solution", "./test.zip", "--config", CONFIG_PATH, "--tag", "nonexistent"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(containsText(result.output, "No destinations matched")).toBe(true);
    });
  });

  describe("option aliases", () => {
    it('should accept "ship" as alias for "deploy"', async () => {
      const result = await runCli(
        ["ship", "--solution", "./test.zip", "--config", CONFIG_PATH, "--all", "--dry-run"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      // Should work the same as deploy
      expect(containsText(cleanOutput, "Dry run")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle config file not found", async () => {
      const result = await runCli(
        ["deploy", "--solution", "./test.zip", "--config", "/nonexistent/config.yaml", "--all"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR },
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
