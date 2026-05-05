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
 * Subprocess tests for --quiet / AGENTSYNC_QUIET=1 behavior.
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
// AGENTSYNC_QUIET=1 env var: same guarantee without the CLI flag
// ============================================================================

describe("AGENTSYNC_QUIET=1 env var", () => {
  it("AGENTSYNC_QUIET=1 agentsync tenants list produces zero stdout and exits 0", async () => {
    const result = await runCli(["tenants", "list"], {
      env: { NO_COLOR: "1", AGENTSYNC_QUIET: "1" },
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
      env: { NO_COLOR: "1", AGENTSYNC_QUIET: "1" },
      timeout: 60000,
    });

    // validate fails in tests (no config) but stdout must be empty.
    expect(result.stdout.trim()).toBe("");
  }, 60000);

  it("agentsync validate --json emits a parseable envelope on stdout", async () => {
    const result = await runCli(["validate"], {
      env: { NO_COLOR: "1" },
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
