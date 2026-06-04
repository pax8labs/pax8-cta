/**
 * Property-based tests for GDAP validation and risk analysis logic.
 *
 * Uses fast-check to generate random inputs and verify invariants
 * that must hold for any combination of relationships, roles,
 * tenants, and deployment histories.
 *
 * Ref: https://github.com/pax8labs/pax8-cta/issues/266
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import type { DelegatedAdminRelationship } from "../auth/gdap-client.js";
import {
  DeploymentRiskAnalyzer,
  type DeploymentContext,
  type DeploymentHistoryEntry,
  type RiskIssue,
  type RiskSeverity,
  type RiskCategory,
} from "../services/risk-analyzer.js";
import { healthChecker, type HealthCheckContext } from "../services/health-check.js";

// ============================================================================
// Arbitraries (generators)
// ============================================================================

const relationshipStatusArb = fc.constantFrom(
  "active" as const,
  "pending" as const,
  "terminated" as const,
  "expired" as const
);

const uuidArb = fc.uuid();

const PP_ADMIN_ROLE_ID = "11648597-926c-4cf3-9c36-bcebb0ba8dcc";

const roleIdArb = fc.oneof(
  fc.constant(PP_ADMIN_ROLE_ID), // Power Platform Admin
  fc.uuid() // random role
);

const roleArrayArb = fc
  .array(roleIdArb, { minLength: 0, maxLength: 5 })
  .map((ids) => ids.map((id) => ({ roleDefinitionId: id })));

const relationshipArb: fc.Arbitrary<DelegatedAdminRelationship> = fc.record({
  id: uuidArb,
  displayName: fc.string({ minLength: 1, maxLength: 30 }),
  customer: fc.record({
    tenantId: uuidArb,
    displayName: fc.string({ minLength: 1, maxLength: 30 }),
  }),
  status: relationshipStatusArb,
  accessDetails: fc.record({
    unifiedRoles: roleArrayArb,
  }),
  duration: fc.constant("P730D"),
  endDateTime: fc
    .integer({
      min: new Date("2024-01-01").getTime(),
      max: new Date("2028-01-01").getTime(),
    })
    .map((ts) => new Date(ts).toISOString()),
});

const tenantArb = fc.record({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  environmentUrl: fc.webUrl(),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 3 }),
});

const deploymentHistoryEntryArb: fc.Arbitrary<DeploymentHistoryEntry> = fc.record({
  tenantId: uuidArb,
  status: fc.constantFrom("success" as const, "failure" as const),
  error: fc.option(fc.string({ minLength: 5, maxLength: 100 }), { nil: undefined }),
  completedAt: fc
    .integer({
      min: new Date("2024-01-01").getTime(),
      max: new Date("2026-03-13").getTime(),
    })
    .map((ts) => new Date(ts).toISOString()),
  durationMinutes: fc.option(fc.integer({ min: 1, max: 120 }), { nil: undefined }),
});

const severityArb: fc.Arbitrary<RiskSeverity> = fc.constantFrom(
  "info",
  "warning",
  "error",
  "critical"
);

const categoryArb: fc.Arbitrary<RiskCategory> = fc.constantFrom(
  "permissions",
  "dependencies",
  "health",
  "timing",
  "history",
  "connections",
  "configuration"
);

const riskIssueArb: fc.Arbitrary<RiskIssue> = fc.record({
  severity: severityArb,
  category: categoryArb,
  message: fc.string({ minLength: 1, maxLength: 100 }),
  affectedTenants: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    { nil: undefined }
  ),
  resolution: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

// ============================================================================
// Tests: GDAP relationship validation (pure logic extracted from GdapClient)
// ============================================================================

describe("GDAP relationship validation properties", () => {
  /**
   * The logic under test from GdapClient.hasActiveRelationship:
   *   relationships.some(rel => rel.customer.tenantId === tenantId && rel.status === "active")
   */
  function hasActiveRelationship(
    relationships: DelegatedAdminRelationship[],
    customerTenantId: string
  ): boolean {
    return relationships.some(
      (rel) => rel.customer.tenantId === customerTenantId && rel.status === "active"
    );
  }

  /**
   * The logic under test from GdapClient.validatePowerPlatformAccess:
   *   Find relationship for tenant, check active + has PP Admin role
   */
  function validatePowerPlatformAccess(
    relationships: DelegatedAdminRelationship[],
    customerTenantId: string
  ): boolean {
    const relationship = relationships.find((rel) => rel.customer.tenantId === customerTenantId);
    if (!relationship || relationship.status !== "active") {
      return false;
    }
    return relationship.accessDetails.unifiedRoles.some(
      (role) => role.roleDefinitionId === PP_ADMIN_ROLE_ID
    );
  }

  it("hasActiveRelationship returns true iff there exists a matching active relationship", () => {
    fc.assert(
      fc.property(
        fc.array(relationshipArb, { maxLength: 10 }),
        uuidArb,
        (relationships, tenantId) => {
          const result = hasActiveRelationship(relationships, tenantId);
          const expected = relationships.some(
            (r) => r.customer.tenantId === tenantId && r.status === "active"
          );
          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("hasActiveRelationship is false when no relationships exist", () => {
    fc.assert(
      fc.property(uuidArb, (tenantId) => {
        expect(hasActiveRelationship([], tenantId)).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  it("hasActiveRelationship is false for non-active statuses even with matching tenantId", () => {
    fc.assert(
      fc.property(
        relationshipArb,
        fc.constantFrom("pending" as const, "terminated" as const, "expired" as const),
        (baseRel, nonActiveStatus) => {
          const rel: DelegatedAdminRelationship = {
            ...baseRel,
            status: nonActiveStatus,
          };
          expect(hasActiveRelationship([rel], rel.customer.tenantId)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("hasActiveRelationship is true when we inject an active relationship for that tenant", () => {
    fc.assert(
      fc.property(
        fc.array(relationshipArb, { maxLength: 5 }),
        relationshipArb,
        (others, baseRel) => {
          const activeRel: DelegatedAdminRelationship = {
            ...baseRel,
            status: "active",
          };
          const all = [...others, activeRel];
          expect(hasActiveRelationship(all, activeRel.customer.tenantId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("validatePowerPlatformAccess requires active status AND PP Admin role", () => {
    fc.assert(
      fc.property(
        fc.array(relationshipArb, { maxLength: 10 }),
        uuidArb,
        (relationships, tenantId) => {
          const result = validatePowerPlatformAccess(relationships, tenantId);

          // Manual expected check
          const rel = relationships.find((r) => r.customer.tenantId === tenantId);
          const expected =
            rel !== undefined &&
            rel.status === "active" &&
            rel.accessDetails.unifiedRoles.some((r) => r.roleDefinitionId === PP_ADMIN_ROLE_ID);

          expect(result).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("validatePowerPlatformAccess is false without PP Admin role even if active", () => {
    fc.assert(
      fc.property(relationshipArb, (baseRel) => {
        const rel: DelegatedAdminRelationship = {
          ...baseRel,
          status: "active",
          accessDetails: {
            unifiedRoles: [
              { roleDefinitionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
              { roleDefinitionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
            ],
          },
        };
        expect(validatePowerPlatformAccess([rel], rel.customer.tenantId)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it("validatePowerPlatformAccess is true with active status and PP Admin role", () => {
    fc.assert(
      fc.property(relationshipArb, (baseRel) => {
        const rel: DelegatedAdminRelationship = {
          ...baseRel,
          status: "active",
          accessDetails: {
            unifiedRoles: [
              ...baseRel.accessDetails.unifiedRoles,
              { roleDefinitionId: PP_ADMIN_ROLE_ID },
            ],
          },
        };
        expect(validatePowerPlatformAccess([rel], rel.customer.tenantId)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("validation results are deterministic (same input produces same output)", () => {
    fc.assert(
      fc.property(
        fc.array(relationshipArb, { maxLength: 10 }),
        uuidArb,
        (relationships, tenantId) => {
          const r1 = hasActiveRelationship(relationships, tenantId);
          const r2 = hasActiveRelationship(relationships, tenantId);
          expect(r1).toBe(r2);

          const v1 = validatePowerPlatformAccess(relationships, tenantId);
          const v2 = validatePowerPlatformAccess(relationships, tenantId);
          expect(v1).toBe(v2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Tests: Risk score calculation properties
// ============================================================================

describe("Risk score calculation properties", () => {
  // Extract the private method logic for direct testing
  function calculateRiskScore(issues: RiskIssue[]): "low" | "medium" | "high" | "critical" {
    let score = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case "critical":
          score += 40;
          break;
        case "error":
          score += 25;
          break;
        case "warning":
          score += 10;
          break;
        case "info":
          score += 2;
          break;
      }
    }
    if (score >= 80) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    return "low";
  }

  function calculateSuccessProbability(
    issues: RiskIssue[],
    history: DeploymentHistoryEntry[]
  ): number {
    let probability = 95;
    for (const issue of issues) {
      switch (issue.severity) {
        case "critical":
          probability -= 25;
          break;
        case "error":
          probability -= 15;
          break;
        case "warning":
          probability -= 8;
          break;
        case "info":
          probability -= 2;
          break;
      }
    }
    if (history.length > 0) {
      const successCount = history.filter((h) => h.status === "success").length;
      const historicalRate = (successCount / history.length) * 100;
      probability = probability * 0.6 + historicalRate * 0.4;
    }
    return Math.max(Math.min(Math.round(probability), 100), 0);
  }

  it("risk score is always one of the four valid levels", () => {
    fc.assert(
      fc.property(fc.array(riskIssueArb, { maxLength: 20 }), (issues) => {
        const score = calculateRiskScore(issues);
        expect(["low", "medium", "high", "critical"]).toContain(score);
      }),
      { numRuns: 300 }
    );
  });

  it("no issues always yields low risk", () => {
    expect(calculateRiskScore([])).toBe("low");
  });

  it("risk score is monotonically non-decreasing as issues are added", () => {
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };

    fc.assert(
      fc.property(fc.array(riskIssueArb, { minLength: 1, maxLength: 15 }), (issues) => {
        // Check each prefix of the issues array
        for (let i = 1; i <= issues.length; i++) {
          const subsetScore = calculateRiskScore(issues.slice(0, i - 1));
          const supersetScore = calculateRiskScore(issues.slice(0, i));
          expect(riskOrder[supersetScore]).toBeGreaterThanOrEqual(riskOrder[subsetScore]);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("two critical issues push score to at least high", () => {
    fc.assert(
      fc.property(fc.array(riskIssueArb, { maxLength: 5 }), (extraIssues) => {
        const criticals: RiskIssue[] = [
          { severity: "critical", category: "permissions", message: "issue 1" },
          { severity: "critical", category: "permissions", message: "issue 2" },
        ];
        const score = calculateRiskScore([...criticals, ...extraIssues]);
        expect(["high", "critical"]).toContain(score);
      }),
      { numRuns: 100 }
    );
  });

  it("success probability is always clamped between 0 and 100", () => {
    fc.assert(
      fc.property(
        fc.array(riskIssueArb, { maxLength: 20 }),
        fc.array(deploymentHistoryEntryArb, { maxLength: 30 }),
        (issues, history) => {
          const prob = calculateSuccessProbability(issues, history);
          expect(prob).toBeGreaterThanOrEqual(0);
          expect(prob).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 300 }
    );
  });

  it("success probability is an integer", () => {
    fc.assert(
      fc.property(
        fc.array(riskIssueArb, { maxLength: 10 }),
        fc.array(deploymentHistoryEntryArb, { maxLength: 20 }),
        (issues, history) => {
          const prob = calculateSuccessProbability(issues, history);
          expect(Number.isInteger(prob)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("100% success history improves probability vs no history", () => {
    fc.assert(
      fc.property(fc.array(riskIssueArb, { minLength: 0, maxLength: 3 }), (issues) => {
        const noHistory = calculateSuccessProbability(issues, []);
        const goodHistory = calculateSuccessProbability(
          issues,
          Array.from({ length: 10 }, (_, i) => ({
            tenantId: "tenant-1",
            status: "success" as const,
            completedAt: new Date().toISOString(),
          }))
        );
        // With all successes, history should help (or at least not hurt much)
        // The blending formula: prob * 0.6 + 100 * 0.4 = prob * 0.6 + 40
        // vs noHistory (just prob). Since 0.6*prob+40 >= prob when prob <= 100,
        // this is always >= when prob <= 100 (which it always is)
        expect(goodHistory).toBeGreaterThanOrEqual(noHistory);
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Tests: Health checker scoring properties
// ============================================================================

describe("Health checker scoring properties", () => {
  // Extract the private calculateHealthScore logic
  function calculateHealthScore(
    issues: { severity: "info" | "warning" | "error" | "critical" }[],
    successRate: number
  ): number {
    let score = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case "critical":
          score -= 40;
          break;
        case "error":
          score -= 25;
          break;
        case "warning":
          score -= 10;
          break;
        case "info":
          score -= 2;
          break;
      }
    }
    const historyScore = successRate * 30;
    score = score * 0.7 + historyScore;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function determineStatus(
    score: number,
    issues: { severity: "info" | "warning" | "error" | "critical" }[]
  ): "healthy" | "warning" | "critical" {
    if (issues.some((i) => i.severity === "critical") || score < 40) {
      return "critical";
    }
    if (issues.some((i) => i.severity === "error" || i.severity === "warning") || score < 70) {
      return "warning";
    }
    return "healthy";
  }

  it("health score is always in [0, 100]", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ severity: severityArb }), { maxLength: 20 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (issues, successRate) => {
          const score = calculateHealthScore(issues, successRate);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 300 }
    );
  });

  it("health score is an integer", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ severity: severityArb }), { maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (issues, successRate) => {
          const score = calculateHealthScore(issues, successRate);
          expect(Number.isInteger(score)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("no issues with 100% success rate yields perfect or near-perfect health", () => {
    const score = calculateHealthScore([], 1.0);
    // 100 * 0.7 + 30 = 100
    expect(score).toBe(100);
  });

  it("critical issues always produce critical or warning status", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ severity: severityArb }), { maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (extraIssues, successRate) => {
          const issues = [{ severity: "critical" as const }, ...extraIssues];
          const score = calculateHealthScore(issues, successRate);
          const status = determineStatus(score, issues);
          // A critical issue must produce "critical" status
          expect(status).toBe("critical");
        }
      ),
      { numRuns: 200 }
    );
  });

  it("healthy status requires no critical/error/warning issues and score >= 70", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ severity: severityArb }), { maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (issues, successRate) => {
          const score = calculateHealthScore(issues, successRate);
          const status = determineStatus(score, issues);

          if (status === "healthy") {
            expect(
              issues.every(
                (i) =>
                  i.severity !== "critical" && i.severity !== "error" && i.severity !== "warning"
              )
            ).toBe(true);
            expect(score).toBeGreaterThanOrEqual(70);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("status determination is deterministic", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ severity: severityArb }), { maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (issues, successRate) => {
          const score = calculateHealthScore(issues, successRate);
          const s1 = determineStatus(score, issues);
          const s2 = determineStatus(score, issues);
          expect(s1).toBe(s2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Tests: DeploymentRiskAnalyzer integration properties
// ============================================================================

describe("DeploymentRiskAnalyzer integration properties", () => {
  let analyzer: DeploymentRiskAnalyzer;
  const origEnv = process.env.DEMO_MODE;

  beforeEach(() => {
    analyzer = new DeploymentRiskAnalyzer();
    // Disable demo mode so the simulated GDAP/connection checks are deterministic
    process.env.DEMO_MODE = "false";
  });

  afterEach(() => {
    process.env.DEMO_MODE = origEnv;
  });

  it("analyze always returns valid structure with all required fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        fc.array(deploymentHistoryEntryArb, { maxLength: 20 }),
        async (tenants, isProduction, history) => {
          const context: DeploymentContext = {
            tenants,
            isProduction,
            deploymentHistory: history,
          };

          const result = await analyzer.analyze(context);

          // Structure validation
          expect(["low", "medium", "high", "critical"]).toContain(result.score);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(100);
          expect(result.successProbability).toBeGreaterThanOrEqual(0);
          expect(result.successProbability).toBeLessThanOrEqual(100);
          expect(result.estimatedDuration.min).toBeGreaterThanOrEqual(0);
          expect(result.estimatedDuration.max).toBeGreaterThanOrEqual(result.estimatedDuration.min);
          expect(Array.isArray(result.issues)).toBe(true);
          expect(Array.isArray(result.recommendations)).toBe(true);
          expect(Array.isArray(result.blockers)).toBe(true);
          expect(typeof result.canProceed).toBe("boolean");
          expect(typeof result.requiresApproval).toBe("boolean");
        }
      ),
      { numRuns: 50 }
    );
  });

  it("recommendations array is never empty", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 5 }),
        fc.boolean(),
        async (tenants, isProduction) => {
          const context: DeploymentContext = { tenants, isProduction };
          const result = await analyzer.analyze(context);
          expect(result.recommendations.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("canProceed is false iff there are critical blockers", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 5 }),
        fc.boolean(),
        fc.array(deploymentHistoryEntryArb, { maxLength: 10 }),
        async (tenants, isProduction, history) => {
          const context: DeploymentContext = {
            tenants,
            isProduction,
            deploymentHistory: history,
          };
          const result = await analyzer.analyze(context);

          const hasCritical = result.issues.some((i) => i.severity === "critical");
          expect(result.canProceed).toBe(!hasCritical);
          expect(result.blockers.length > 0).toBe(hasCritical);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("production deployments always require approval", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(tenantArb, { minLength: 1, maxLength: 3 }), async (tenants) => {
        const context: DeploymentContext = {
          tenants,
          isProduction: true,
        };
        const result = await analyzer.analyze(context);
        expect(result.requiresApproval).toBe(true);
      }),
      { numRuns: 30 }
    );
  });

  it("estimated duration scales with tenant count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 3 }),
        fc.array(tenantArb, { minLength: 4, maxLength: 8 }),
        async (smallSet, largeSet) => {
          const smallCtx: DeploymentContext = {
            tenants: smallSet,
            isProduction: false,
          };
          const largeCtx: DeploymentContext = {
            tenants: largeSet,
            isProduction: false,
          };

          const smallResult = await analyzer.analyze(smallCtx);
          const largeResult = await analyzer.analyze(largeCtx);

          // More tenants should generally mean longer minimum duration
          // (base is 2min per tenant, so this should always hold when
          // issue counts are the same -- which they are in non-demo mode)
          expect(largeResult.estimatedDuration.min).toBeGreaterThanOrEqual(
            smallResult.estimatedDuration.min
          );
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ============================================================================
// Tests: Deployment history analysis properties
// ============================================================================

describe("Deployment history analysis properties", () => {
  let analyzer: DeploymentRiskAnalyzer;
  const origEnv = process.env.DEMO_MODE;

  beforeEach(() => {
    analyzer = new DeploymentRiskAnalyzer();
    process.env.DEMO_MODE = "false";
  });

  afterEach(() => {
    process.env.DEMO_MODE = origEnv;
  });

  it("low historical success rate (< 70%) with >= 20 deployments produces a warning issue", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 2 }),
        fc.integer({ min: 0, max: 13 }), // success count (< 70% of 20)
        async (tenants, successCount) => {
          // Build a history with exactly 20 entries and a low success rate
          const totalDeployments = 20;
          const history: DeploymentHistoryEntry[] = [];
          for (let i = 0; i < totalDeployments; i++) {
            history.push({
              tenantId: tenants[0].id,
              status: i < successCount ? "success" : "failure",
              completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago (outside 24hr window)
              error: i >= successCount ? "Some error\nDetails" : undefined,
            });
          }

          const context: DeploymentContext = {
            tenants,
            isProduction: false,
            deploymentHistory: history,
          };

          const result = await analyzer.analyze(context);

          const historyIssues = result.issues.filter((i) => i.category === "history");
          // With < 70% success and >= 20 deployments, expect a warning
          const hasLowSuccessWarning = historyIssues.some(
            (i) => i.severity === "warning" && i.message.includes("success rate")
          );
          expect(hasLowSuccessWarning).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("all-success history with < 20 deployments gets info-level issue (limited data)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tenantArb, { minLength: 1, maxLength: 2 }),
        fc.integer({ min: 1, max: 19 }),
        async (tenants, count) => {
          const history: DeploymentHistoryEntry[] = Array.from({ length: count }, () => ({
            tenantId: tenants[0].id,
            status: "success" as const,
            completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          }));

          const context: DeploymentContext = {
            tenants,
            isProduction: false,
            deploymentHistory: history,
          };

          const result = await analyzer.analyze(context);

          const historyIssues = result.issues.filter((i) => i.category === "history");
          // Should have info about limited history
          const hasLimitedInfo = historyIssues.some(
            (i) => i.severity === "info" && i.message.includes("Limited deployment history")
          );
          expect(hasLimitedInfo).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("no deployment history produces an info issue", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(tenantArb, { minLength: 1, maxLength: 3 }), async (tenants) => {
        const context: DeploymentContext = {
          tenants,
          isProduction: false,
          deploymentHistory: [],
        };

        const result = await analyzer.analyze(context);

        const historyIssues = result.issues.filter((i) => i.category === "history");
        expect(historyIssues.some((i) => i.severity === "info")).toBe(true);
      }),
      { numRuns: 20 }
    );
  });
});
