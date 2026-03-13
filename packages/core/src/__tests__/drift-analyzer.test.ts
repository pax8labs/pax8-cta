import { describe, it, expect } from "vitest";
import {
  DriftAnalyzer,
  TenantDeploymentHistory,
  TenantDriftAnalysis,
} from "../services/drift-analyzer.js";
import { TenantConfig } from "../config/schema.js";
import { TenantVersionStatus } from "../services/version-checker.js";

describe("DriftAnalyzer", () => {
  const analyzer = new DriftAnalyzer();

  const createTenant = (name: string, tags: string[] = [], enabled = true): TenantConfig => ({
    name,
    tenantId: `00000000-0000-0000-0000-${name.replace(/\s/g, "").padStart(12, "0").slice(0, 12)}`,
    environmentUrl: `https://${name.replace(/\s/g, "").toLowerCase()}.crm.dynamics.com`,
    tags,
    enabled,
  });

  const currentStatus = (tenantName: string): TenantVersionStatus => ({
    tenantId: "t1",
    tenantName,
    overallStatus: "current",
    solutions: [
      {
        uniqueName: "AgentA",
        friendlyName: "Agent A",
        expectedVersion: "1.0.0.0",
        deployedVersion: "1.0.0.0",
        status: "current",
        versionDrift: 0,
      },
    ],
    error: undefined,
  });

  const outdatedStatus = (tenantName: string, drift = 1): TenantVersionStatus => ({
    tenantId: "t1",
    tenantName,
    overallStatus: "outdated",
    solutions: [
      {
        uniqueName: "AgentA",
        friendlyName: "Agent A",
        expectedVersion: "2.0.0.0",
        deployedVersion: "1.0.0.0",
        status: "outdated",
        versionDrift: drift,
      },
    ],
    error: undefined,
  });

  // ==========================================================================
  // Current tenants — short-circuit
  // ==========================================================================

  describe("analyzeTenant — current tenant", () => {
    it("returns recommendation 'current' with score 0", () => {
      const tenant = createTenant("Acme");
      const result = analyzer.analyzeTenant(tenant, currentStatus("Acme"));

      expect(result.recommendation).toBe("current");
      expect(result.riskScore).toBe(0);
      expect(result.riskLevel).toBe("low");
      expect(result.factors).toHaveLength(0);
      expect(result.outdatedSolutions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Version drift factor
  // ==========================================================================

  describe("analyzeTenant — version drift factor", () => {
    it("scores 1 version behind as low risk", () => {
      const result = analyzer.analyzeTenant(createTenant("T1"), outdatedStatus("T1", 1));

      const factor = result.factors.find((f) => f.name === "versions_behind");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("low");
    });

    it("scores 2 versions behind as medium risk", () => {
      const result = analyzer.analyzeTenant(createTenant("T2"), outdatedStatus("T2", 2));

      const factor = result.factors.find((f) => f.name === "versions_behind");
      expect(factor!.level).toBe("medium");
    });

    it("scores 3+ versions behind as high risk", () => {
      const result = analyzer.analyzeTenant(createTenant("T3"), outdatedStatus("T3", 5));

      const factor = result.factors.find((f) => f.name === "versions_behind");
      expect(factor!.level).toBe("high");
      expect(factor!.description).toContain("5 version(s) behind");
    });
  });

  // ==========================================================================
  // Deployment history factors
  // ==========================================================================

  describe("analyzeTenant — deployment history", () => {
    it("flags last deploy failed as high risk", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "failure",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 5,
        successfulDeploys: 4,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "last_deploy_failed");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("high");
    });

    it("flags last deploy succeeded as low risk", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 5,
        successfulDeploys: 5,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "last_deploy_succeeded");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("low");
    });

    it("flags stale environment (>90 days) as high risk", () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 100);

      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: staleDate.toISOString(),
        totalDeploys: 1,
        successfulDeploys: 1,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "stale_environment");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("high");
    });

    it("flags aging environment (30-90 days) as medium risk", () => {
      const agingDate = new Date();
      agingDate.setDate(agingDate.getDate() - 45);

      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: agingDate.toISOString(),
        totalDeploys: 1,
        successfulDeploys: 1,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "aging_environment");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("medium");
    });

    it("flags low success rate (<50%) as high risk", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 3,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "low_success_rate");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("high");
      expect(factor!.description).toContain("30%");
    });

    it("flags moderate success rate (50-80%) as medium risk", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 6,
      };

      const result = analyzer.analyzeTenant(createTenant("T"), outdatedStatus("T", 1), history);

      const factor = result.factors.find((f) => f.name === "moderate_success_rate");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("medium");
    });
  });

  // ==========================================================================
  // Tenant tag factors
  // ==========================================================================

  describe("analyzeTenant — tenant tags", () => {
    it("flags production tags as medium risk", () => {
      const result = analyzer.analyzeTenant(
        createTenant("Prod", ["production", "enterprise"]),
        outdatedStatus("Prod", 1)
      );

      const factor = result.factors.find((f) => f.name === "production_tenant");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("medium");
      expect(factor!.description).toContain("production");
    });

    it("flags dev/test tags as low risk", () => {
      const result = analyzer.analyzeTenant(
        createTenant("Dev", ["dev", "sandbox"]),
        outdatedStatus("Dev", 1)
      );

      const factor = result.factors.find((f) => f.name === "non_production_tenant");
      expect(factor).toBeDefined();
      expect(factor!.level).toBe("low");
    });

    it("is case-insensitive for tags", () => {
      const result = analyzer.analyzeTenant(
        createTenant("Prod", ["PRODUCTION"]),
        outdatedStatus("Prod", 1)
      );

      const factor = result.factors.find((f) => f.name === "production_tenant");
      expect(factor).toBeDefined();
    });
  });

  // ==========================================================================
  // Composite score and recommendations
  // ==========================================================================

  describe("score and recommendation", () => {
    it("recommends safe_to_update for low-risk tenants", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 10,
      };

      const result = analyzer.analyzeTenant(
        createTenant("Safe", ["sandbox"]),
        outdatedStatus("Safe", 1),
        history
      );

      expect(result.recommendation).toBe("safe_to_update");
      expect(result.riskLevel).toBe("low");
    });

    it("recommends do_not_update when last deploy failed AND stale", () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 120);

      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "failure",
        lastDeployDate: staleDate.toISOString(),
        totalDeploys: 5,
        successfulDeploys: 4,
      };

      const result = analyzer.analyzeTenant(
        createTenant("Danger"),
        outdatedStatus("Danger", 3),
        history
      );

      expect(result.recommendation).toBe("do_not_update");
      expect(result.recommendationReason).toContain("stale");
    });

    it("recommends do_not_update when low success rate AND last failed", () => {
      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "failure",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 3,
      };

      const result = analyzer.analyzeTenant(
        createTenant("Flaky"),
        outdatedStatus("Flaky", 2),
        history
      );

      expect(result.recommendation).toBe("do_not_update");
      expect(result.recommendationReason).toContain("Chronically failing");
    });

    it("recommends update_risky for high-score tenants", () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 120);

      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "failure",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 9,
      };

      const result = analyzer.analyzeTenant(
        createTenant("Risky", ["production"]),
        outdatedStatus("Risky", 4),
        history
      );

      expect(result.recommendation).toBe("update_risky");
      expect(result.riskLevel).toBe("high");
    });

    it("recommends review_recommended for medium-score tenants", () => {
      const agingDate = new Date();
      agingDate.setDate(agingDate.getDate() - 45);

      const history: TenantDeploymentHistory = {
        tenantId: "t1",
        lastDeployResult: "success",
        lastDeployDate: agingDate.toISOString(),
        totalDeploys: 10,
        successfulDeploys: 9,
      };

      const result = analyzer.analyzeTenant(
        createTenant("Medium", ["production"]),
        outdatedStatus("Medium", 2),
        history
      );

      expect(result.recommendation).toBe("review_recommended");
      expect(result.riskLevel).toBe("medium");
    });
  });

  // ==========================================================================
  // Fleet analysis
  // ==========================================================================

  describe("analyzeFleet", () => {
    it("produces correct summary counts", () => {
      const tenants = [
        createTenant("Current"),
        createTenant("Safe", ["sandbox"]),
        createTenant("Risky", ["production"]),
      ];

      const statuses: TenantVersionStatus[] = [
        currentStatus("Current"),
        outdatedStatus("Safe", 1),
        outdatedStatus("Risky", 4),
      ];

      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 120);

      const histories = new Map<string, TenantDeploymentHistory>();
      histories.set(tenants[1].tenantId, {
        tenantId: tenants[1].tenantId,
        lastDeployResult: "success",
        lastDeployDate: new Date().toISOString(),
        totalDeploys: 10,
        successfulDeploys: 10,
      });
      histories.set(tenants[2].tenantId, {
        tenantId: tenants[2].tenantId,
        lastDeployResult: "success",
        lastDeployDate: staleDate.toISOString(),
        totalDeploys: 10,
        successfulDeploys: 6,
      });

      const fleet = analyzer.analyzeFleet(tenants, statuses, histories);

      expect(fleet.tenants).toHaveLength(3);
      expect(fleet.summary.total).toBe(3);
      expect(fleet.summary.current).toBe(1);
      // The other two should be categorized based on their scores
      expect(
        fleet.summary.safeToUpdate +
          fleet.summary.reviewRecommended +
          fleet.summary.risky +
          fleet.summary.doNotUpdate
      ).toBe(2);
    });

    it("works without deployment history", () => {
      const tenants = [createTenant("A"), createTenant("B")];
      const statuses = [outdatedStatus("A", 1), outdatedStatus("B", 2)];

      const fleet = analyzer.analyzeFleet(tenants, statuses);

      expect(fleet.tenants).toHaveLength(2);
      expect(fleet.summary.total).toBe(2);
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe("edge cases", () => {
    it("handles tenant with no tags", () => {
      const tenant = createTenant("NoTags");
      delete (tenant as Record<string, unknown>).tags;

      const result = analyzer.analyzeTenant(tenant, outdatedStatus("NoTags", 1));
      // Should not throw, and no tag-related factors
      const tagFactor = result.factors.find(
        (f) => f.name === "production_tenant" || f.name === "non_production_tenant"
      );
      expect(tagFactor).toBeUndefined();
    });

    it("handles no deployment history", () => {
      const result = analyzer.analyzeTenant(
        createTenant("NoHistory"),
        outdatedStatus("NoHistory", 1)
      );

      // Should only have version drift factor
      expect(result.factors.length).toBeGreaterThanOrEqual(1);
      const historyFactors = result.factors.filter(
        (f) =>
          f.name === "last_deploy_failed" ||
          f.name === "last_deploy_succeeded" ||
          f.name === "stale_environment"
      );
      expect(historyFactors).toHaveLength(0);
    });

    it("populates outdatedSolutions correctly", () => {
      const status: TenantVersionStatus = {
        tenantId: "t1",
        tenantName: "Multi",
        overallStatus: "outdated",
        solutions: [
          {
            uniqueName: "AgentA",
            friendlyName: "Agent A",
            expectedVersion: "2.0.0.0",
            deployedVersion: "1.0.0.0",
            status: "outdated",
            versionDrift: 1,
          },
          {
            uniqueName: "AgentB",
            friendlyName: "Agent B",
            expectedVersion: "1.0.0.0",
            deployedVersion: "1.0.0.0",
            status: "current",
            versionDrift: 0,
          },
          {
            uniqueName: "AgentC",
            friendlyName: "Agent C",
            expectedVersion: "3.0.0.0",
            deployedVersion: "1.0.0.0",
            status: "outdated",
            versionDrift: 2,
          },
        ],
        error: undefined,
      };

      const result = analyzer.analyzeTenant(createTenant("Multi"), status);
      expect(result.outdatedSolutions).toHaveLength(2);
      expect(result.outdatedSolutions.map((s) => s.uniqueName)).toEqual(["AgentA", "AgentC"]);
    });
  });
});
