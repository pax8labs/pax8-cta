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
 * In-process store for demo-mode deployments.
 *
 * Why this exists:
 *   The demo `pax8-cta deploy` flow prints a tracking ID like `dep-demo-mos0ueva`
 *   for visual continuity, but the demo `deployments list` / `deployments show`
 *   commands previously read from `generateMockDeploymentHistory()` only — which
 *   meant a freshly-printed tracking ID did not appear when the user looked at
 *   their deployment history seconds later. This broke the natural
 *   "I just deployed → show me what landed" demo beat.
 *
 * Design:
 *   - Module-scope singleton (`demoDeploymentStore`) so REPL invocations within a
 *     single process share state. New CLI subprocess invocations get a fresh
 *     store, which keeps demo mode feeling ephemeral.
 *   - Lazily seeds itself with `generateMockDeploymentHistory()` on first
 *     read. This preserves the existing canned history shown on a clean
 *     `deployments list`, while letting freshly-recorded deploys appear at the
 *     top of the list.
 *   - Records are stored newest-first (latest `record()` lands at index 0).
 *     Filters mirror the legacy demo filtering logic in
 *     `packages/cli/src/commands/deployments/helpers.ts`.
 */

import type { DeploymentJob } from "../config/schema.js";
import { generateMockDeploymentHistory } from "./demo-data.js";

export interface DemoDeploymentListFilters {
  status?: string;
  tenant?: string;
  agent?: string;
  /** Earliest `createdAt` to include (inclusive). */
  since?: Date;
}

class DemoDeploymentStoreImpl {
  private records: DeploymentJob[] = [];
  private seeded = false;

  /** Lazily populate with canned history so first-time `list` still has content. */
  private ensureSeeded(): void {
    if (this.seeded) return;
    this.seeded = true;
    // Newest-first ordering matches the existing demo list contract.
    this.records.push(
      ...generateMockDeploymentHistory(50).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  }

  /**
   * Append a new deployment record to the top of the in-process list.
   * The latest record will be returned first by `list()`.
   */
  record(deployment: DeploymentJob): void {
    this.ensureSeeded();
    // Replace any existing record with the same id (idempotent record on retry).
    const existingIndex = this.records.findIndex((d) => d.id === deployment.id);
    if (existingIndex >= 0) {
      this.records.splice(existingIndex, 1);
    }
    // Why: `ensureSeeded()` runs `generateMockDeploymentHistory()` which calls
    // its own `Date.now()` AFTER the caller computed `deployment.createdAt`.
    // On a sub-millisecond gap that puts `demo-hist-000`'s createdAt strictly
    // newer than the deploy the user just performed, so downstream
    // sort-by-createdAt-desc (in `filterDeployments`) bumps the user's deploy
    // off index 0. Force fresh deploys (createdAt within 1s of "now") to win
    // that sort; back-dated records (e.g. tests intentionally inserting 2020
    // timestamps) are left alone so `list({ since })` semantics still work.
    const now = Date.now();
    const deployCreatedAt = new Date(deployment.createdAt).getTime();
    const isFreshDeploy = Math.abs(now - deployCreatedAt) < 1000;
    if (isFreshDeploy) {
      const maxExistingCreatedAt = this.records.reduce(
        (max, r) => Math.max(max, new Date(r.createdAt).getTime()),
        0
      );
      if (deployCreatedAt <= maxExistingCreatedAt) {
        deployment = {
          ...deployment,
          createdAt: new Date(maxExistingCreatedAt + 1).toISOString(),
        };
      }
    }
    this.records.unshift(deployment);
  }

  /**
   * Return all records (already sorted newest-first), filtered by the same
   * predicates the demo `deployments list` command supports.
   */
  list(filters: DemoDeploymentListFilters = {}): DeploymentJob[] {
    this.ensureSeeded();
    let entries = [...this.records];

    if (filters.status) {
      const status = filters.status.toLowerCase();
      entries = entries.filter((d) => d.status === status);
    }
    if (filters.agent) {
      const name = filters.agent.toLowerCase();
      entries = entries.filter((d) => d.solutionName.toLowerCase().includes(name));
    }
    if (filters.tenant) {
      const q = filters.tenant.toLowerCase();
      entries = entries.filter((d) =>
        d.tenantResults?.some(
          (t) => t.tenantName.toLowerCase().includes(q) || t.tenantId.toLowerCase().includes(q)
        )
      );
    }
    if (filters.since) {
      const cutoff = filters.since.getTime();
      entries = entries.filter((d) => new Date(d.createdAt).getTime() >= cutoff);
    }

    return entries;
  }

  /** Return a single record by id (or undefined). Includes seeded history. */
  findById(id: string): DeploymentJob | undefined {
    this.ensureSeeded();
    return this.records.find((d) => d.id === id);
  }

  /**
   * Reset the store to an empty, unseeded state. Intended for tests — production
   * demo flows should never need to clear it.
   */
  reset(): void {
    this.records = [];
    this.seeded = false;
  }
}

/**
 * Module-scope singleton. Importing this from anywhere in the same Node process
 * (CLI invocation, REPL session) shares the same record list.
 */
export const demoDeploymentStore = new DemoDeploymentStoreImpl();

export type DemoDeploymentStore = DemoDeploymentStoreImpl;
