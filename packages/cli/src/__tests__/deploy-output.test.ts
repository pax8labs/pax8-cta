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
 * Subprocess tests for `deploy` honoring the structured output() helper
 * (issue #357). Mirrors the patterns in __tests__/quiet.test.ts but exercises
 * the deploy command's demo success path:
 *
 *   - --quiet           -> zero stdout, exit 0
 *   - --json            -> parseable JSON envelope on stdout, exit 0
 *   - default (piped)   -> JSON envelope (TTY-default JSON kicks in for
 *                          non-TTY callers, matching tenants list / deployments list)
 */

import { describe, it, expect } from "vitest";
import { runCli } from "./test-utils.js";

describe("deploy --quiet (issue #357)", () => {
  it("agentsync deploy ... --quiet produces zero stdout and exits 0", async () => {
    const result = await runCli(
      ["deploy", "CustomerServiceAgent", "--tag", "enterprise", "--quiet"],
      {
        env: { NO_COLOR: "1" },
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");
  }, 60000);
});

describe("deploy --json (issue #357)", () => {
  it("agentsync deploy ... --json produces parseable JSON on stdout", async () => {
    const result = await runCli(
      ["deploy", "CustomerServiceAgent", "--tag", "enterprise", "--json"],
      {
        env: { NO_COLOR: "1" },
        timeout: 60000,
      }
    );

    expect(result.exitCode).toBe(0);

    // stdout must be valid JSON in its entirety — no chrome before/after.
    const parsed = JSON.parse(result.stdout);
    expect(parsed.demo).toBe(true);
    expect(parsed.deploymentId).toMatch(/^dep-demo-/);
    expect(parsed.solution).toBe("CustomerServiceAgent");
    expect(Array.isArray(parsed.destinations)).toBe(true);
    expect(parsed.totalDestinations).toBeGreaterThan(0);
  }, 60000);

  it("piped stdout (no --json) defaults to JSON for agent/script callers", async () => {
    // The CLI sets PAX8_CTA_DEFAULT_FORMAT=json when stdout is not a TTY.
    // Subprocess invocation is non-TTY, so the deploy command should emit
    // its JSON envelope without an explicit --json flag.
    const result = await runCli(["deploy", "CustomerServiceAgent", "--tag", "enterprise"], {
      env: { NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.demo).toBe(true);
    expect(parsed.deploymentId).toMatch(/^dep-demo-/);
  }, 60000);
});
