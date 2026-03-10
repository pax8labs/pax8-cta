/**
 * Copyright 2024 Pax8 Labs
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

import { HealthCheck, parseDuration, TenantConfig } from "../config/schema.js";
import { DataverseClient } from "../dataverse/client.js";

/**
 * Result of a health check
 */
export interface HealthCheckResult {
  healthy: boolean;
  tenantId: string;
  tenantName: string;
  checks: {
    name: string;
    passed: boolean;
    message: string;
    durationMs: number;
  }[];
  totalDurationMs: number;
}

/**
 * Service for performing health checks on tenant environments
 */
export class HealthCheckService {
  /**
   * Perform all health checks for a tenant
   */
  async checkTenantHealth(
    tenant: TenantConfig,
    client: DataverseClient,
    settings?: HealthCheck
  ): Promise<HealthCheckResult> {
    const checks: HealthCheckResult["checks"] = [];
    const startTime = Date.now();

    // Merge with defaults to ensure all properties exist
    const defaultSettings: HealthCheck = {
      enabled: true,
      expectedStatus: 200,
      timeout: "30s",
      retries: 3,
    };
    const healthSettings: HealthCheck = {
      ...defaultSettings,
      ...tenant.healthCheck,
      ...settings,
    };

    if (!healthSettings.enabled) {
      return {
        healthy: true,
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        checks: [
          {
            name: "health_check_disabled",
            passed: true,
            message: "Health checks are disabled for this tenant",
            durationMs: 0,
          },
        ],
        totalDurationMs: 0,
      };
    }

    const timeout = healthSettings.timeout ? parseDuration(healthSettings.timeout) : 30000;

    // Check 1: Dataverse connectivity
    const dataverseCheck = await this.checkDataverseConnectivity(client, timeout);
    checks.push(dataverseCheck);

    // Check 2: Custom endpoint if configured
    if (healthSettings.endpoint) {
      const endpointCheck = await this.checkCustomEndpoint(
        healthSettings.endpoint,
        healthSettings.expectedStatus ?? 200,
        timeout,
        healthSettings.retries ?? 3
      );
      checks.push(endpointCheck);
    }

    // Check 3: Solution import capability
    const importCheck = await this.checkSolutionImportCapability(client, timeout);
    checks.push(importCheck);

    const totalDurationMs = Date.now() - startTime;
    const healthy = checks.every((c) => c.passed);

    return {
      healthy,
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      checks,
      totalDurationMs,
    };
  }

  /**
   * Check basic Dataverse connectivity
   */
  private async checkDataverseConnectivity(
    client: DataverseClient,
    timeout: number
  ): Promise<HealthCheckResult["checks"][0]> {
    const startTime = Date.now();

    try {
      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Query WhoAmI to verify authentication and connectivity
      const result = await Promise.race([
        client.get<{ UserId: string; OrganizationId: string }>("/WhoAmI"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
      ]);

      clearTimeout(timeoutId);

      return {
        name: "dataverse_connectivity",
        passed: true,
        message: `Connected successfully (Org: ${result.OrganizationId})`,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "dataverse_connectivity",
        passed: false,
        message: `Failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check a custom health endpoint
   */
  private async checkCustomEndpoint(
    endpoint: string,
    expectedStatus: number,
    timeout: number,
    retries: number
  ): Promise<HealthCheckResult["checks"][0]> {
    const startTime = Date.now();
    let lastError: string = "";

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(endpoint, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === expectedStatus) {
          return {
            name: "custom_endpoint",
            passed: true,
            message: `Endpoint returned expected status ${expectedStatus}`,
            durationMs: Date.now() - startTime,
          };
        }

        lastError = `Unexpected status: ${response.status} (expected ${expectedStatus})`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Wait before retry
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    return {
      name: "custom_endpoint",
      passed: false,
      message: `Failed after ${retries} attempts: ${lastError}`,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Check if solution import is possible (verify permissions)
   */
  private async checkSolutionImportCapability(
    client: DataverseClient,
    timeout: number
  ): Promise<HealthCheckResult["checks"][0]> {
    const startTime = Date.now();

    try {
      // Query for existing import jobs to verify we have read access
      // This doesn't actually import anything, just checks permissions
      await Promise.race([
        client.get<{ value: unknown[] }>("/importjobs", {
          $top: "1",
          $select: "importjobid",
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
      ]);

      return {
        name: "solution_import_capability",
        passed: true,
        message: "Import job access verified",
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: "solution_import_capability",
        passed: false,
        message: `Access check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run health checks for multiple tenants in parallel
   */
  async checkMultipleTenants(
    tenants: TenantConfig[],
    clientFactory: (tenant: TenantConfig) => Promise<DataverseClient>,
    options: {
      maxConcurrent?: number;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<HealthCheckResult[]> {
    const { maxConcurrent = 5, onProgress } = options;
    const results: HealthCheckResult[] = [];
    let completed = 0;

    // Process in batches
    for (let i = 0; i < tenants.length; i += maxConcurrent) {
      const batch = tenants.slice(i, i + maxConcurrent);

      const batchResults = await Promise.all(
        batch.map(async (tenant) => {
          try {
            const client = await clientFactory(tenant);
            return this.checkTenantHealth(tenant, client);
          } catch (error) {
            return {
              healthy: false,
              tenantId: tenant.tenantId,
              tenantName: tenant.name,
              checks: [
                {
                  name: "client_creation",
                  passed: false,
                  message: `Failed to create client: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  durationMs: 0,
                },
              ],
              totalDurationMs: 0,
            };
          }
        })
      );

      results.push(...batchResults);
      completed += batch.length;

      if (onProgress) {
        onProgress(completed, tenants.length);
      }
    }

    return results;
  }

  /**
   * Generate a health report summary
   */
  generateReport(results: HealthCheckResult[]): {
    totalTenants: number;
    healthyTenants: number;
    unhealthyTenants: number;
    unhealthyDetails: {
      tenantName: string;
      tenantId: string;
      failedChecks: string[];
    }[];
  } {
    const unhealthyDetails = results
      .filter((r) => !r.healthy)
      .map((r) => ({
        tenantName: r.tenantName,
        tenantId: r.tenantId,
        failedChecks: r.checks.filter((c) => !c.passed).map((c) => c.message),
      }));

    return {
      totalTenants: results.length,
      healthyTenants: results.filter((r) => r.healthy).length,
      unhealthyTenants: results.filter((r) => !r.healthy).length,
      unhealthyDetails,
    };
  }
}
