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
 * Preflight (precondition) types — Phase 1.
 *
 * The preflight feature surfaces tenant-config requirements that must be
 * satisfied before a solution can deploy. Phase 1 reads these from a sibling
 * YAML manifest and matches them against synthetic per-tenant state on
 * `DEMO_TENANTS`. Phase 2 will replace the synthetic resolver with real
 * Microsoft Graph TCM calls; the diff engine and types stay the same.
 */

/**
 * Comparison operators supported in a precondition requirement.
 *
 *  - `equals` / `not-equals` — strict deep equality.
 *  - `at-least` — booleans (true >= true|false), numbers (>= required), arrays
 *    (current ⊇ required, i.e. current is a superset of required).
 *  - `includes` — current is an array containing the required value.
 *  - `subset-of` — current is an array, every element appears in required.
 */
export type ComparisonOp = "equals" | "not-equals" | "at-least" | "includes" | "subset-of";

/**
 * A single property check on a matched resource.
 * `property` is a dot-path within the resource's `currentProperties`.
 */
export interface PreconditionRequirement {
  property: string;
  op: ComparisonOp;
  value: unknown;
}

/**
 * Structured remediation. Three kinds, mutually exclusive:
 *  - `link` — open a deep link to fix in a portal.
 *  - `command` — runnable CLI command the user can fire from pax8-cta.
 *  - `manual` — list of instructions when no automation exists.
 *
 * `urlTemplate` and any string in `manualSteps` / `cmd` may include `{tenantId}`
 * `{tenantName}` `{resourceId}` `{resourceDisplayName}` placeholders, which the
 * CLI substitutes at render time.
 */
export type Remediation =
  | { kind: "link"; title: string; urlTemplate: string; manualSteps: string[] }
  | { kind: "command"; title: string; cmd: string; description: string }
  | { kind: "manual"; title: string; steps: string[] };

/**
 * One precondition. A resource must match `matcher` (e.g. by `displayName`)
 * and then every entry in `requirements` must hold.
 */
export interface Precondition {
  id: string;
  description: string;
  resourceType: string;
  matcher: Record<string, string>;
  requirements: PreconditionRequirement[];
  /** `error` blocks deploy; `warning` is informational. */
  severity: "error" | "warning";
  remediation: Remediation;
}

/**
 * The on-disk manifest format. Lives next to the solution `.zip` as
 * `<solution>.preconditions.yaml`.
 */
export interface PreconditionManifest {
  solution: string;
  version: string;
  preconditions: Precondition[];
}

/**
 * One materialized "this requirement failed" record. Built by the diff
 * engine; rendered by the CLI; flattened into the analyze envelope under
 * `preconditions.failures`.
 */
export interface PreconditionFailure {
  tenantId: string;
  tenantName: string;
  preconditionId: string;
  description: string;
  resourceType: string;
  resourceDisplayName: string;
  /**
   * Resource id pulled from `currentProperties.id` when the resolver returned
   * a state object with one. Empty string when unknown (e.g. the resource
   * was missing from this tenant). Used to fill `{resourceId}` placeholders
   * in remediation templates.
   */
  resourceId: string;
  failedProperty: string;
  currentValue: unknown;
  requiredValue: unknown;
  comparisonOp: ComparisonOp;
  severity: "error" | "warning";
  remediation: Remediation;
}
