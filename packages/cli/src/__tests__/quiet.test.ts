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

    // Error messages in this codebase are routed through console.log (stdout)
    // for "not found" style errors, so check combined output for the error text.
    // (handleCommandError routes structured errors to stderr — both channels remain active.)
    const combined = (result.stdout + result.stderr).toLowerCase();
    expect(combined).toMatch(/not found|error/);
  }, 60000);
});
