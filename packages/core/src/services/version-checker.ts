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
 * Solution Version Checker Service
 * Detects version drift between expected and deployed solution versions across tenants
 */

import { DataverseClient } from "../dataverse/client.js";
import { TokenManager } from "../auth/token-manager.js";
import { TenantConfig } from "../config/schema.js";
import { DEMO_TENANTS, DEMO_SOLUTIONS } from "../mock/demo-data.js";

export interface SolutionVersionInfo {
  uniqueName: string;
  friendlyName: string;
  expectedVersion: string;
  deployedVersion: string | null;
  isManaged: boolean;
  status: "current" | "outdated" | "ahead" | "not_deployed" | "unknown";
  versionDrift: number; // negative = behind, 0 = current, positive = ahead
}

export interface TenantVersionStatus {
  tenantId: string;
  tenantName: string;
  environmentUrl: string;
  solutions: SolutionVersionInfo[];
  overallStatus: "current" | "outdated" | "mixed" | "unknown";
  lastChecked: string;
  error?: string;
}

export interface VersionDriftSummary {
  totalTenants: number;
  currentTenants: number;
  outdatedTenants: number;
  unknownTenants: number;
  solutionSummary: {
    uniqueName: string;
    friendlyName: string;
    expectedVersion: string;
    tenantsAtVersion: number;
    tenantsBehind: number;
    tenantsNotDeployed: number;
  }[];
}

/**
 * Compare two version strings (e.g., "1.0.0.5" vs "1.0.0.4")
 * Returns: negative if a < b, 0 if equal, positive if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(".").map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}

/**
 * Get version status from comparison result
 */
function getVersionStatus(
  expectedVersion: string,
  deployedVersion: string | null
): { status: SolutionVersionInfo["status"]; drift: number } {
  if (!deployedVersion) {
    return { status: "not_deployed", drift: 0 };
  }

  const comparison = compareVersions(deployedVersion, expectedVersion);

  if (comparison === 0) {
    return { status: "current", drift: 0 };
  } else if (comparison < 0) {
    return { status: "outdated", drift: comparison };
  } else {
    return { status: "ahead", drift: comparison };
  }
}

/**
 * Version Checker class for checking solution versions across tenants
 */
