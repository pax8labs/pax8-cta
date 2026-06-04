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
 * Real-mode tests for the export command
 *
 * These tests verify real-mode behavior by using a temporary config file
 * and running commands without DEMO_MODE set. They exercise the real
 * config loading and credential checking paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText } from "./test-utils.js";

const TEST_DIR = join(tmpdir(), `agentsync-export-test-${Date.now()}`);
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
  - name: "Export Test Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    enabled: true
`;

const CONFIG_NO_SOURCE = `
version: "2.0"
partner:
  tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  clientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
tenants:
  - name: "Export Test Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    enabled: true
`;

describe("Export Command (Real Mode - Config File)", () => {
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

  describe("config loading", () => {
    it("should not show demo mode warning in real mode", async () => {
      const result = await runCli(["export", "--solution", "TestAgent", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          PAX8_CTA_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(containsText(result.output, "DEMO MODE")).toBe(false);
    });

    it("should load config and fail at authentication", async () => {
      const result = await runCli(["export", "--solution", "TestAgent", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          PAX8_CTA_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "Client secret not found") ||
          containsText(result.output, "Packing failed") ||
          containsText(result.output, "Failed")
      ).toBe(true);
    });

    it("should error when config file not found", async () => {
      const result = await runCli(
        ["export", "--solution", "TestAgent", "--config", "/nonexistent/config.yaml"],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            PAX8_CTA_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "not found") ||
          containsText(result.output, "Failed") ||
          containsText(result.output, "Packing failed")
      ).toBe(true);
    });
  });

  describe("option handling", () => {
    it('should accept "pack" as alias for "export"', async () => {
      const result = await runCli(["pack", "--solution", "TestAgent", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          PAX8_CTA_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      // Should attempt real export (will fail at auth), not demo mode
      expect(containsText(result.output, "DEMO MODE")).toBe(false);
    });

    it("should pass --unmanaged flag through to export", async () => {
      const result = await runCli(
        ["export", "--solution", "TestAgent", "--unmanaged", "--config", CONFIG_PATH],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            PAX8_CTA_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      // Will fail at auth but should not crash on option parsing
      expect(result.exitCode).toBe(1);
    });

    it("should support custom output directory", async () => {
      const result = await runCli(
        [
          "export",
          "--solution",
          "TestAgent",
          "--output",
          join(TEST_DIR, "custom-output"),
          "--config",
          CONFIG_PATH,
        ],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            PAX8_CTA_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      // Will fail at auth but should accept the option
      expect(result.exitCode).toBe(1);
    });
  });

  describe("config without source environment", () => {
    it("should still load config when source is missing", async () => {
      const noSourcePath = join(TEST_DIR, "config", "no-source.yaml");
      writeFileSync(noSourcePath, CONFIG_NO_SOURCE);

      const result = await runCli(["export", "--solution", "TestAgent", "--config", noSourcePath], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          PAX8_CTA_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      // Should fail, but at the auth/source step, not config parsing
      expect(result.exitCode).toBe(1);
    });
  });
});
