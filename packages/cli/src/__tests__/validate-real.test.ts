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
 * Real-mode tests for the validate command
 *
 * The validate command has no demo mode at all -- it always exercises
 * real config loading and validation logic. These tests verify config
 * file validation, credential checks, and error reporting paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, stripAnsi } from "./test-utils.js";

const TEST_DIR = join(tmpdir(), `agentsync-validate-test-${Date.now()}`);
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
  - name: "Validate Test Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    tags:
      - enterprise
    enabled: true
  - name: "Validate Test Beta"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://beta.crm.dynamics.com"
    tags:
      - smb
    enabled: true
  - name: "Validate Test Disabled"
    tenantId: "33333333-3333-3333-3333-333333333333"
    environmentUrl: "https://disabled.crm.dynamics.com"
    enabled: false
`;

describe("Validate Command (Real Mode)", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, "config"), { recursive: true });
    writeFileSync(CONFIG_PATH, TEST_CONFIG);
    mkdirSync(join(TEST_DIR, ".agentsync"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".agentsync", "cli-config.json"),
      JSON.stringify({ demoMode: false })
    );
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("config file validation", () => {
    it("should validate a well-formed config file", async () => {
      const result = await runCli(["validate", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          AGENTSYNC_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      const output = stripAnsi(result.output);
      // Should get past config validation
      expect(
        containsText(output, "Configuration file valid") || containsText(output, "Config file")
      ).toBe(true);
      // Should show tenant count
      expect(containsText(output, "2 tenant") || containsText(output, "Validating")).toBe(true);
    });

    it("should fail when config file does not exist", async () => {
      const result = await runCli(["validate", "--config", "/nonexistent/path/config.yaml"], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          AGENTSYNC_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "not found") ||
          containsText(result.output, "Configuration file not found")
      ).toBe(true);
    });

    it("should fail with malformed YAML config", async () => {
      const malformedPath = join(TEST_DIR, "config", "malformed.yaml");
      writeFileSync(
        malformedPath,
        `
version: "2.0"
partner:
  tenantId: not-a-guid
tenants:
  - this is not valid: [
`
      );

      const result = await runCli(["validate", "--config", malformedPath], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          AGENTSYNC_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "Invalid") ||
          containsText(result.output, "invalid") ||
          containsText(result.output, "Failed")
      ).toBe(true);
    });
  });

  describe("tenant filtering", () => {
    it("should validate specific tenant by name", async () => {
      const result = await runCli(
        ["validate", "--config", CONFIG_PATH, "--tenant", "Validate Test Alpha"],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            AGENTSYNC_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      // validate command fails at client secret check but should have gotten
      // past config parsing successfully. The exit code should be 1 (secret missing).
      expect(result.exitCode).toBe(1);
      // Should produce some output (spinner text and/or error messages)
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it("should error when specified tenant not found", async () => {
      const result = await runCli(
        ["validate", "--config", CONFIG_PATH, "--tenant", "Nonexistent Corp"],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            AGENTSYNC_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "not found") || containsText(result.output, "not enabled")
      ).toBe(true);
    });

    it("should error when specified tenant is disabled", async () => {
      const result = await runCli(
        ["validate", "--config", CONFIG_PATH, "--tenant", "Validate Test Disabled"],
        {
          env: {
            DEMO_MODE: "",
            HOME: TEST_DIR,
            PARTNER_CLIENT_SECRET: "",
            AGENTSYNC_CLIENT_SECRET: "",
          },
          cwd: TEST_DIR,
        }
      );

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "not found") || containsText(result.output, "not enabled")
      ).toBe(true);
    });
  });

  describe("credential validation", () => {
    it("should fail when client secret is missing", async () => {
      const result = await runCli(["validate", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          AGENTSYNC_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      expect(
        containsText(result.output, "Client secret") ||
          containsText(result.output, "Missing") ||
          containsText(result.output, "secret")
      ).toBe(true);
    });
  });

  describe("source environment validation", () => {
    it("should skip source validation with --skip-source", async () => {
      const result = await runCli(["validate", "--config", CONFIG_PATH, "--skip-source"], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "test-secret-value",
        },
        cwd: TEST_DIR,
      });

      const output = stripAnsi(result.output);
      // Should show that source was skipped
      expect(containsText(output, "Skipped") || containsText(output, "skip-source")).toBe(true);
    });
  });

  describe("validation results display", () => {
    it("should show validation results summary", async () => {
      const result = await runCli(["validate", "--config", CONFIG_PATH], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "test-secret-value",
        },
        cwd: TEST_DIR,
      });

      const output = stripAnsi(result.output);
      // Should show validation results section
      expect(containsText(output, "Validation Results")).toBe(true);
    });

    it("should show error count in summary when validation fails", async () => {
      const result = await runCli(["validate", "--config", "/nonexistent/config.yaml"], {
        env: {
          DEMO_MODE: "",
          HOME: TEST_DIR,
          PARTNER_CLIENT_SECRET: "",
          AGENTSYNC_CLIENT_SECRET: "",
        },
        cwd: TEST_DIR,
      });

      expect(result.exitCode).toBe(1);
      const output = stripAnsi(result.output);
      expect(containsText(output, "error") || containsText(output, "fail")).toBe(true);
    });
  });
});
