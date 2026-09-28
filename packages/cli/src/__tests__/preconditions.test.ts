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
 * End-to-end checks for the Phase 1 deploy-preflight feature: the
 * PRECONDITIONS section in `analyze` and the JSON envelope's
 * `preconditions` field. Subprocess tests because we want to catch any
 * regression in the path that runs in production (not the in-process
 * vitest import path), in line with the project's "favor subprocess
 * integration tests for command behavior" convention.
 */

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, runCliExpectSuccess, stripAnsi, expectJson } from "./test-utils.js";

// The CLI subprocess runner defaults cwd to packages/cli, but the example
// preconditions manifest ships at the workspace root (`agent packages/`),
// so we point `cwd` there. Mirrors what end-users do — run pax8-cta from
// the repo root that contains their solution + manifest sidecar.
const __filename = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(dirname(__filename), "../../../..");

describe("analyze — preconditions (Phase 1 preflight)", () => {
  it("renders the PRECONDITIONS section with at least one failure for enterprise tenants", async () => {
    const result = await runCli(["analyze", "CustomerServiceAgent", "--tag", "enterprise"], {
      cwd: WORKSPACE_ROOT,
    });
    const out = stripAnsi(result.output);
    expect(out).toContain("PRECONDITIONS");
    // Woodgrove Bank's CA policy is in reportOnly — the manifest demands
    // `state equals enabled`, so this row must surface.
    expect(out).toContain("Require MFA for Admins");
    expect(out).toContain("Woodgrove Bank");
    // The structured-remediation block prefixes the property name with
    // `property:` — pin it so a later display refactor doesn't silently
    // drop the field.
    expect(out).toContain("property:");
    expect(out).toContain("required:");
    expect(out).toContain("fix:");
  });

  it("shows the 'preflight skipped' note when no manifest exists for the solution", async () => {
    // SalesAssistant ships without a sibling preconditions YAML.
    const result = await runCli(["analyze", "SalesAssistant", "--tag", "enterprise"], {
      cwd: WORKSPACE_ROOT,
    });
    const out = stripAnsi(result.output);
    expect(out).toContain("PRECONDITIONS");
    expect(out).toContain("No precondition manifest");
    expect(out).toContain("preflight skipped");
  });

  it("--json envelope includes a structured `preconditions` section with failures[]", async () => {
    const result = await runCliExpectSuccess(
      ["analyze", "CustomerServiceAgent", "--tag", "enterprise", "--json"],
      { cwd: WORKSPACE_ROOT }
    );
    // Standardized envelope (#465): the RiskAnalysis lives under data.
    const envelope = expectJson<{
      data: {
        preconditions: {
          manifestFound: boolean;
          solution?: string;
          manifestVersion?: string;
          failures: Array<{
            tenantId: string;
            tenantName: string;
            preconditionId: string;
            failedProperty: string;
            remediation: { kind: string; title: string };
          }>;
        };
      };
    }>(result.stdout);
    expect(envelope.data.preconditions.manifestFound).toBe(true);
    expect(envelope.data.preconditions.solution).toBe("CustomerServiceAgent");
    expect(envelope.data.preconditions.failures.length).toBeGreaterThan(0);
    const woodgrove = envelope.data.preconditions.failures.find(
      (f) => f.tenantName === "Woodgrove Bank"
    );
    expect(woodgrove).toBeDefined();
    expect(woodgrove?.failedProperty).toBe("state");
    expect(woodgrove?.remediation.kind).toBe("link");
  });

  it("--json envelope reports manifestFound=false when no manifest exists", async () => {
    const result = await runCliExpectSuccess(
      ["analyze", "SalesAssistant", "--tag", "enterprise", "--json"],
      { cwd: WORKSPACE_ROOT }
    );
    const envelope = expectJson<{
      data: { preconditions: { manifestFound: boolean; failures: unknown[] } };
    }>(result.stdout);
    expect(envelope.data.preconditions.manifestFound).toBe(false);
    expect(envelope.data.preconditions.failures).toEqual([]);
  });

  it("--all surfaces failures across multiple tenants (Tailspin Toys + Coho Vineyard)", async () => {
    const result = await runCli(["analyze", "CustomerServiceAgent", "--all"], {
      cwd: WORKSPACE_ROOT,
    });
    const out = stripAnsi(result.output);
    expect(out).toContain("Tailspin Toys");
    expect(out).toContain("Coho Vineyard");
    // Three remediation kinds (link / command / manual) all rendered.
    expect(out).toContain("https://entra.microsoft.com/"); // link
    expect(out).toContain("pax8-cta auth refresh"); // command
    expect(out).toContain("Open Exchange Admin Center"); // manual
  });
});
