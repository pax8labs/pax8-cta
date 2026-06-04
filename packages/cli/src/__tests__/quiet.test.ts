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
 * Subprocess tests for --quiet / PAX8_CTA_QUIET=1 behavior.
 *
 * Issue #347: CI and LLM agent flows that only care about exit codes should
 * get zero stdout when --quiet is set; genuine errors must still appear on
 * stderr and exit non-zero.
 */

import { describe, it, expect } from "vitest";
import { runCli } from "./test-utils.js";

// ============================================================================
// --quiet flag: zero stdout, exit 0
// ============================================================================

describe("--quiet flag", () => {
  it("agentsync tenants list --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(["tenants", "list", "--quiet"], {
      env: { NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);
});

// ============================================================================
// PAX8_CTA_QUIET=1 env var: same guarantee without the CLI flag
// ============================================================================

describe("PAX8_CTA_QUIET=1 env var", () => {
  it("PAX8_CTA_QUIET=1 agentsync tenants list produces zero stdout and exits 0", async () => {
    const result = await runCli(["tenants", "list"], {
      env: { NO_COLOR: "1", PAX8_CTA_QUIET: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);
});

// ============================================================================
// Genuine errors still reach stderr (via handleCommandError); exit non-zero
// ============================================================================

describe("--quiet error path", () => {
  it("agentsync tenants show <nonexistent> --quiet exits non-zero (errors not suppressed)", async () => {
    const result = await runCli(
      ["tenants", "show", "nonexistent-tenant-xyz-quiet-test", "--quiet"],
      {
        env: { NO_COLOR: "1" },
        timeout: 60000,
      }
    );

    // Error exit code (1 or 2) — the command must fail even in quiet mode
    expect(result.exitCode).not.toBe(0);

    // Issue #360: "not found" errors now route through handleCommandError so
    // the error envelope reliably reaches stderr (and stdout stays empty in
    // --quiet mode).
    expect(result.stdout.trim()).toBe("");
    const combined = (result.stdout + result.stderr).toLowerCase();
    expect(combined).toMatch(/not found|error/);
  }, 60000);
});

// ============================================================================
// Issue #358: validate / status now route through output() so --quiet/--json/
// TTY-default behave the same as list/show commands.
// ============================================================================

describe("validate command (issue #358)", () => {
  it("agentsync validate --quiet produces zero stdout", async () => {
    const result = await runCli(["validate"], {
      env: { NO_COLOR: "1", PAX8_CTA_QUIET: "1" },
      timeout: 60000,
    });

    // validate fails in tests (no config) but stdout must be empty.
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync validate --json emits a parseable envelope on stdout", async () => {
    // Force real-mode validation: with DEMO_MODE off and no config in cwd,
    // validate should fail at the config-file check and emit a structured
    // failure envelope. (Issue #385 changed the default test env to demo
    // mode; explicitly disable it here to preserve the original assertion
    // that the failure path still produces a parseable envelope.)
    const result = await runCli(["validate"], {
      env: { NO_COLOR: "1", DEMO_MODE: "false" },
      timeout: 60000,
    });

    // No config in test cwd → validate fails fast on the config-file check.
    expect(result.exitCode).toBe(1);

    // Subprocess stdout is non-TTY, so validate defaults to JSON. Parse the
    // entire stdout — the envelope is the only thing on stdout.
    const envelope = JSON.parse(result.stdout) as {
      checks: Array<{ name: string; status: string; message: string }>;
      summary: { total: number; failed: number; ok: boolean };
    };
    expect(Array.isArray(envelope.checks)).toBe(true);
    expect(envelope.summary.ok).toBe(false);
    expect(envelope.checks.some((c) => c.status === "fail")).toBe(true);
  }, 60000);
});

describe("status command (issue #358)", () => {
  it("agentsync status --list --quiet produces zero stdout and exits 0 in demo mode", async () => {
    const result = await runCli(["status", "--list", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync status --list --json emits a parseable shipments envelope", async () => {
    const result = await runCli(["status", "--list", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      deployments: Array<{ id: string; solutionName: string; status: string }>;
    };
    expect(Array.isArray(envelope.deployments)).toBe(true);
    expect(envelope.deployments.length).toBeGreaterThan(0);
    expect(envelope.deployments[0]).toHaveProperty("id");
  }, 60000);

  it("agentsync status --shipment <id> --json emits a parseable deployment envelope", async () => {
    const result = await runCli(["status", "--shipment", "dep-demo-success", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout) as {
      deployment: { id: string; tenantResults: unknown[] };
    };
    expect(envelope.deployment).toBeTruthy();
    expect(envelope.deployment.id).toBe("dep-demo-success");
    expect(Array.isArray(envelope.deployment.tenantResults)).toBe(true);
  }, 60000);

  // Issue #384: bare `agentsync status` should default to --list rather than
  // erroring with "must specify --deployment or --list". This test asserts the
  // shape matches `status --list --json` exactly so users (and scripts) can
  // rely on the default behaviour.
  it("agentsync status (no args) defaults to --list and emits the same JSON envelope", async () => {
    const noArgs = await runCli(["status", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });
    const explicitList = await runCli(["status", "--list", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(noArgs.exitCode).toBe(0);
    expect(explicitList.exitCode).toBe(0);

    const noArgsEnvelope = JSON.parse(noArgs.stdout) as {
      deployments: Array<{ id: string }>;
    };
    const explicitEnvelope = JSON.parse(explicitList.stdout) as {
      deployments: Array<{ id: string }>;
    };
    expect(noArgsEnvelope.deployments.map((d) => d.id)).toEqual(
      explicitEnvelope.deployments.map((d) => d.id)
    );
  }, 120000);
});

// ============================================================================
// Issue #383: `pnpm cli -- --version` (and other -- prefixed flag forwarding)
// must reach Commander as the actual flag rather than being interpreted as an
// unknown command. We exercise the binary directly with a leading `--` token
// to mirror what nested pnpm wrappers forward to us.
// ============================================================================

describe("argv -- separator handling (issue #383)", () => {
  it("CLI strips a leading -- token before parsing (--version)", async () => {
    const result = await runCli(["--", "--version"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 30000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  }, 30000);

  it("CLI strips a leading -- token before parsing (subcommand)", async () => {
    const result = await runCli(["--", "tenants", "list", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  }, 60000);
});

// ============================================================================
// Issue #382: tenants health honors --json / --quiet / TTY-default behavior,
// matching the contract used by tenants list, deployments list, validate, etc.
// ============================================================================

describe("tenants health command (issue #382)", () => {
  it("agentsync tenants health --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(["tenants", "health", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync tenants health --json emits a parseable fleet envelope", async () => {
    const result = await runCli(["tenants", "health", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);

    // The fleet envelope is the only thing on stdout; demo-mode notice goes
    // to stderr. Parse stdout directly.
    const envelope = JSON.parse(result.stdout) as {
      summary: { total: number; healthy: number; unhealthy: number };
      tenants: Array<{ name: string; tenantId: string; healthy: boolean; checks: unknown[] }>;
    };
    expect(envelope.summary).toBeTruthy();
    expect(typeof envelope.summary.total).toBe("number");
    expect(envelope.summary.total).toBeGreaterThan(0);
    expect(Array.isArray(envelope.tenants)).toBe(true);
    expect(envelope.tenants.length).toBe(envelope.summary.total);
    expect(envelope.tenants[0]).toHaveProperty("tenantId");
    expect(envelope.tenants[0]).toHaveProperty("checks");
  }, 60000);

  it("agentsync tenants health <name> --json emits a parseable per-tenant envelope", async () => {
    const result = await runCli(["tenants", "health", "Contoso", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.stdout) as {
      tenant: string;
      healthy: boolean;
      checks: Array<{ name: string; passed: boolean }>;
    };
    expect(envelope.tenant.toLowerCase()).toContain("contoso");
    expect(typeof envelope.healthy).toBe("boolean");
    expect(Array.isArray(envelope.checks)).toBe(true);
    expect(envelope.checks.length).toBeGreaterThan(0);
  }, 60000);
});

// ============================================================================
// Issue #377: solutions drift --risk gained an after-action hint and an
// interactive picker. Both must respect --json / --quiet / non-TTY so
// scripted callers don't hang on the picker prompt.
// ============================================================================

describe("solutions drift after-action hint (issue #377)", () => {
  it("solutions drift --risk --json suppresses the after-action hint and picker", async () => {
    // The drift command now routes through the structured output() helper
    // (issue #401), so --json emits a JSON envelope instead of the table.
    // Either way, the new after-action hint and picker stay suppressed.
    const result = await runCli(["solutions", "drift", "--risk", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Suggested next action");
    expect(result.stdout).not.toContain("Update an outdated tenant now?");
  }, 60000);

  it("solutions drift --risk --quiet suppresses the after-action hint and picker", async () => {
    // After issue #401 --quiet produces zero stdout for the drift report
    // itself; the after-action hint and picker also stay silent.
    const result = await runCli(["solutions", "drift", "--risk", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Suggested next action");
    expect(result.stdout).not.toContain("Update an outdated tenant now?");
  }, 60000);

  it("solutions drift --risk in non-TTY (piped) emits JSON, no hint, no prompt", async () => {
    // Issue #401: subprocess stdout is non-TTY → drift defaults to JSON
    // (matching tenants/list and other migrated commands). The after-action
    // hint and picker must stay suppressed since the caller is parsing JSON.
    const result = await runCli(["solutions", "drift", "--risk"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    // Stdout is the JSON envelope only — no human-readable chrome.
    expect(result.stdout).not.toContain("Fleet Drift Risk Analysis");
    expect(result.stdout).not.toContain("Suggested next action");
    expect(result.stdout).not.toContain("Update an outdated tenant now?");
  }, 60000);

  it("solutions drift --fix in non-TTY does not double-prompt the picker", async () => {
    // --fix is the explicit fix path; the after-report picker would just be a
    // second prompt for the same intent. We pass --yes to skip the existing
    // --fix confirmation and assert the new picker never appears.
    const result = await runCli(["solutions", "drift", "--fix", "--yes"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    // --fix can exit 0 or non-zero depending on demo data; we only care that
    // the new picker doesn't render.
    expect(result.stdout).not.toContain("Update an outdated tenant now?");
  }, 60000);
});

// ============================================================================
// Issue #401: solutions drift now honors --json / --quiet / TTY-default
// behavior, matching the contract used by tenants list, tenants health,
// validate, etc. Last list-style command routed through output() helper.
// ============================================================================

describe("solutions drift command (issue #401)", () => {
  it("agentsync solutions drift --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(["solutions", "drift", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync solutions drift --risk --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(["solutions", "drift", "--risk", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync solutions drift --json emits a parseable summary envelope", async () => {
    const result = await runCli(["solutions", "drift", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    // Parses as JSON — stdout contains only the envelope.
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const envelope = JSON.parse(result.stdout) as {
      totalTenants: number;
      currentTenants: number;
      outdatedTenants: number;
      solutionSummary: unknown[];
    };
    expect(typeof envelope.totalTenants).toBe("number");
    expect(envelope.totalTenants).toBeGreaterThan(0);
    expect(Array.isArray(envelope.solutionSummary)).toBe(true);
  }, 60000);

  it("agentsync solutions drift --risk --json emits a parseable fleet-risk envelope", async () => {
    const result = await runCli(["solutions", "drift", "--risk", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const envelope = JSON.parse(result.stdout) as {
      tenants: Array<{
        tenantName: string;
        tenantId: string;
        score: number;
        risk: string;
        recommendation: string;
        topFactor: string;
      }>;
      summary: {
        total: number;
        current: number;
        safeToUpdate: number;
        reviewRecommended: number;
        risky: number;
        doNotUpdate: number;
      };
    };
    expect(Array.isArray(envelope.tenants)).toBe(true);
    expect(envelope.tenants.length).toBeGreaterThan(0);
    expect(envelope.tenants[0]).toHaveProperty("tenantName");
    expect(envelope.tenants[0]).toHaveProperty("score");
    expect(envelope.tenants[0]).toHaveProperty("risk");
    expect(envelope.tenants[0]).toHaveProperty("recommendation");
    expect(envelope.tenants[0]).toHaveProperty("topFactor");
    expect(envelope.summary).toBeTruthy();
    expect(typeof envelope.summary.total).toBe("number");
    expect(envelope.summary.total).toBe(envelope.tenants.length);
  }, 60000);

  it("agentsync solutions drift in non-TTY defaults to JSON (matches piped stdout convention)", async () => {
    // Subprocess stdout is non-TTY → drift defaults to JSON without an
    // explicit --json flag. Mirrors tenants list / tenants health behavior.
    const result = await runCli(["solutions", "drift"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const envelope = JSON.parse(result.stdout) as { totalTenants: number };
    expect(typeof envelope.totalTenants).toBe("number");
  }, 60000);

  it("agentsync solutions drift --risk in non-TTY defaults to JSON envelope", async () => {
    const result = await runCli(["solutions", "drift", "--risk"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const envelope = JSON.parse(result.stdout) as {
      tenants: unknown[];
      summary: { total: number };
    };
    expect(Array.isArray(envelope.tenants)).toBe(true);
    expect(typeof envelope.summary.total).toBe("number");
  }, 60000);
});

// ============================================================================
// Issue #406: solutions show now honors --json / --quiet / TTY-default
// behavior, matching the contract used by tenants list, tenants health,
// solutions drift, validate, etc.
// ============================================================================

describe("solutions show command (issue #406)", () => {
  it("agentsync solutions show <name> --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(["solutions", "show", "CustomerServiceAgent", "--quiet"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync solutions show <name> --tenants --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(
      ["solutions", "show", "CustomerServiceAgent", "--tenants", "--quiet"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync solutions show <name> --json emits a parseable solution envelope", async () => {
    const result = await runCli(["solutions", "show", "CustomerServiceAgent", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();

    const envelope = JSON.parse(result.stdout) as {
      name: string;
      displayName: string;
      latestVersion: string;
      summary: {
        totalTenants: number;
        deployed: number;
        current: number;
        outdated: number;
        notDeployed: number;
      };
      tenants?: unknown[];
    };
    expect(envelope.name).toBe("CustomerServiceAgent");
    expect(typeof envelope.displayName).toBe("string");
    expect(envelope.displayName.length).toBeGreaterThan(0);
    expect(typeof envelope.latestVersion).toBe("string");
    expect(envelope.summary).toBeTruthy();
    expect(typeof envelope.summary.totalTenants).toBe("number");
    expect(envelope.summary.totalTenants).toBeGreaterThan(0);
    expect(typeof envelope.summary.deployed).toBe("number");
    expect(typeof envelope.summary.current).toBe("number");
    expect(typeof envelope.summary.outdated).toBe("number");
    expect(typeof envelope.summary.notDeployed).toBe("number");
    // Without --tenants, the tenants[] array is omitted from the envelope.
    expect(envelope.tenants).toBeUndefined();
  }, 60000);

  it("agentsync solutions show <name> --tenants --json emits envelope with tenants[]", async () => {
    const result = await runCli(
      ["solutions", "show", "CustomerServiceAgent", "--tenants", "--json"],
      {
        env: { NO_COLOR: "1", DEMO_MODE: "true" },
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();

    const envelope = JSON.parse(result.stdout) as {
      name: string;
      summary: { totalTenants: number };
      tenants: Array<{
        tenantName: string;
        tenantId: string;
        version: string | null;
        status: string;
        deployedAt: string | null;
      }>;
    };
    expect(envelope.name).toBe("CustomerServiceAgent");
    expect(Array.isArray(envelope.tenants)).toBe(true);
    expect(envelope.tenants.length).toBe(envelope.summary.totalTenants);
    expect(envelope.tenants[0]).toHaveProperty("tenantName");
    expect(envelope.tenants[0]).toHaveProperty("tenantId");
    expect(envelope.tenants[0]).toHaveProperty("status");
    expect(["current", "outdated", "not_deployed"]).toContain(envelope.tenants[0].status);
  }, 60000);

  it("agentsync solutions show <name> in non-TTY defaults to JSON envelope", async () => {
    // Subprocess stdout is non-TTY → solutions show defaults to JSON without
    // an explicit --json flag. Mirrors tenants list / tenants health /
    // solutions drift behavior.
    const result = await runCli(["solutions", "show", "CustomerServiceAgent"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    const envelope = JSON.parse(result.stdout) as {
      name: string;
      summary: { totalTenants: number };
    };
    expect(envelope.name).toBe("CustomerServiceAgent");
    expect(typeof envelope.summary.totalTenants).toBe("number");
  }, 60000);
});

// ============================================================================
// Issue #360: tenants show <not-found> emits a JSON error envelope (not bare
// colored text) and exits non-zero.
// ============================================================================

describe("tenants show <not-found> (issue #360)", () => {
  it("agentsync tenants show <missing> --json emits a JSON error envelope on stderr", async () => {
    const result = await runCli(["tenants", "show", "definitely-not-a-tenant-xyz", "--json"], {
      env: { NO_COLOR: "1", DEMO_MODE: "true" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(1);

    // The structured envelope is emitted on stderr by handleCommandError.
    // It may share stderr with spinner / DEMO MODE notices; isolate the JSON
    // line by scanning for an object that starts with `{"error":`.
    const stderrLines = result.stderr.split(/\r?\n/);
    const envelopeLine = stderrLines.find((line) => line.trim().startsWith('{"error":'));
    expect(envelopeLine).toBeTruthy();

    const envelope = JSON.parse(envelopeLine!) as {
      error: { code: string; message: string };
    };
    expect(envelope.error).toBeTruthy();
    expect(envelope.error.message.toLowerCase()).toMatch(/not found/);
    expect(envelope.error.code).toBeTruthy();

    // Stdout itself should not contain the bare colored text.
    expect(result.stdout).not.toMatch(/Tenant '.*' not found/);
  }, 60000);
});
