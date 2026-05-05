import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  UnmanagedCustomizationDetector,
  calculateCustomizationRisk,
  getDemoUnmanagedCustomizations,
  getDemoCustomizationSummary,
} from "../services/unmanaged-customizations.js";
import type {
  UnmanagedCustomization,
  UnmanagedCustomizationResult,
} from "../services/unmanaged-customizations.js";
import { createMockTokenManager, createTestTenant } from "./test-utils.js";

describe("UnmanagedCustomizationDetector", () => {
  let detector: UnmanagedCustomizationDetector;
  let originalEnv: string | undefined;

  beforeEach(() => {
    detector = new UnmanagedCustomizationDetector();
    originalEnv = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEMO_MODE = originalEnv;
    } else {
      delete process.env.DEMO_MODE;
    }
  });

  describe("scanTenant (demo mode)", () => {
    it("should return customizations for a tenant with unmanaged components", async () => {
      const tenant = createTestTenant({
        tenantId: "11111111-1111-1111-1111-111111111111",
        name: "Contoso Corporation",
      });

      const result = await detector.scanTenant(tenant, "CustomerServiceAgent");

      expect(result.tenantId).toBe("11111111-1111-1111-1111-111111111111");
      expect(result.tenantName).toBe("Contoso Corporation");
      expect(result.totalCustomizations).toBeGreaterThan(0);
      expect(result.customizations.length).toBe(result.totalCustomizations);
      expect(result.riskLevel).not.toBe("none");
      expect(result.scannedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should return empty customizations for a clean tenant", async () => {
      const tenant = createTestTenant({
        tenantId: "33333333-3333-3333-3333-333333333333",
        name: "Adventure Works",
      });

      const result = await detector.scanTenant(tenant, "CustomerServiceAgent");

      expect(result.totalCustomizations).toBe(0);
      expect(result.customizations).toEqual([]);
      expect(result.riskLevel).toBe("none");
    });

    it("should include byType breakdown", async () => {
      const tenant = createTestTenant({
        tenantId: "11111111-1111-1111-1111-111111111111",
        name: "Contoso Corporation",
      });

      const result = await detector.scanTenant(tenant, "CustomerServiceAgent");

      expect(result.byType).toBeDefined();
      expect(result.byType.flow).toBeGreaterThan(0);

      // Verify the byType counts sum to totalCustomizations
      const typeSum = Object.values(result.byType).reduce((sum, count) => sum + count, 0);
      expect(typeSum).toBe(result.totalCustomizations);
    });

    it("should use the provided solution name", async () => {
      const tenant = createTestTenant({
        tenantId: "11111111-1111-1111-1111-111111111111",
        name: "Contoso Corporation",
      });

      const result = await detector.scanTenant(tenant, "MySolution");

      // Each customization should reference the provided solution name
      result.customizations.forEach((c) => {
        expect(c.managedSolutionName).toBe("MySolution");
      });
    });
  });

  describe("scanMultipleTenants (demo mode)", () => {
    it("should scan multiple tenants and return results for each", async () => {
      const tenants = [
        createTestTenant({
          tenantId: "11111111-1111-1111-1111-111111111111",
          name: "Contoso Corporation",
        }),
        createTestTenant({
          tenantId: "33333333-3333-3333-3333-333333333333",
          name: "Northern Heights HVAC",
        }),
      ];

      const results = await detector.scanMultipleTenants(tenants, "CustomerServiceAgent");

      expect(results).toHaveLength(2);
      expect(results[0].tenantName).toBe("Contoso Corporation");
      expect(results[0].totalCustomizations).toBeGreaterThan(0);
      expect(results[1].tenantName).toBe("Northern Heights HVAC");
      expect(results[1].totalCustomizations).toBe(0);
    });
  });
});

