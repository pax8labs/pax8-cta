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
 * Real-mode tests for the tenants command
 *
 * These tests verify real-mode behavior by using a temporary config file
 * and running commands without DEMO_MODE set.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, extractJson, stripAnsi } from "./test-utils.js";
import type { TenantConfig } from "@agentsync/core";

// Create a temporary directory with a test config
const TEST_DIR = join(tmpdir(), `agentsync-test-${Date.now()}`);
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
  - name: "Test Corp Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    tags:
      - enterprise
      - priority
    enabled: true
    metadata:
      region: "us-east"
      tier: "platinum"
  - name: "Test Corp Beta"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://beta.crm.dynamics.com"
    tags:
      - smb
    enabled: true
  - name: "Test Corp Gamma"
    tenantId: "33333333-3333-3333-3333-333333333333"
    environmentUrl: "https://gamma.crm.dynamics.com"
    tags:
      - enterprise
    enabled: false
  - name: "Test Corp Delta"
    tenantId: "44444444-4444-4444-4444-444444444444"
    environmentUrl: "https://delta.crm.dynamics.com"
    enabled: true
`;

describe("Tenants Command (Real Mode - Config File)", () => {
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

  describe("list command", () => {
    it("should list tenants from config file", async () => {
      const result = await runCli(["tenants", "list", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR }, // Use test HOME to avoid global config
        cwd: TEST_DIR,
      });

      // Should NOT show demo mode warning
      expect(containsText(result.output, "DEMO MODE")).toBe(false);

      // Should show tenants from config
      expect(containsText(result.output, "Test Corp Alpha")).toBe(true);
      expect(containsText(result.output, "Test Corp Beta")).toBe(true);
      expect(containsText(result.output, "Test Corp Delta")).toBe(true);

      // Should show loaded from manifest
      expect(containsText(result.output, "destinations from manifest")).toBe(true);
    });

    it("should filter by tag", async () => {
      const result = await runCli(
        ["tenants", "list", "--config", CONFIG_PATH, "--tag", "enterprise"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);

      // Should show enterprise tenants only (Alpha is enabled, Gamma is disabled)
      expect(containsText(cleanOutput, "Test Corp Alpha")).toBe(true);
      // Should show tag filter info
      expect(containsText(cleanOutput, "enterprise")).toBe(true);
    });

    it("should filter by search query", async () => {
      const result = await runCli(
        ["tenants", "list", "--config", CONFIG_PATH, "--search", "beta"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      expect(containsText(cleanOutput, "Test Corp Beta")).toBe(true);
      expect(containsText(cleanOutput, "beta")).toBe(true);
    });

    it("should filter by enabled status", async () => {
      const result = await runCli(
        ["tenants", "list", "--config", CONFIG_PATH, "--status", "enabled"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      // Should show only enabled tenants (Alpha, Beta, Delta)
      expect(containsText(cleanOutput, "Test Corp Alpha")).toBe(true);
      expect(containsText(cleanOutput, "Test Corp Beta")).toBe(true);
      expect(containsText(cleanOutput, "Test Corp Delta")).toBe(true);
      // Gamma is disabled, should not appear
      expect(containsText(cleanOutput, "Test Corp Gamma")).toBe(false);
    });

    it("should filter by disabled status", async () => {
      const result = await runCli(
        ["tenants", "list", "--config", CONFIG_PATH, "--status", "disabled"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      // Gamma is the only disabled tenant
      expect(containsText(cleanOutput, "Test Corp Gamma")).toBe(true);
      // Others should not appear
      expect(containsText(cleanOutput, "Test Corp Alpha")).toBe(false);
    });

    it("should output JSON format", async () => {
      const result = await runCli(["tenants", "list", "--config", CONFIG_PATH, "--json"], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      const json = extractJson<{ tenants: TenantConfig[]; total: number; active: number }>(
        result.output
      );
      expect(json).not.toBeNull();
      expect(json!.total).toBe(4);
      expect(json!.active).toBe(3); // 3 enabled
      expect(json!.tenants).toHaveLength(4);
    });

    it("should combine multiple filters", async () => {
      const result = await runCli(
        ["tenants", "list", "--config", CONFIG_PATH, "--tag", "enterprise", "--status", "enabled"],
        {
          env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
          cwd: TEST_DIR,
        }
      );

      const cleanOutput = stripAnsi(result.output);
      // Only Alpha has enterprise tag AND is enabled
      expect(containsText(cleanOutput, "Test Corp Alpha")).toBe(true);
      // Gamma should not appear since it's disabled
      expect(containsText(cleanOutput, "Test Corp Gamma")).toBe(false);
    });
  });

  describe("show command", () => {
    it("should show tenant details by name", async () => {
      const result = await runCli(["tenants", "show", "Test Corp Alpha", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      const cleanOutput = stripAnsi(result.output);
      expect(containsText(cleanOutput, "Test Corp Alpha")).toBe(true);
      expect(containsText(cleanOutput, "11111111-1111-1111-1111-111111111111")).toBe(true);
      expect(containsText(cleanOutput, "https://alpha.crm.dynamics.com")).toBe(true);
    });

    it("should show tenant details by partial name", async () => {
      const result = await runCli(["tenants", "show", "beta", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      expect(containsText(result.output, "Test Corp Beta")).toBe(true);
    });

    it("should show tenant metadata", async () => {
      const result = await runCli(["tenants", "show", "Alpha", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      const cleanOutput = stripAnsi(result.output);
      expect(containsText(cleanOutput, "Metadata")).toBe(true);
      expect(containsText(cleanOutput, "us-east")).toBe(true);
    });

    it("should output JSON format", async () => {
      const result = await runCli(["tenants", "show", "Alpha", "--config", CONFIG_PATH, "--json"], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      const json = extractJson<TenantConfig>(result.output);
      expect(json).not.toBeNull();
      expect(json!.name).toBe("Test Corp Alpha");
      expect(json!.tenantId).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("should handle tenant not found", async () => {
      const result = await runCli(["tenants", "show", "nonexistent", "--config", CONFIG_PATH], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(containsText(result.output, "not found")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle config file not found", async () => {
      const result = await runCli(["tenants", "list", "--config", "/nonexistent/config.yaml"], {
        env: { DEMO_MODE: "", HOME: TEST_DIR, USERPROFILE: TEST_DIR },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "Config file not found") ||
          containsText(result.output, "Failed to load")
      ).toBe(true);
    });
  });
});
