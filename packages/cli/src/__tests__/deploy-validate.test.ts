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
 * Subprocess tests for the demo-mode solution-name validation added to the
 * deploy command. The bug being covered: in demo mode, `pax8-cta deploy`
 * previously accepted any string as the solution name and printed a fake
 * success — including obvious typos like "CusteomrServiceAgent". That hides
 * typos during demos and trains users to expect the CLI to accept garbage.
 *
 * The fix validates the solution argument against the DEMO_SOLUTIONS catalog
 * (case-sensitive uniqueName match) before pretending to ship. Zip-path
 * inputs (`./foo.zip`) keep the existing pretend-export contract and bypass
 * validation.
 */

import { describe, it, expect } from "vitest";
import { runCli, stripAnsi } from "./test-utils.js";

describe("deploy demo-mode solution-name validation", () => {
  it("rejects an unknown solution name with a helpful list", async () => {
    const result = await runCli(["deploy", "CusteomrServiceAgent", "--tag", "enterprise"], {
      env: { DEMO_MODE: "true", NO_COLOR: "1" },
      timeout: 60000,
    });

    const output = stripAnsi(result.output);

    expect(result.exitCode).not.toBe(0);
    // The typo'd name should appear in the error message so the operator sees
    // exactly what was rejected.
    expect(output).toContain("CusteomrServiceAgent");
    // The available-solutions listing must be present so users can self-correct.
    expect(output).toContain("Available demo solutions");
    expect(output).toContain("CustomerServiceAgent");
    // And a pointer to the full catalog command.
    expect(output).toContain("solutions list");
  }, 60000);

  it("accepts a known demo solution name", async () => {
    const result = await runCli(["deploy", "CustomerServiceAgent", "--tag", "enterprise"], {
      env: { DEMO_MODE: "true", NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    // Subprocess stdout is non-TTY so the deploy command emits the JSON
    // success envelope by default — easy to assert against.
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.demo).toBe(true);
    expect(parsed.data.solution).toBe("CustomerServiceAgent");
  }, 60000);

  it("accepts a .zip path (skips catalog validation)", async () => {
    // Zip paths intentionally bypass catalog validation — the demo path has
    // never required the file to actually exist, and we don't want to break
    // that contract here. The success envelope just labels the package by the
    // path the caller supplied.
    const result = await runCli(["deploy", "./test.zip", "--tag", "enterprise"], {
      env: { DEMO_MODE: "true", NO_COLOR: "1" },
      timeout: 60000,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.demo).toBe(true);
    expect(parsed.data.solution).toBe("./test.zip");
  }, 60000);
});
