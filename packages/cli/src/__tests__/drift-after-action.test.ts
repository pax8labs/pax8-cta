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
 * Issue #377: drift report shows risk but doesn't tell the user what to do
 * about it. `buildAfterActionHint` is the pure formatter that drives the new
 * after-action paragraph; pinning the wording here means we don't have to
 * shell out a subprocess just to assert the suggestion text.
 */

import { describe, it, expect } from "vitest";
import type { TenantDriftAnalysis } from "@pax8-cta/core";
import { buildAfterActionHint } from "../commands/solutions/drift-analysis.js";

function makeTenant(
  name: string,
  riskLevel: "low" | "medium" | "high",
  riskScore: number
): TenantDriftAnalysis {
  return {
    tenantId: `id-${name}`,
    tenantName: name,
    environmentUrl: "https://example.crm.dynamics.com",
    riskLevel,
    riskScore,
    recommendation: "review_recommended",
    recommendationReason: "test",
    factors: [],
    versionStatus: {
      tenantId: `id-${name}`,
      tenantName: name,
      environmentUrl: "https://example.crm.dynamics.com",
      solutions: [],
      overallStatus: "outdated",
      lastChecked: new Date(0).toISOString(),
    },
    outdatedSolutions: [],
  };
}

describe("buildAfterActionHint (issue #377)", () => {
  it("0 outdated tenants → 'Fleet is current. Nothing to do.'", () => {
    const hint = buildAfterActionHint([], "CustomerServiceAgent");
    expect(hint).toBe("Fleet is current. Nothing to do.");
  });

  it("1 outdated tenant → per-tenant deploy suggestion + drift --fix fallback", () => {
    const hint = buildAfterActionHint(
      [makeTenant("Contoso", "medium", 40)],
      "CustomerServiceAgent"
    );
    expect(hint).toContain("Suggested next action:");
    expect(hint).toContain("pax8-cta deploy CustomerServiceAgent --tenant <name>");
    expect(hint).toContain("pax8-cta solutions drift --fix");
    // No HIGH-risk row → no analyze drill-in suggestion.
    expect(hint).not.toContain("pax8-cta analyze");
  });

  it("3 outdated tenants → still uses the per-tenant suggestion form", () => {
    const hint = buildAfterActionHint(
      [
        makeTenant("Contoso", "medium", 40),
        makeTenant("Fabrikam", "low", 20),
        makeTenant("Northwind", "medium", 50),
      ],
      "CustomerServiceAgent"
    );
    expect(hint).toContain("pax8-cta deploy CustomerServiceAgent --tenant <name>");
    expect(hint).toContain("pax8-cta solutions drift --fix");
  });

  it("5 outdated tenants → recommends solutions drift --fix with caveat", () => {
    const hint = buildAfterActionHint(
      [
        makeTenant("Contoso", "medium", 40),
        makeTenant("Fabrikam", "low", 20),
        makeTenant("Northwind", "medium", 50),
        makeTenant("Adventure", "low", 25),
        makeTenant("Wingtip", "medium", 45),
      ],
      "CustomerServiceAgent"
    );
    expect(hint).toContain("Suggested next action: pax8-cta solutions drift --fix");
    expect(hint).toContain("review the list above first");
    // No HIGH-risk row → no analyze drill-in suggestion.
    expect(hint).not.toContain("pax8-cta analyze");
  });

  it("any HIGH-risk row → appends the analyze drill-in suggestion", () => {
    const hint = buildAfterActionHint(
      [makeTenant("Proseware", "high", 80), makeTenant("Contoso", "low", 20)],
      "CustomerServiceAgent"
    );
    expect(hint).toContain("Drill into risk before updating");
    expect(hint).toContain("pax8-cta analyze CustomerServiceAgent --tenant <name>");
  });

  it("falls back to <solution> placeholder when no solution name is supplied", () => {
    const hint = buildAfterActionHint([makeTenant("Contoso", "medium", 40)]);
    expect(hint).toContain("pax8-cta deploy <solution> --tenant <name>");
  });
});