export class VersionChecker {
  private cache = new Map<string, { data: TenantVersionStatus; timestamp: number }>();
  private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Check solution versions for a single tenant
   */
  async checkTenantVersions(
    tenant: TenantConfig,
    expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>,
    tokenManager?: TokenManager,
    skipCache = false
  ): Promise<TenantVersionStatus> {
    // Check cache first
    if (!skipCache) {
      const cached = this.cache.get(tenant.tenantId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached.data;
      }
    }

    // Demo mode - simulate version checking
    if (process.env.DEMO_MODE === "true" || !tokenManager) {
      return this.getDemoVersionStatus(tenant, expectedSolutions);
    }

    // Real mode - query Dataverse
    try {
      const client = new DataverseClient({
        environmentUrl: tenant.environmentUrl,
        tokenManager,
        clientId: tokenManager.getClientId(),
      });

      const deployedSolutions = await client.querySolutions();
      const solutionMap = new Map(deployedSolutions.map((s) => [s.uniquename.toLowerCase(), s]));

      const solutions: SolutionVersionInfo[] = expectedSolutions.map((expected) => {
        const deployed = solutionMap.get(expected.uniqueName.toLowerCase());
        const { status, drift } = getVersionStatus(expected.version, deployed?.version || null);

        return {
          uniqueName: expected.uniqueName,
          friendlyName: expected.friendlyName,
          expectedVersion: expected.version,
          deployedVersion: deployed?.version || null,
          isManaged: deployed?.ismanaged ?? true,
          status,
          versionDrift: drift,
        };
      });

      const overallStatus = this.calculateOverallStatus(solutions);

      const result: TenantVersionStatus = {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        solutions,
        overallStatus,
        lastChecked: new Date().toISOString(),
      };

      // Cache the result
      this.cache.set(tenant.tenantId, { data: result, timestamp: Date.now() });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        solutions: expectedSolutions.map((s) => ({
          uniqueName: s.uniqueName,
          friendlyName: s.friendlyName,
          expectedVersion: s.version,
          deployedVersion: null,
          isManaged: true,
          status: "unknown" as const,
          versionDrift: 0,
        })),
        overallStatus: "unknown",
        lastChecked: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  /**
   * Check versions for multiple tenants
   */
  async checkMultipleTenants(
    tenants: TenantConfig[],
    expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>,
    tokenManager?: TokenManager,
    skipCache = false
  ): Promise<TenantVersionStatus[]> {
    // Run checks in parallel (with concurrency limit)
    const CONCURRENCY = 5;
    const results: TenantVersionStatus[] = [];

    for (let i = 0; i < tenants.length; i += CONCURRENCY) {
      const batch = tenants.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((t) => this.checkTenantVersions(t, expectedSolutions, tokenManager, skipCache))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get a summary of version drift across all tenants
   */
  async getVersionDriftSummary(
    tenants: TenantConfig[],
    expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>,
    tokenManager?: TokenManager
  ): Promise<VersionDriftSummary> {
    const statuses = await this.checkMultipleTenants(tenants, expectedSolutions, tokenManager);

    const solutionSummary = expectedSolutions.map((solution) => {
      let atVersion = 0;
      let behind = 0;
      let notDeployed = 0;

      for (const status of statuses) {
        const solStatus = status.solutions.find((s) => s.uniqueName === solution.uniqueName);
        if (!solStatus || solStatus.status === "unknown") continue;

        if (solStatus.status === "current" || solStatus.status === "ahead") {
          atVersion++;
        } else if (solStatus.status === "outdated") {
          behind++;
        } else if (solStatus.status === "not_deployed") {
          notDeployed++;
        }
      }

      return {
        uniqueName: solution.uniqueName,
        friendlyName: solution.friendlyName,
        expectedVersion: solution.version,
        tenantsAtVersion: atVersion,
        tenantsBehind: behind,
        tenantsNotDeployed: notDeployed,
      };
    });

    return {
      totalTenants: statuses.length,
      currentTenants: statuses.filter((s) => s.overallStatus === "current").length,
      outdatedTenants: statuses.filter(
        (s) => s.overallStatus === "outdated" || s.overallStatus === "mixed"
      ).length,
      unknownTenants: statuses.filter((s) => s.overallStatus === "unknown").length,
      solutionSummary,
    };
  }

  /**
   * Clear cache for a tenant or all tenants
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculateOverallStatus(
    solutions: SolutionVersionInfo[]
  ): TenantVersionStatus["overallStatus"] {
    const statuses = solutions.map((s) => s.status);

    if (statuses.every((s) => s === "unknown")) {
      return "unknown";
    }

    const hasOutdated = statuses.some((s) => s === "outdated");
    const hasCurrent = statuses.some((s) => s === "current" || s === "ahead");

    if (hasOutdated && hasCurrent) {
      return "mixed";
    } else if (hasOutdated) {
      return "outdated";
    } else {
      return "current";
    }
  }

  private getDemoVersionStatus(
    tenant: TenantConfig,
    expectedSolutions: Array<{ uniqueName: string; friendlyName: string; version: string }>
  ): TenantVersionStatus {
    // Use tenant ID to deterministically generate version drift scenarios
    const tenantIndex = parseInt(tenant.tenantId.substring(0, 8), 16);

    const solutions: SolutionVersionInfo[] = expectedSolutions.map((expected, idx) => {
      // Simulate different scenarios based on tenant and solution index
      const scenarioSeed = (tenantIndex + idx) % 10;

      let deployedVersion: string | null = expected.version;
      let status: SolutionVersionInfo["status"] = "current";
      let drift = 0;

      if (scenarioSeed === 0) {
        // Not deployed
        deployedVersion = null;
        status = "not_deployed";
      } else if (scenarioSeed === 1 || scenarioSeed === 2) {
        // One minor version behind
        const parts = expected.version.split(".");
        if (parts.length >= 3) {
          parts[2] = String(Math.max(0, parseInt(parts[2], 10) - 1));
          deployedVersion = parts.join(".");
          status = "outdated";
          drift = -1;
        }
      } else if (scenarioSeed === 3) {
        // Two versions behind
        const parts = expected.version.split(".");
        if (parts.length >= 3) {
          parts[2] = String(Math.max(0, parseInt(parts[2], 10) - 2));
          deployedVersion = parts.join(".");
          status = "outdated";
          drift = -2;
        }
      }
      // scenarioSeed 4-9: current version

      return {
        uniqueName: expected.uniqueName,
        friendlyName: expected.friendlyName,
        expectedVersion: expected.version,
        deployedVersion,
        isManaged: true,
        status,
        versionDrift: drift,
      };
    });

    const overallStatus = this.calculateOverallStatus(solutions);

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      solutions,
      overallStatus,
      lastChecked: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const versionChecker = new VersionChecker();

// ============================================================================
// Convenience functions for demo mode
// ============================================================================

/**
 * Get demo version status for all tenants and solutions
 */
export function getDemoVersionDriftSummary(): VersionDriftSummary {
  const checker = new VersionChecker();
  const expectedSolutions = DEMO_SOLUTIONS.map((s) => ({
    uniqueName: s.uniqueName,
    friendlyName: s.friendlyName,
    version: s.version,
  }));

  // Synchronously generate demo data
  const statuses = DEMO_TENANTS.filter((t) => t.enabled).map((tenant) =>
    checker["getDemoVersionStatus"](tenant, expectedSolutions)
  );

  const solutionSummary = expectedSolutions.map((solution) => {
    let atVersion = 0;
    let behind = 0;
    let notDeployed = 0;

    for (const status of statuses) {
      const solStatus = status.solutions.find((s) => s.uniqueName === solution.uniqueName);
      if (!solStatus) continue;

      if (solStatus.status === "current" || solStatus.status === "ahead") {
        atVersion++;
      } else if (solStatus.status === "outdated") {
        behind++;
      } else if (solStatus.status === "not_deployed") {
        notDeployed++;
      }
    }

    return {
      uniqueName: solution.uniqueName,
      friendlyName: solution.friendlyName,
      expectedVersion: solution.version,
      tenantsAtVersion: atVersion,
      tenantsBehind: behind,
      tenantsNotDeployed: notDeployed,
    };
  });

  return {
    totalTenants: statuses.length,
    currentTenants: statuses.filter((s) => s.overallStatus === "current").length,
    outdatedTenants: statuses.filter(
      (s) => s.overallStatus === "outdated" || s.overallStatus === "mixed"
    ).length,
    unknownTenants: statuses.filter((s) => s.overallStatus === "unknown").length,
    solutionSummary,
  };
}

/**
 * Get demo version status for a specific tenant
 */
export function getDemoTenantVersionStatus(tenantId: string): TenantVersionStatus | null {
  const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
  if (!tenant) return null;

  const checker = new VersionChecker();
  const expectedSolutions = DEMO_SOLUTIONS.map((s) => ({
    uniqueName: s.uniqueName,
    friendlyName: s.friendlyName,
    version: s.version,
  }));

  return checker["getDemoVersionStatus"](tenant, expectedSolutions);
}
