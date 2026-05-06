/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * Phase 1 deploy-preflight unit tests.
 *
 *  - `evaluateOp` exhaustively for each comparison op edge case.
 *  - `PreconditionManifestSchema` for the validation messages users see.
 *  - `checkPreconditions` against synthetic state — including the
 *    missing-resource case and the multi-requirement-per-precondition
 *    "one failure per requirement" emission policy.
 *  - `loadPreconditionManifest` round-trip from YAML on disk.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateOp, checkPreconditions } from "../preconditions/check.js";
import type { PreconditionStateResolver } from "../preconditions/check.js";
import type { PreconditionManifest } from "../preconditions/types.js";
import {
  PreconditionManifestSchema,
  PreconditionManifestValidationError,
} from "../preconditions/schema.js";
import { loadPreconditionManifest, normalizeSolutionName } from "../preconditions/loader.js";
import type { TenantConfig } from "../config/schema.js";
import type { DemoPreconditionState } from "../mock/demo-data.js";

const tenant = (id: string, name: string): TenantConfig => ({
  name,
  tenantId: id,
  environmentUrl: `https://${name.toLowerCase().replace(/\s/g, "-")}.example.com`,
  tags: [],
  enabled: true,
  autoSetup: true,
});

describe("evaluateOp", () => {
  describe("equals / not-equals", () => {
    it("strings: equals matches identical, not-equals inverts", () => {
      expect(evaluateOp("equals", "enabled", "enabled")).toBe(true);
      expect(evaluateOp("equals", "reportOnly", "enabled")).toBe(false);
      expect(evaluateOp("not-equals", "reportOnly", "enabled")).toBe(true);
      expect(evaluateOp("not-equals", "enabled", "enabled")).toBe(false);
    });

    it("deep equality on objects and arrays", () => {
      expect(evaluateOp("equals", { a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(evaluateOp("equals", [1, 2, 3], [1, 2, 3])).toBe(true);
      expect(evaluateOp("equals", [1, 2, 3], [1, 2])).toBe(false);
      expect(evaluateOp("equals", { a: 1 }, { a: 2 })).toBe(false);
    });

    it("treats null and undefined as distinct", () => {
      expect(evaluateOp("equals", null, undefined)).toBe(false);
      expect(evaluateOp("equals", null, null)).toBe(true);
    });
  });

  describe("at-least", () => {
    it("booleans: true >= true|false, false >= false only", () => {
      expect(evaluateOp("at-least", true, true)).toBe(true);
      expect(evaluateOp("at-least", true, false)).toBe(true);
      expect(evaluateOp("at-least", false, true)).toBe(false);
      expect(evaluateOp("at-least", false, false)).toBe(true);
    });

    it("numbers: standard >= comparison", () => {
      expect(evaluateOp("at-least", 5, 3)).toBe(true);
      expect(evaluateOp("at-least", 3, 3)).toBe(true);
      expect(evaluateOp("at-least", 2, 3)).toBe(false);
    });

    it("arrays: current must be a superset of required", () => {
      expect(evaluateOp("at-least", ["mfa", "compliantDevice"], ["mfa"])).toBe(true);
      expect(evaluateOp("at-least", ["mfa"], ["mfa", "compliantDevice"])).toBe(false);
      expect(evaluateOp("at-least", ["mfa"], [])).toBe(true);
    });

    it("type mismatch returns false", () => {
      expect(evaluateOp("at-least", "high", "low")).toBe(false);
      expect(evaluateOp("at-least", true, 1)).toBe(false);
    });
  });

  describe("includes", () => {
    it("returns true when current array contains the required value", () => {
      expect(evaluateOp("includes", ["mfa", "compliantDevice"], "mfa")).toBe(true);
      expect(evaluateOp("includes", ["a", "b"], "c")).toBe(false);
    });

    it("non-array current returns false", () => {
      expect(evaluateOp("includes", "mfa", "mfa")).toBe(false);
    });

    it("deep-equality match on object element", () => {
      expect(evaluateOp("includes", [{ k: 1 }, { k: 2 }], { k: 2 })).toBe(true);
    });
  });

  describe("subset-of", () => {
    it("true when every element of current is in required", () => {
      expect(evaluateOp("subset-of", ["a", "b"], ["a", "b", "c"])).toBe(true);
      expect(evaluateOp("subset-of", ["a", "z"], ["a", "b"])).toBe(false);
    });

    it("empty current is always a subset", () => {
      expect(evaluateOp("subset-of", [], ["a", "b"])).toBe(true);
    });
  });
});

describe("PreconditionManifestSchema", () => {
  const validManifest = (): PreconditionManifest => ({
    solution: "FooAgent",
    version: "1.0.0",
    preconditions: [
      {
        id: "ca-1",
        description: "CA must be enforced.",
        resourceType: "microsoft.entra.conditionalaccesspolicy",
        matcher: { displayName: "MFA Admins" },
        requirements: [{ property: "state", op: "equals", value: "enabled" }],
        severity: "error",
        remediation: {
          kind: "link",
          title: "Enable",
          urlTemplate: "https://example.com/{tenantId}",
          manualSteps: [],
        },
      },
    ],
  });

  it("accepts a fully-formed manifest", () => {
    const result = PreconditionManifestSchema.safeParse(validManifest());
    expect(result.success).toBe(true);
  });

  it("rejects missing solution with a clear message", () => {
    const bad = validManifest() as unknown as Record<string, unknown>;
    delete bad.solution;
    const result = PreconditionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("solution"))).toBe(true);
    }
  });

  it("rejects unknown comparison op", () => {
    const bad = validManifest();
    (bad.preconditions[0].requirements[0] as { op: string }).op = "before";
    const result = PreconditionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const bad = validManifest();
    (bad.preconditions[0] as { severity: string }).severity = "fatal";
    const result = PreconditionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires at least one step on manual remediation", () => {
    const bad = validManifest();
    bad.preconditions[0].remediation = { kind: "manual", title: "fix", steps: [] };
    const result = PreconditionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("requires urlTemplate on link remediation", () => {
    const bad = validManifest();
    (bad.preconditions[0].remediation as { urlTemplate: string }).urlTemplate = "";
    const result = PreconditionManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("checkPreconditions", () => {
  const manifest: PreconditionManifest = {
    solution: "FooAgent",
    version: "1.0.0",
    preconditions: [
      {
        id: "ca-policy",
        description: "CA must be enforced.",
        resourceType: "microsoft.entra.conditionalaccesspolicy",
        matcher: { displayName: "Require MFA" },
        requirements: [
          { property: "state", op: "equals", value: "enabled" },
          { property: "requireMfa", op: "at-least", value: true },
        ],
        severity: "error",
        remediation: { kind: "manual", title: "fix", steps: ["go to portal"] },
      },
    ],
  };

  const t1 = tenant("11111111-1111-1111-1111-111111111111", "T1");
  const t2 = tenant("22222222-2222-2222-2222-222222222222", "T2");
  const t3 = tenant("33333333-3333-3333-3333-333333333333", "T3");

  it("emits one failure per failed requirement (not per precondition)", () => {
    // T1: BOTH requirements fail (state=reportOnly, requireMfa=false).
    const resolver: PreconditionStateResolver = (t) => {
      if (t.tenantId === t1.tenantId) {
        return {
          resourceType: "microsoft.entra.conditionalaccesspolicy",
          resourceMatcher: { displayName: "Require MFA" },
          resourceDisplayName: "Require MFA",
          currentProperties: { id: "p-1", state: "reportOnly", requireMfa: false },
        };
      }
      return "missing-resource";
    };
    const failures = checkPreconditions(manifest, [t1], resolver);
    expect(failures).toHaveLength(2);
    const properties = failures.map((f) => f.failedProperty).sort();
    expect(properties).toEqual(["requireMfa", "state"]);
  });

  it("missing-resource emits exactly one failure with the matcher as required-value", () => {
    const resolver: PreconditionStateResolver = () => "missing-resource";
    const failures = checkPreconditions(manifest, [t2], resolver);
    expect(failures).toHaveLength(1);
    expect(failures[0].failedProperty).toBe("<resource not present>");
    expect(failures[0].requiredValue).toEqual({ displayName: "Require MFA" });
    expect(failures[0].resourceId).toBe("");
  });

  it("a passing tenant emits zero failures", () => {
    const resolver: PreconditionStateResolver = () => ({
      resourceType: "microsoft.entra.conditionalaccesspolicy",
      resourceMatcher: { displayName: "Require MFA" },
      resourceDisplayName: "Require MFA",
      currentProperties: { id: "p-3", state: "enabled", requireMfa: true },
    });
    const failures = checkPreconditions(manifest, [t3], resolver);
    expect(failures).toHaveLength(0);
  });

  it("populates resourceId from currentProperties.id", () => {
    const state: DemoPreconditionState = {
      resourceType: "microsoft.entra.conditionalaccesspolicy",
      resourceMatcher: { displayName: "Require MFA" },
      resourceDisplayName: "Require MFA",
      currentProperties: { id: "ca-pol-xyz", state: "reportOnly", requireMfa: true },
    };
    const failures = checkPreconditions(manifest, [t1], () => state);
    expect(failures).toHaveLength(1);
    expect(failures[0].resourceId).toBe("ca-pol-xyz");
  });

  it("walks dot-paths into nested currentProperties", () => {
    const nested: PreconditionManifest = {
      solution: "FooAgent",
      version: "1.0.0",
      preconditions: [
        {
          id: "p",
          description: "d",
          resourceType: "x",
          matcher: { displayName: "x" },
          requirements: [{ property: "outer.inner", op: "equals", value: "ok" }],
          severity: "warning",
          remediation: { kind: "manual", title: "t", steps: ["s"] },
        },
      ],
    };
    const resolverPasses: PreconditionStateResolver = () => ({
      resourceType: "x",
      resourceMatcher: { displayName: "x" },
      resourceDisplayName: "x",
      currentProperties: { outer: { inner: "ok" } },
    });
    const resolverFails: PreconditionStateResolver = () => ({
      resourceType: "x",
      resourceMatcher: { displayName: "x" },
      resourceDisplayName: "x",
      currentProperties: { outer: { inner: "nope" } },
    });
    expect(checkPreconditions(nested, [t1], resolverPasses)).toHaveLength(0);
    expect(checkPreconditions(nested, [t1], resolverFails)).toHaveLength(1);
  });
});

describe("normalizeSolutionName", () => {
  it("strips a .zip extension", () => {
    expect(normalizeSolutionName("CustomerServiceAgent.zip")).toBe("CustomerServiceAgent");
  });
  it("strips a leading directory", () => {
    expect(normalizeSolutionName("./agent packages/Foo.zip")).toBe("Foo");
  });
  it("returns input unchanged when no .zip extension", () => {
    expect(normalizeSolutionName("CustomerServiceAgent")).toBe("CustomerServiceAgent");
  });
});

describe("loadPreconditionManifest", () => {
  it("returns null when no manifest is found in any search dir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-"));
    const result = await loadPreconditionManifest("Nope", [dir]);
    expect(result).toBeNull();
  });

  it("loads and validates a YAML manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-"));
    const yaml = `
solution: FooAgent
version: 1.2.3
preconditions:
  - id: ca-1
    description: must enable
    resourceType: x
    matcher:
      displayName: y
    requirements:
      - property: state
        op: equals
        value: enabled
    severity: error
    remediation:
      kind: link
      title: Open
      urlTemplate: https://example.com/{tenantId}
      manualSteps: []
`;
    writeFileSync(join(dir, "FooAgent.preconditions.yaml"), yaml);
    const result = await loadPreconditionManifest("FooAgent", [dir]);
    expect(result?.solution).toBe("FooAgent");
    expect(result?.preconditions).toHaveLength(1);
  });

  it("throws PreconditionManifestValidationError when the YAML is malformed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-"));
    const yaml = `
solution: FooAgent
# version intentionally missing — should fail validation
preconditions: []
`;
    writeFileSync(join(dir, "FooAgent.preconditions.yaml"), yaml);
    await expect(loadPreconditionManifest("FooAgent", [dir])).rejects.toBeInstanceOf(
      PreconditionManifestValidationError
    );
  });

  it("falls back to .yml when .yaml is absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "preflight-"));
    const yaml = `
solution: BarAgent
version: 0.1.0
preconditions: []
`;
    writeFileSync(join(dir, "BarAgent.preconditions.yml"), yaml);
    const result = await loadPreconditionManifest("BarAgent", [dir]);
    expect(result?.solution).toBe("BarAgent");
  });
});
