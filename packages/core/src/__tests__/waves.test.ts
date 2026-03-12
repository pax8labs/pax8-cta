import { describe, it, expect } from "vitest";
import { WaveService } from "../services/waves.js";
import { Config, TenantConfig } from "../config/schema.js";

describe("WaveService", () => {
  const waveService = new WaveService();

  const createTestConfig = (overrides: Partial<Config> = {}): Config => ({
    version: "2.0",
    partner: {
      tenantId: "00000000-0000-0000-0000-000000000001",
      clientId: "00000000-0000-0000-0000-000000000002",
    },
    source: {
      tenantId: "00000000-0000-0000-0000-000000000003",
      environmentUrl: "https://source.crm.dynamics.com",
    },
    tenants: [],
    ...overrides,
  });

  const createTestTenant = (name: string, tags: string[] = [], enabled = true): TenantConfig => ({
    name,
    tenantId: `00000000-0000-0000-0000-${name.replace(/\s/g, "").padStart(12, "0").slice(0, 12)}`,
    environmentUrl: `https://${name.replace(/\s/g, "").toLowerCase()}.crm.dynamics.com`,
    tags,
    enabled,
  });

  describe("createExecutionPlan", () => {
    it("should create a single wave when no waves configured", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A"), createTestTenant("Tenant B")],
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.waves).toHaveLength(1);
      expect(plan.waves[0].name).toBe("Default");
      expect(plan.waves[0].tenants).toHaveLength(2);
      expect(plan.totalTenants).toBe(2);
    });

    it("should assign tenants to waves by tag", () => {
      const config = createTestConfig({
        tenants: [
          createTestTenant("Enterprise A", ["enterprise", "wave1"]),
          createTestTenant("Enterprise B", ["enterprise", "wave1"]),
          createTestTenant("SMB A", ["smb", "wave2"]),
        ],
        settings: {
          waves: [
            { name: "Pilot", order: 1, tenants: ["wave1"], continueOnFailure: false },
            { name: "Main", order: 2, tenants: ["wave2"], continueOnFailure: true },
          ],
        },
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[0].name).toBe("Pilot");
      expect(plan.waves[0].tenants).toHaveLength(2);
      expect(plan.waves[1].name).toBe("Main");
      expect(plan.waves[1].tenants).toHaveLength(1);
    });

    it("should assign unassigned tenants to a default wave", () => {
      const config = createTestConfig({
        tenants: [
          createTestTenant("Tenant A", ["wave1"]),
          createTestTenant("Tenant B", ["untagged"]),
        ],
        settings: {
          waves: [{ name: "First", order: 1, tenants: ["wave1"], continueOnFailure: false }],
        },
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.waves).toHaveLength(2);
      expect(plan.waves[1].name).toBe("Unassigned");
      expect(plan.waves[1].tenants).toHaveLength(1);
      expect(plan.waves[1].tenants[0].name).toBe("Tenant B");
    });

    it("should respect wave order", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A", ["wave2"]), createTestTenant("Tenant B", ["wave1"])],
        settings: {
          waves: [
            { name: "Second", order: 2, tenants: ["wave2"], continueOnFailure: false },
            { name: "First", order: 1, tenants: ["wave1"], continueOnFailure: false },
          ],
        },
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.waves[0].name).toBe("First");
      expect(plan.waves[1].name).toBe("Second");
    });

    it("should only include enabled tenants", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Enabled", [], true), createTestTenant("Disabled", [], false)],
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.totalTenants).toBe(1);
      expect(plan.waves[0].tenants).toHaveLength(1);
      expect(plan.waves[0].tenants[0].name).toBe("Enabled");
    });

    it("should include wave settings", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A", ["wave1"])],
        settings: {
          waves: [
            {
              name: "Pilot",
              order: 1,
              tenants: ["wave1"],
              maxParallel: 5,
              waitAfterCompletion: "10m",
              continueOnFailure: true,
            },
          ],
        },
      });

      const plan = waveService.createExecutionPlan(config);

      expect(plan.waves[0].maxParallel).toBe(5);
      expect(plan.waves[0].waitAfterCompletion).toBe(600000);
      expect(plan.waves[0].continueOnFailure).toBe(true);
    });
  });

  describe("getTenantsWithWaves", () => {
    it("should return tenants with wave assignments", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A", ["wave1"]), createTestTenant("Tenant B", ["wave2"])],
        settings: {
          waves: [
            { name: "First", order: 1, tenants: ["wave1"], continueOnFailure: false },
            { name: "Second", order: 2, tenants: ["wave2"], continueOnFailure: false },
          ],
        },
      });

      const plan = waveService.createExecutionPlan(config);
      const tenants = waveService.getTenantsWithWaves(plan);

      expect(tenants).toHaveLength(2);
      expect(tenants[0].waveName).toBe("First");
      expect(tenants[0].waveNumber).toBe(1);
      expect(tenants[1].waveName).toBe("Second");
      expect(tenants[1].waveNumber).toBe(2);
    });
  });

  describe("estimateDeploymentTime", () => {
    it("should estimate deployment time", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A"), createTestTenant("Tenant B")],
      });

      const plan = waveService.createExecutionPlan(config);
      const estimate = waveService.estimateDeploymentTime(plan, 60000);

      expect(estimate.totalEstimatedMs).toBeGreaterThan(0);
      expect(estimate.waveEstimates).toHaveLength(1);
    });

    it("should account for parallel execution", () => {
      const config = createTestConfig({
        tenants: [
          createTestTenant("Tenant A", ["wave1"]),
          createTestTenant("Tenant B", ["wave1"]),
          createTestTenant("Tenant C", ["wave1"]),
          createTestTenant("Tenant D", ["wave1"]),
        ],
        settings: {
          waves: [
            { name: "All", order: 1, tenants: ["wave1"], maxParallel: 2, continueOnFailure: false },
          ],
        },
      });

      const plan = waveService.createExecutionPlan(config);
      const estimate = waveService.estimateDeploymentTime(plan, 60000);

      // 4 tenants with maxParallel=2 should be 2 batches = 2 minutes
      expect(estimate.waveEstimates[0].estimatedMs).toBe(120000);
    });
  });

  describe("validateWaveConfig", () => {
    it("should validate correct wave configuration", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A", ["wave1"])],
        settings: {
          waves: [{ name: "First", order: 1, tenants: ["wave1"], continueOnFailure: false }],
        },
      });

      const result = waveService.validateWaveConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect duplicate wave orders", () => {
      const config = createTestConfig({
        tenants: [],
        settings: {
          waves: [
            { name: "First", order: 1, tenants: [], continueOnFailure: false },
            { name: "Second", order: 1, tenants: [], continueOnFailure: false },
          ],
        },
      });

      const result = waveService.validateWaveConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate wave order numbers found");
    });

    it("should detect duplicate wave names", () => {
      const config = createTestConfig({
        tenants: [],
        settings: {
          waves: [
            { name: "Same", order: 1, tenants: [], continueOnFailure: false },
            { name: "Same", order: 2, tenants: [], continueOnFailure: false },
          ],
        },
      });

      const result = waveService.validateWaveConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate wave names found");
    });

    it("should warn about unknown tenant references", () => {
      const config = createTestConfig({
        tenants: [createTestTenant("Tenant A", ["wave1"])],
        settings: {
          waves: [{ name: "First", order: 1, tenants: ["nonexistent"], continueOnFailure: false }],
        },
      });

      const result = waveService.validateWaveConfig(config);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("nonexistent");
    });
  });

  describe("previewWaves", () => {
    it("should preview wave assignments", () => {
      const config = createTestConfig({
        tenants: [
          createTestTenant("Tenant A", ["wave1"]),
          createTestTenant("Tenant B", ["wave2"]),
          createTestTenant("Tenant C", []),
        ],
        settings: {
          waves: [
            { name: "First", order: 1, tenants: ["wave1"], continueOnFailure: false },
            { name: "Second", order: 2, tenants: ["wave2"], continueOnFailure: false },
          ],
        },
      });

      const preview = waveService.previewWaves(config);

      expect(preview.waves).toHaveLength(2);
      expect(preview.waves[0].name).toBe("First");
      expect(preview.waves[0].tenantCount).toBe(1);
      expect(preview.unassignedTenants).toHaveLength(1);
      expect(preview.unassignedTenants[0].name).toBe("Tenant C");
    });
  });
});
