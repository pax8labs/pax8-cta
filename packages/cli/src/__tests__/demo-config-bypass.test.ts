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
 * Subprocess tests for issue #385: validate, tenants inspect, and
 * solutions remove must succeed in demo mode without ./config/tenants.yaml.
 *
 * Each test runs the CLI in a tmpdir cwd so any stray config in the
 * repository root can't accidentally satisfy the loadConfig() path that
 * these commands used to exercise.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, stripAnsi } from "./test-utils.js";

let workDir: string;

beforeAll(() => {
  // A clean cwd guarantees `./config/tenants.yaml` does NOT exist; any
  // command that still tries loadConfig() in demo mode will surface as
  // ERROR_CONFIG_NOT_FOUND.
  workDir = mkdtempSync(join(tmpdir(), "agentsync-demo-385-"));
});

afterAll(() => {
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
});

describe("issue #385: validate in demo mode", () => {
  it("validate succeeds in demo mode without ./config/tenants.yaml", async () => {
    const result = await runCli(["validate"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      cwd: workDir,
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    // Demo banner mentions demo mode
    expect(combined.toLowerCase()).toContain("demo");
    // Must not mention the missing-config error code
    expect(combined).not.toContain("ERROR_CONFIG_NOT_FOUND");
  }, 90000);

  it("validate --json in demo mode emits a passing envelope", async () => {
    const result = await runCli(["validate", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      cwd: workDir,
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      checks: Array<{ name: string; status: string }>;
      summary: { ok: boolean; failed: number };
    };
    expect(envelope.summary.ok).toBe(true);
    expect(envelope.summary.failed).toBe(0);
    expect(envelope.checks.length).toBeGreaterThan(0);
  }, 90000);
});

describe("issue #385: tenants inspect in demo mode", () => {
  it("tenants inspect succeeds in demo mode without ./config/tenants.yaml", async () => {
    const result = await runCli(["tenants", "inspect"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      cwd: workDir,
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    // The fleet inspection report header appears
    expect(combined).toContain("Inspection Report");
    expect(combined).not.toContain("ERROR_CONFIG_NOT_FOUND");
  }, 90000);
});

describe("issue #385: solutions remove in demo mode", () => {
  it("solutions remove <name> -t <tenant> -y succeeds and prints a simulation", async () => {
    const result = await runCli(
      ["solutions", "remove", "CustomerServiceAgent", "-t", "Contoso Corporation", "-y"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        cwd: workDir,
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    // Output describes what *would* happen, naming the solution + tenant.
    expect(combined).toContain("CustomerServiceAgent");
    expect(combined).toContain("Contoso Corporation");
    expect(combined.toLowerCase()).toMatch(/would (remove|uninstall)/);
    expect(combined).not.toContain("ERROR_CONFIG_NOT_FOUND");
  }, 90000);

  it("solutions remove --json emits a structured envelope", async () => {
    const result = await runCli(
      ["solutions", "remove", "CustomerServiceAgent", "-t", "Contoso Corporation", "-y", "--json"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        cwd: workDir,
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      demo: boolean;
      action: string;
      solution: string;
      tenant: { name: string };
    };
    expect(envelope.demo).toBe(true);
    expect(envelope.action).toBe("would-remove");
    expect(envelope.solution).toBe("CustomerServiceAgent");
    expect(envelope.tenant.name).toBe("Contoso Corporation");
  }, 90000);

  it("solutions remove --quiet exits 0 and produces zero stdout", async () => {
    const result = await runCli(
      ["solutions", "remove", "CustomerServiceAgent", "-t", "Contoso Corporation", "-y", "--quiet"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        cwd: workDir,
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 90000);
});

describe("issue #402: solutions remove -t fuzzy-matches tenant names", () => {
  it("partial tenant query (e.g. 'Contoso') resolves like other commands", async () => {
    const result = await runCli(
      ["solutions", "remove", "CustomerServiceAgent", "-t", "Contoso", "-y"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        cwd: workDir,
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    expect(combined).toContain("CustomerServiceAgent");
    // Resolves to the full canonical tenant name
    expect(combined).toContain("Contoso Corporation");
    expect(combined.toLowerCase()).toMatch(/would (remove|uninstall)/);
  }, 90000);

  it("exact tenant query still works after the fuzzy-match change", async () => {
    const result = await runCli(
      ["solutions", "remove", "CustomerServiceAgent", "-t", "Contoso Corporation", "-y"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        cwd: workDir,
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    expect(combined).toContain("Contoso Corporation");
    expect(combined.toLowerCase()).toMatch(/would (remove|uninstall)/);
  }, 90000);

  it("query that matches no tenant errors with a helpful hint", async () => {
    const result = await runCli(["solutions", "remove", "CustomerServiceAgent", "-t", "XX", "-y"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      cwd: workDir,
      timeout: 60000,
    });

    expect(result.exitCode).not.toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    expect(combined.toLowerCase()).toContain("no tenant matches");
    expect(combined).toContain("'XX'");
    expect(combined).toContain("agentsync tenants list");
  }, 90000);

  it("ambiguous query (matches multiple tenants) lists candidates", async () => {
    // "co" matches both "Contoso Corporation" and "Coho Vineyard"
    const result = await runCli(["solutions", "remove", "CustomerServiceAgent", "-t", "co", "-y"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      cwd: workDir,
      timeout: 60000,
    });

    expect(result.exitCode).not.toBe(0);
    const combined = stripAnsi(result.stdout + result.stderr);
    expect(combined.toLowerCase()).toContain("did you mean");
    expect(combined).toContain("Contoso Corporation");
    expect(combined).toContain("Coho Vineyard");
  }, 90000);
});
