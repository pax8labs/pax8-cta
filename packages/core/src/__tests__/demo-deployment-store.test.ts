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

import { describe, it, expect, beforeEach } from "vitest";
import { demoDeploymentStore } from "../mock/demo-deployment-store.js";
import type { DeploymentJob } from "../config/schema.js";

function makeRecord(overrides: Partial<DeploymentJob> = {}): DeploymentJob {
  const now = new Date().toISOString();
  return {
    id: "dep-demo-test",
    solutionPath: "./solutions/X.zip",
    solutionName: "TestSolution",
    solutionVersion: "1.0.0",
    status: "completed",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    completedAt: now,
    tenantResults: [
      {
        tenantId: "11111111-1111-1111-1111-111111111111",
        tenantName: "Contoso Corporation",
        status: "completed",
        attemptNumber: 1,
      },
    ],
    totalTenants: 1,
    completedTenants: 1,
    failedTenants: 0,
    triggeredBy: "cli",
    durationMs: 5000,
    canRollback: true,
    ...overrides,
  };
}

describe("demoDeploymentStore", () => {
  beforeEach(() => {
    // Each test starts from a clean slate so leftover records from other
    // suites don't leak (the singleton is shared across tests by design).
    demoDeploymentStore.reset();
  });

  it("seeds itself with canned history on first list()", () => {
    const list = demoDeploymentStore.list();
    expect(list.length).toBeGreaterThan(0);
    // Canned history uses `demo-hist-NNN` ids.
    expect(list.some((d) => d.id.startsWith("demo-hist-"))).toBe(true);
  });

  it("record() inserts the new entry at the top of list()", () => {
    const fresh = makeRecord({ id: "dep-demo-abc" });
    demoDeploymentStore.record(fresh);

    const list = demoDeploymentStore.list();
    expect(list[0].id).toBe("dep-demo-abc");
  });

  it("record() preserves the canned seed history alongside fresh entries", () => {
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-xyz" }));

    const list = demoDeploymentStore.list();
    const cannedIds = list.filter((d) => d.id.startsWith("demo-hist-"));
    expect(cannedIds.length).toBeGreaterThan(0);
    expect(list.some((d) => d.id === "dep-demo-xyz")).toBe(true);
  });

  it("record() with an existing id replaces (not duplicates) the older entry", () => {
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-dup", solutionName: "First" }));
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-dup", solutionName: "Second" }));

    const list = demoDeploymentStore.list();
    const matches = list.filter((d) => d.id === "dep-demo-dup");
    expect(matches).toHaveLength(1);
    expect(matches[0].solutionName).toBe("Second");
  });

  it("list({ status }) filters records by status", () => {
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-ok", status: "completed" }));
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-bad", status: "failed" }));

    const failed = demoDeploymentStore.list({ status: "failed" });
    expect(failed.every((d) => d.status === "failed")).toBe(true);
    expect(failed.some((d) => d.id === "dep-demo-bad")).toBe(true);
    expect(failed.some((d) => d.id === "dep-demo-ok")).toBe(false);
  });

  it("list({ agent }) filters records by solutionName substring", () => {
    demoDeploymentStore.record(
      makeRecord({ id: "dep-demo-cs", solutionName: "CustomerServiceAgent" })
    );
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-sa", solutionName: "SalesAssistant" }));

    const customerOnly = demoDeploymentStore.list({ agent: "customer" });
    expect(customerOnly.every((d) => d.solutionName.toLowerCase().includes("customer"))).toBe(true);
    expect(customerOnly.some((d) => d.id === "dep-demo-cs")).toBe(true);
  });

  it("list({ tenant }) filters by tenant name or id substring in tenantResults", () => {
    demoDeploymentStore.record(
      makeRecord({
        id: "dep-demo-contoso",
        tenantResults: [
          {
            tenantId: "11111111-1111-1111-1111-111111111111",
            tenantName: "Contoso Corporation",
            status: "completed",
            attemptNumber: 1,
          },
        ],
      })
    );

    const filtered = demoDeploymentStore.list({ tenant: "contoso" });
    expect(filtered.some((d) => d.id === "dep-demo-contoso")).toBe(true);
  });

  it("list({ since }) drops records older than the cutoff", () => {
    const oldDate = new Date("2020-01-01T00:00:00Z").toISOString();
    demoDeploymentStore.record(
      makeRecord({ id: "dep-demo-old", createdAt: oldDate, updatedAt: oldDate })
    );
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-new" }));

    const recentOnly = demoDeploymentStore.list({
      since: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(recentOnly.some((d) => d.id === "dep-demo-new")).toBe(true);
    expect(recentOnly.some((d) => d.id === "dep-demo-old")).toBe(false);
  });

  it("findById() returns a recorded entry", () => {
    demoDeploymentStore.record(makeRecord({ id: "dep-demo-find-me" }));
    const found = demoDeploymentStore.findById("dep-demo-find-me");
    expect(found?.id).toBe("dep-demo-find-me");
  });

  it("findById() returns canned seed entries (e.g. demo-hist-000)", () => {
    const found = demoDeploymentStore.findById("demo-hist-000");
    expect(found?.id).toBe("demo-hist-000");
  });

  it("findById() returns undefined for unknown ids", () => {
    expect(demoDeploymentStore.findById("dep-demo-does-not-exist")).toBeUndefined();
  });
});
