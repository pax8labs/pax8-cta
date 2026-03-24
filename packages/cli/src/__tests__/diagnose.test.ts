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
 * Tests for the diagnose command.
 *
 * The diagnose command always runs against real config (no demo mode).
 * These tests verify config loading, tenant lookup, and early-exit behavior
 * when credentials are missing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli, containsText, stripAnsi } from "./test-utils.js";

const TEST_DIR = join(tmpdir(), `agentsync-diagnose-test-${Date.now()}`);
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
  - name: "Diagnose Test Alpha"
    tenantId: "11111111-1111-1111-1111-111111111111"
    environmentUrl: "https://alpha.crm.dynamics.com"
    tags:
      - enterprise
    enabled: true
  - name: "Diagnose Test Beta"
    tenantId: "22222222-2222-2222-2222-222222222222"
    environmentUrl: "https://beta.crm.dynamics.com"
    tags:
      - smb
    enabled: true
  - name: "Diagnose Test Disabled"
    tenantId: "33333333-3333-3333-3333-333333333333"
    environmentUrl: "https://disabled.crm.dynamics.com"
    enabled: false
`;

describe("Diagnose Command", () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, "config"), { recursive: true });
    writeFileSync(CONFIG_PATH, TEST_CONFIG);
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("should show help text", async () => {
    const result = await runCli(["diagnose", "--help"], {
      env: { DEMO_MODE: "", HOME: TEST_DIR },
      cwd: TEST_DIR,
    });

    const output = stripAnsi(result.output);
    expect(containsText(output, "diagnostic")).toBe(true);
    expect(containsText(output, "tenant")).toBe(true);
  });

  it("should error when tenant name is not provided", async () => {
    const result = await runCli(["diagnose"], {
      env: { DEMO_MODE: "", HOME: TEST_DIR },
      cwd: TEST_DIR,
    });

    expect(result.exitCode).not.toBe(0);
  });

  it("should error when config file does not exist", async () => {
    const result = await runCli(
      ["diagnose", "Some Tenant", "--config", "/nonexistent/config.yaml"],
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
    expect(containsText(result.output, "not found") || containsText(result.output, "Config")).toBe(
      true
    );
  });

  it("should error when tenant is not found in config", async () => {
    const result = await runCli(["diagnose", "Nonexistent Corp", "--config", CONFIG_PATH], {
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
      containsText(result.output, "not found") || containsText(result.output, "Available")
    ).toBe(true);
  });

  it("should show tenant info and fail at client secret when missing", async () => {
    const result = await runCli(["diagnose", "Diagnose Test Alpha", "--config", CONFIG_PATH], {
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
    // Should show diagnosing header and produce diagnostic output
    expect(containsText(output, "Diagnosing") || containsText(output, "Diagnostic")).toBe(true);
  });

  it("should show diagnostic steps with client secret provided", async () => {
    const result = await runCli(["diagnose", "Diagnose Test Alpha", "--config", CONFIG_PATH], {
      env: {
        DEMO_MODE: "",
        HOME: TEST_DIR,
        PARTNER_CLIENT_SECRET: "test-secret-value",
      },
      cwd: TEST_DIR,
    });

    // Will fail at GDAP or token step (no real Azure),
    // but should get past client secret
    expect(result.exitCode).toBe(1);
    const output = stripAnsi(result.output);
    // Should show diagnosing header
    expect(containsText(output, "Diagnosing") || containsText(output, "Diagnostic")).toBe(true);
  });
});
