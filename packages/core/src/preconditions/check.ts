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

import type { TenantConfig } from "../config/schema.js";
import type { DemoPreconditionState } from "../mock/demo-data.js";
import type {
  ComparisonOp,
  Precondition,
  PreconditionFailure,
  PreconditionManifest,
} from "./types.js";

/**
 * Resolver contract: given a tenant + precondition, return the synthetic
 * (Phase 1) or live (Phase 2) state of the matched resource — or the literal
 * `"missing-resource"` when nothing in the tenant matches the precondition's
 * `matcher`. Absence is itself a finding, not an error.
 */
export type PreconditionStateResolver = (
  tenant: TenantConfig,
  precondition: Precondition
) => DemoPreconditionState | "missing-resource";

/**
 * Walk a dot-path within an object. Returns `undefined` for any segment
 * that's not a plain object on the path. Used to resolve a requirement's
 * `property` against the resource's `currentProperties`.
 */
function getByDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Strict deep equality. Mirrors Node's util.isDeepStrictEqual semantics for
 * the JSON-shaped values we expect from YAML manifests + synthetic state.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

/**
 * Apply a `ComparisonOp` between the actual property value and the
 * requirement's required value. Returns true when the requirement is
 * satisfied.
 */
export function evaluateOp(op: ComparisonOp, current: unknown, required: unknown): boolean {
  switch (op) {
    case "equals":
      return deepEqual(current, required);
    case "not-equals":
      return !deepEqual(current, required);
    case "at-least": {
      // booleans: true >= true|false, false satisfies only false.
      if (typeof current === "boolean" && typeof required === "boolean") {
        return Number(current) >= Number(required);
      }
      // numbers: standard >=.
      if (typeof current === "number" && typeof required === "number") {
        return current >= required;
      }
      // arrays: current ⊇ required (every required element appears in current).
      if (Array.isArray(current) && Array.isArray(required)) {
        return required.every((v) => current.some((c) => deepEqual(c, v)));
      }
      // mismatched / unsupported types → not satisfied.
      return false;
    }
    case "includes": {
      if (!Array.isArray(current)) return false;
      return current.some((c) => deepEqual(c, required));
    }
    case "subset-of": {
      if (!Array.isArray(current) || !Array.isArray(required)) return false;
      return current.every((c) => required.some((r) => deepEqual(r, c)));
    }
  }
}

/**
 * Check every (tenant × precondition) pair against the supplied state
 * resolver and emit one `PreconditionFailure` per failed requirement.
 *
 * Phase 1 callers wire `resolveState` to a synthetic lookup against
 * `DEMO_TENANTS[].metadata.preconditionState`. Phase 2 will swap that for
 * a live Microsoft Graph TCM client; the rest of this function stays put.
 */
export function checkPreconditions(
  manifest: PreconditionManifest,
  tenants: TenantConfig[],
  resolveState: PreconditionStateResolver
): PreconditionFailure[] {
  const failures: PreconditionFailure[] = [];

  for (const tenant of tenants) {
    for (const precondition of manifest.preconditions) {
      const state = resolveState(tenant, precondition);

      if (state === "missing-resource") {
        // Render the matcher as a human-readable required-value so the user
        // sees what we were looking for (e.g. {displayName: "Require MFA..."}).
        failures.push({
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          preconditionId: precondition.id,
          description: precondition.description,
          resourceType: precondition.resourceType,
          resourceDisplayName:
            precondition.matcher.displayName ?? Object.values(precondition.matcher)[0] ?? "(none)",
          resourceId: "",
          failedProperty: "<resource not present>",
          currentValue: undefined,
          requiredValue: precondition.matcher,
          comparisonOp: "equals",
          severity: precondition.severity,
          remediation: precondition.remediation,
        });
        continue;
      }

      // Pull the resource id once for substitution into remediation templates.
      const resourceId =
        typeof state.currentProperties.id === "string" ? state.currentProperties.id : "";

      // Walk every requirement and emit one failure per mismatch — operators
      // explicitly want each line surfaced rather than collapsed.
      for (const requirement of precondition.requirements) {
        const current = getByDotPath(state.currentProperties, requirement.property);
        if (evaluateOp(requirement.op, current, requirement.value)) continue;

        failures.push({
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          preconditionId: precondition.id,
          description: precondition.description,
          resourceType: precondition.resourceType,
          resourceDisplayName: state.resourceDisplayName,
          resourceId,
          failedProperty: requirement.property,
          currentValue: current,
          requiredValue: requirement.value,
          comparisonOp: requirement.op,
          severity: precondition.severity,
          remediation: precondition.remediation,
        });
      }
    }
  }

  return failures;
}
