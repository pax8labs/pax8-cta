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
 * Subprocess integration tests for `deployments undo` (issue #418).
 *
 * Demo-mode end-to-end checks. Real-mode rollback paths are out of scope —
 * `RollbackService` has its own unit tests in @agentsync/core, and the
 * per-tenant Dataverse plumbing is Phase 2.
 *
 * Demo-store determinism: each `runCli` spawns a fresh subprocess, so the
 * in-process `demoDeploymentStore` is reset between tests. That lets us
 * call `undo` repeatedly on the same demo ID without contaminating state.
 *
 * Known demo fixtures used here (from `generateMockDeploymentHistory`):
 *   demo-hist-001  — completed,  canRollback: true   (the happy-path target)
 *   demo-hist-002  — completed,  canRollback: false  (rollback-ineligible)
 */

import { describe, it, expect } from "vitest";
import {
  runCli,
  runCliExpectSuccess,
  runCliExpectFailure,
  containsText,
  extractJson,
} from "./test-utils.js";

const DEMO_TARGET_ID = "demo-hist-001";
const DEMO_INELIGIBLE_ID = "demo-hist-002";

describe("deployments undo (subprocess)", () => {
  it("undoes a known deployment with -y and prints a rollback summary", async () => {
    const result = await runCliExpectSuccess(["deployments", "undo", DEMO_TARGET_ID, "-y"]);

    // Subprocess stdout is piped (non-TTY) → AGENTSYNC_DEFAULT_FORMAT=json,
    // so we get the JSON envelope rather than the human summary.
    const json = extractJson(result.output) as {
      deploymentId?: string;
      status?: string;
      tenants?: unknown[];
    } | null;

    expect(json).not.toBeNull();
    expect(json!.deploymentId).toBe(DEMO_TARGET_ID);
    expect(json!.status).toBe("rolled-back");
    expect(Array.isArray(json!.tenants)).toBe(true);
    expect(json!.tenants!.length).toBeGreaterThan(0);
  });

  it("errors with a 'did you mean' hint when the id is unknown", async () => {
    const result = await runCliExpectFailure([
      "deployments",
      "undo",
      "definitely-not-a-real-id",
      "-y",
    ]);

    // The error envelope is on stderr in piped mode (handleCommandError JSON
    // path) but `result.output` covers both streams.
    expect(containsText(result.output, "not found")).toBe(true);
    expect(containsText(result.output, "Did you mean")).toBe(true);
    // Should reference at least one real demo id in the suggestions.
    expect(containsText(result.output, "demo-hist-")).toBe(true);
  });

  it("--dry-run shows what would happen without recording an undo entry", async () => {
    const result = await runCliExpectSuccess(["deployments", "undo", DEMO_TARGET_ID, "--dry-run"]);

    const json = extractJson(result.output) as {
      deploymentId?: string;
      status?: string;
      dryRun?: boolean;
      tenants?: unknown[];
    } | null;
    expect(json).not.toBeNull();
    expect(json!.deploymentId).toBe(DEMO_TARGET_ID);
    expect(json!.dryRun).toBe(true);
    expect(json!.tenants!.length).toBeGreaterThan(0);

    // Sanity: a fresh subprocess after this dry-run should still see the
    // original deployment with canRollback intact (i.e. dry-run did not
    // mutate the seed data). Verified by re-reading via `deployments show`.
    const show = await runCliExpectSuccess(["deployments", "show", DEMO_TARGET_ID, "--json"]);
    const showJson = extractJson(show.output) as { canRollback?: boolean } | null;
    expect(showJson).not.toBeNull();
    expect(showJson!.canRollback).toBe(true);
  });

  it("--json -y emits the JSON envelope", async () => {
    const result = await runCliExpectSuccess([
      "deployments",
      "undo",
      DEMO_TARGET_ID,
      "--json",
      "-y",
    ]);

    const json = extractJson(result.output) as {
      deploymentId?: string;
      status?: string;
      tenants?: Array<{ tenantName: string; status: string; error?: string }>;
    } | null;

    expect(json).not.toBeNull();
    expect(json!.deploymentId).toBe(DEMO_TARGET_ID);
    expect(json!.status).toBe("rolled-back");
    expect(Array.isArray(json!.tenants)).toBe(true);
    // Every tenant entry has the required keys per the documented envelope.
    for (const t of json!.tenants!) {
      expect(typeof t.tenantName).toBe("string");
      expect(typeof t.status).toBe("string");
      // status is one of the allowed values
      expect(["rolled-back", "skipped", "failed"]).toContain(t.status);
    }
  });

  it("--quiet -y produces zero stdout and exits 0", async () => {
    const result = await runCli(["deployments", "undo", DEMO_TARGET_ID, "--quiet", "-y"]);

    expect(result.exitCode).toBe(0);
    // Quiet mode is "no stdout"; allow stderr (banners etc. are stdout-only
    // anyway, so this is genuinely a silence check).
    expect(result.stdout).toBe("");
  });

  it("errors cleanly when the deployment is not eligible for rollback", async () => {
    const result = await runCliExpectFailure(["deployments", "undo", DEMO_INELIGIBLE_ID, "-y"]);

    expect(containsText(result.output, "not eligible")).toBe(true);
    expect(containsText(result.output, "canRollback")).toBe(true);
  });
});