describe("calculateCustomizationRisk", () => {
  it("should return 'none' for empty customizations", () => {
    const { riskLevel, riskSummary } = calculateCustomizationRisk([]);
    expect(riskLevel).toBe("none");
    expect(riskSummary).toContain("No unmanaged customizations");
  });

  it("should return 'low' for a single non-critical customization", () => {
    const customizations: UnmanagedCustomization[] = [
      {
        componentId: "test-001",
        displayName: "Test Field",
        logicalName: "test_field",
        componentType: "field",
        managedSolutionName: "TestSolution",
        description: "A test field",
      },
    ];

    const { riskLevel } = calculateCustomizationRisk(customizations);
    expect(riskLevel).toBe("low");
  });

  it("should return 'medium' for a single high-risk component", () => {
    const customizations: UnmanagedCustomization[] = [
      {
        componentId: "test-001",
        displayName: "Custom Flow",
        logicalName: "test_flow",
        componentType: "flow",
        managedSolutionName: "TestSolution",
        description: "A custom flow",
      },
    ];

    const { riskLevel } = calculateCustomizationRisk(customizations);
    expect(riskLevel).toBe("medium");
  });

  it("should return 'high' for 3+ high-risk components", () => {
    const customizations: UnmanagedCustomization[] = [
      {
        componentId: "test-001",
        displayName: "Flow 1",
        logicalName: "flow_1",
        componentType: "flow",
        managedSolutionName: "TestSolution",
        description: "Flow",
      },
      {
        componentId: "test-002",
        displayName: "Role 1",
        logicalName: "role_1",
        componentType: "security_role",
        managedSolutionName: "TestSolution",
        description: "Role",
      },
      {
        componentId: "test-003",
        displayName: "Plugin 1",
        logicalName: "plugin_1",
        componentType: "plugin",
        managedSolutionName: "TestSolution",
        description: "Plugin",
      },
    ];

    const { riskLevel, riskSummary } = calculateCustomizationRisk(customizations);
    expect(riskLevel).toBe("high");
    expect(riskSummary).toContain("high-risk");
  });

  it("should return 'high' for 10+ total customizations regardless of type", () => {
    const customizations: UnmanagedCustomization[] = Array.from({ length: 10 }, (_, i) => ({
      componentId: `test-${i}`,
      displayName: `Field ${i}`,
      logicalName: `field_${i}`,
      componentType: "field" as const,
      managedSolutionName: "TestSolution",
      description: `Field ${i}`,
    }));

    const { riskLevel } = calculateCustomizationRisk(customizations);
    expect(riskLevel).toBe("high");
  });

  it("should return 'medium' for 5 non-critical customizations", () => {
    const customizations: UnmanagedCustomization[] = Array.from({ length: 5 }, (_, i) => ({
      componentId: `test-${i}`,
      displayName: `Field ${i}`,
      logicalName: `field_${i}`,
      componentType: "field" as const,
      managedSolutionName: "TestSolution",
      description: `Field ${i}`,
    }));

    const { riskLevel } = calculateCustomizationRisk(customizations);
    expect(riskLevel).toBe("medium");
  });
});

describe("getDemoUnmanagedCustomizations", () => {
  it("should return customizations for Contoso (high risk tenant)", () => {
    const result = getDemoUnmanagedCustomizations(
      "11111111-1111-1111-1111-111111111111",
      "CustomerServiceAgent"
    );

    expect(result.tenantName).toBe("Contoso Corporation");
    expect(result.totalCustomizations).toBeGreaterThan(0);
    expect(result.riskLevel).toBe("high");
    expect(result.customizations.length).toBeGreaterThan(0);
  });

  it("should return no customizations for Northern Heights HVAC (clean tenant)", () => {
    const result = getDemoUnmanagedCustomizations(
      "33333333-3333-3333-3333-333333333333",
      "CustomerServiceAgent"
    );

    expect(result.tenantName).toBe("Northern Heights HVAC");
    expect(result.totalCustomizations).toBe(0);
    expect(result.riskLevel).toBe("none");
  });

  it("should return customizations for Woodgrove Bank (high risk, finance)", () => {
    const result = getDemoUnmanagedCustomizations(
      "55555555-5555-5555-5555-555555555555",
      "CustomerServiceAgent"
    );

    expect(result.tenantName).toBe("Woodgrove Bank");
    expect(result.totalCustomizations).toBeGreaterThanOrEqual(10);
    expect(result.riskLevel).toBe("high");
    // Should have plugins and security roles (financial compliance)
    expect(result.byType.plugin).toBeGreaterThan(0);
    expect(result.byType.security_role).toBeGreaterThan(0);
  });

  it("should handle unknown tenant ID gracefully", () => {
    const result = getDemoUnmanagedCustomizations(
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "CustomerServiceAgent"
    );

    expect(result.totalCustomizations).toBe(0);
    expect(result.error).toBe("Tenant not found");
  });

  it("should set managedSolutionName on all customizations", () => {
    const result = getDemoUnmanagedCustomizations(
      "11111111-1111-1111-1111-111111111111",
      "MySolution"
    );

    result.customizations.forEach((c) => {
      expect(c.managedSolutionName).toBe("MySolution");
    });
  });
});

describe("getDemoCustomizationSummary", () => {
  it("should return a summary across all enabled tenants", () => {
    const summary = getDemoCustomizationSummary("CustomerServiceAgent");

    expect(summary.totalTenants).toBeGreaterThan(0);
    expect(summary.tenantsWithCustomizations).toBeGreaterThan(0);
    expect(summary.tenantsClean).toBeGreaterThan(0);
    expect(summary.tenantsWithCustomizations + summary.tenantsClean).toBe(summary.totalTenants);
    expect(summary.totalCustomizations).toBeGreaterThan(0);
    expect(summary.results).toHaveLength(summary.totalTenants);
  });

  it("should identify high risk tenants", () => {
    const summary = getDemoCustomizationSummary("CustomerServiceAgent");

    expect(summary.highRiskTenants.length).toBeGreaterThan(0);
    // Contoso and Woodgrove should be high risk
    expect(summary.highRiskTenants).toContain("Contoso Corporation");
    expect(summary.highRiskTenants).toContain("Woodgrove Bank");
  });

  it("should not include disabled tenants (Crown Auto Group)", () => {
    const summary = getDemoCustomizationSummary("CustomerServiceAgent");

    const tenantNames = summary.results.map((r) => r.tenantName);
    expect(tenantNames).not.toContain("Crown Auto Group");
  });
});
