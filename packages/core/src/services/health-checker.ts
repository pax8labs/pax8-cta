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

import { HEALTH_CHECK_CACHE_DURATION_MS } from "../constants.js";

/**
 * Tenant Health Checker Service
 * Calculates ongoing health scores for tenants based on GDAP, connections, and deployment history
 */

import { getDemoTenantMetadata } from "../mock/demo-data.js";

export interface TenantHealth {
  tenantId: string;
  tenantName: string;
  healthScore: number; // 0-100
  status: "healthy" | "warning" | "critical";
  lastChecked: string;
  issues: HealthIssue[];
  gdapStatus: "valid" | "missing_role" | "expired" | "propagating" | "unknown";
  connectionsStatus: "valid" | "expired" | "missing" | "unknown";
  recentSuccessRate: number; // 0-1
  recentDeployments: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface TenantHealthDetail extends TenantHealth {
  gdap: {
    status: "valid" | "missing_role" | "expired" | "propagating" | "unknown";
    roles?: string[];
    missingRoles?: string[];
    relationshipExpiry?: string;
    lastVerified: string;
    issue?: string;
  };
  connections: Array<{
    name: string;
    displayName: string;
    status: "valid" | "expired" | "missing";
    expiryDate?: string;
    issue?: string;
  }>;
  recentDeploymentHistory: Array<{
    id: string;
    timestamp: string;
    status: "success" | "failure";
    duration?: number;
    error?: string;
  }>;
  recommendations: string[];
}

export interface HealthIssue {
  severity: "info" | "warning" | "error" | "critical";
  category: "permissions" | "connections" | "health" | "history";
  message: string;
  resolution?: string;
  link?: string;
}

export interface DeploymentHistoryRecord {
  tenantId: string;
  status: "success" | "failure";
  error?: string;
  completedAt: string;
  durationMinutes?: number;
}

export interface HealthCheckContext {
  tenantId: string;
  tenantName: string;
  environmentUrl: string;
  tags?: string[];
  deploymentHistory?: DeploymentHistoryRecord[];
}

class HealthChecker {
  private cache = new Map<string, { data: TenantHealth; timestamp: number }>();
  private readonly CACHE_DURATION_MS = HEALTH_CHECK_CACHE_DURATION_MS;

  /**
   * Check health for a single tenant
   */
  async checkTenantHealth(context: HealthCheckContext, skipCache = false): Promise<TenantHealth> {
    // Check cache first
    if (!skipCache) {
      const cached = this.cache.get(context.tenantId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
        return cached.data;
      }
    }

    // Run all health checks
    const [gdapStatus, connectionsStatus, deploymentMetrics] = await Promise.all([
      this.checkGDAPHealth(context),
      this.checkConnectionsHealth(context),
      this.analyzeDeploymentHistory(context),
    ]);

    // Collect all issues
    const issues: HealthIssue[] = [
      ...gdapStatus.issues,
      ...connectionsStatus.issues,
      ...deploymentMetrics.issues,
    ];

    // Calculate health score
    const healthScore = this.calculateHealthScore(issues, deploymentMetrics.successRate);

    // Determine overall status
    const status = this.determineStatus(healthScore, issues);

    const health: TenantHealth = {
      tenantId: context.tenantId,
      tenantName: context.tenantName,
      healthScore,
      status,
      lastChecked: new Date().toISOString(),
      issues,
      gdapStatus: gdapStatus.status,
      connectionsStatus: connectionsStatus.status,
      recentSuccessRate: deploymentMetrics.successRate,
      recentDeployments: deploymentMetrics.counts,
    };

    // Cache the result
    this.cache.set(context.tenantId, { data: health, timestamp: Date.now() });

    return health;
  }

  /**
   * Check detailed health for a single tenant
   */
  async checkTenantHealthDetail(
    context: HealthCheckContext,
    skipCache = false
  ): Promise<TenantHealthDetail> {
    const basicHealth = await this.checkTenantHealth(context, skipCache);

    // Get detailed GDAP info
    const gdapDetail = await this.getGDAPDetail(context);

    // Get detailed connection info
    const connectionsDetail = await this.getConnectionsDetail(context);

    // Get recent deployment history
    const recentHistory = this.getRecentDeploymentHistory(context);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      basicHealth,
      gdapDetail,
      connectionsDetail
    );

    return {
      ...basicHealth,
      gdap: gdapDetail,
      connections: connectionsDetail,
      recentDeploymentHistory: recentHistory,
      recommendations,
    };
  }

  /**
   * Check health for multiple tenants
   */
  async checkMultipleTenants(
    contexts: HealthCheckContext[],
    skipCache = false
  ): Promise<TenantHealth[]> {
    return Promise.all(contexts.map((ctx) => this.checkTenantHealth(ctx, skipCache)));
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
  // Private Health Check Methods
  // ============================================================================

  private async checkGDAPHealth(context: HealthCheckContext): Promise<{
    status: "valid" | "missing_role" | "expired" | "propagating" | "unknown";
    issues: HealthIssue[];
  }> {
    const issues: HealthIssue[] = [];

    // In demo mode, use tenant metadata for deterministic GDAP scenarios
    if (process.env.DEMO_MODE === "true") {
      const meta = getDemoTenantMetadata(context.tenantId);

      if (meta) {
        switch (meta.gdapStatus) {
          case "missing_role":
            issues.push({
              severity: "critical",
              category: "permissions",
              message:
                meta.gdapIssue || "Missing Power Platform Administrator role in GDAP relationship",
              resolution:
                "Add the Power Platform Administrator role to this tenant's GDAP relationship in Partner Center",
              link: "https://partner.microsoft.com/commerce/granularadminrelationships",
            });
            return { status: "missing_role", issues };

          case "expired":
            issues.push({
              severity: "error",
              category: "permissions",
              message: meta.gdapIssue || "GDAP relationship expired",
              resolution: "Renew the GDAP relationship in Partner Center",
              link: "https://partner.microsoft.com/commerce/granularadminrelationships",
            });
            return { status: "expired", issues };

          case "propagating":
            issues.push({
              severity: "warning",
              category: "permissions",
              message:
                meta.gdapIssue ||
                "GDAP relationship created recently, permissions may still be propagating",
              resolution: "Wait 24-48 hours for permissions to fully propagate",
            });
            return { status: "propagating", issues };

          case "expiring_soon":
            issues.push({
              severity: "warning",
              category: "permissions",
              message: meta.gdapIssue || "GDAP relationship expiring soon",
              resolution: "Renew GDAP relationship before it expires",
              link: "https://partner.microsoft.com/commerce/granularadminrelationships",
            });
            return { status: "valid", issues };

          case "valid":
          default:
            return { status: "valid", issues: [] };
        }
      }

      return { status: "valid", issues: [] };
    }

    // TODO: Real GDAP check via Microsoft Graph API
    // GET https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships
    return { status: "unknown", issues: [] };
  }

  private async checkConnectionsHealth(context: HealthCheckContext): Promise<{
    status: "valid" | "expired" | "missing" | "unknown";
    issues: HealthIssue[];
  }> {
    const issues: HealthIssue[] = [];

    // In demo mode, use tenant metadata for deterministic connection scenarios
    if (process.env.DEMO_MODE === "true") {
      const meta = getDemoTenantMetadata(context.tenantId);

      if (meta) {
        switch (meta.connectionStatus) {
          case "expired":
            issues.push({
              severity: "error",
              category: "connections",
              message:
                meta.connectionIssue || "Connection reference expired: requires reauthentication",
              resolution:
                "Open the solution in the maker portal and update the connection reference",
              link: `${context.environmentUrl}/main.aspx?forceUCI=1&pagetype=apps`,
            });
            return { status: "expired", issues };

          case "missing":
            issues.push({
              severity: "error",
              category: "connections",
              message: meta.connectionIssue || "Missing required connection: not configured",
              resolution: "Configure the required connection in the maker portal before deploying",
              link: `${context.environmentUrl}/main.aspx?forceUCI=1&pagetype=apps`,
            });
            return { status: "missing", issues };

          case "expiring_certificate":
            issues.push({
              severity: "warning",
              category: "connections",
              message: meta.connectionIssue || "Connection certificate expiring soon",
              resolution: "Rotate the OAuth certificate before it expires",
            });
            return { status: "valid", issues };

          case "valid":
          default:
            return { status: "valid", issues: [] };
        }
      }

      return { status: "valid", issues: [] };
    }

    // TODO: Real connection check via Dataverse API
    return { status: "unknown", issues: [] };
  }

  private analyzeDeploymentHistory(context: HealthCheckContext): {
    successRate: number;
    counts: { total: number; successful: number; failed: number };
    issues: HealthIssue[];
  } {
    const issues: HealthIssue[] = [];

    if (!context.deploymentHistory || context.deploymentHistory.length === 0) {
      return {
        successRate: 1.0, // Assume healthy if no history
        counts: { total: 0, successful: 0, failed: 0 },
        issues: [],
      };
    }

    const recent = context.deploymentHistory.slice(0, 10);
    const successful = recent.filter((d) => d.status === "success").length;
    const failed = recent.filter((d) => d.status === "failure").length;
    const successRate = successful / recent.length;

    // Check for concerning patterns
    if (successRate < 0.5) {
      issues.push({
        severity: "critical",
        category: "history",
        message: `Low success rate: Only ${Math.round(successRate * 100)}% of recent deployments succeeded`,
        resolution:
          "Review recent deployment errors and address underlying issues before deploying again",
      });
    } else if (successRate < 0.7) {
      issues.push({
        severity: "warning",
        category: "history",
        message: `Moderate success rate: ${Math.round(successRate * 100)}% of recent deployments succeeded`,
        resolution: "Some recent deployments failed, consider investigating before deploying",
      });
    }

    // Check for recent failures
    const lastThree = recent.slice(0, 3);
    const recentFailures = lastThree.filter((d) => d.status === "failure").length;
    if (recentFailures >= 2) {
      issues.push({
        severity: "error",
        category: "history",
        message: `${recentFailures} of last 3 deployments failed`,
        resolution: "Fix underlying issues before attempting another deployment",
      });
    }

    return {
      successRate,
      counts: {
        total: recent.length,
        successful,
        failed,
      },
      issues,
    };
  }

  private async getGDAPDetail(context: HealthCheckContext) {
    // In demo mode, return metadata-driven GDAP details
    if (process.env.DEMO_MODE === "true") {
      const meta = getDemoTenantMetadata(context.tenantId);

      if (meta) {
        const baseExpiry =
          meta.gdapRelationshipExpiry ||
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        switch (meta.gdapStatus) {
          case "missing_role":
            return {
              status: "missing_role" as const,
              roles: ["Dynamics 365 Administrator"],
              missingRoles: ["Power Platform Administrator"],
              relationshipExpiry: baseExpiry,
              lastVerified: new Date().toISOString(),
              issue: meta.gdapIssue || "Missing required role",
            };

          case "expired":
            return {
              status: "expired" as const,
              roles: [],
              relationshipExpiry:
                meta.gdapRelationshipExpiry ||
                new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              lastVerified: new Date().toISOString(),
              issue: meta.gdapIssue || "GDAP relationship expired",
            };

          case "propagating":
            return {
              status: "propagating" as const,
              roles: ["Power Platform Administrator", "Dynamics 365 Administrator"],
              relationshipExpiry: baseExpiry,
              lastVerified: new Date().toISOString(),
              issue: meta.gdapIssue || "Permissions still propagating",
            };

          case "expiring_soon":
            return {
              status: "valid" as const,
              roles: ["Power Platform Administrator", "Dynamics 365 Administrator"],
              relationshipExpiry:
                meta.gdapRelationshipExpiry ||
                new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
              lastVerified: new Date().toISOString(),
              issue: meta.gdapIssue || "GDAP relationship expiring soon",
            };
        }
      }

      return {
        status: "valid" as const,
        roles: ["Power Platform Administrator", "Dynamics 365 Administrator"],
        relationshipExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        lastVerified: new Date().toISOString(),
      };
    }

    // TODO: Real GDAP detail via Microsoft Graph API
    return {
      status: "unknown" as const,
      lastVerified: new Date().toISOString(),
    };
  }

  private async getConnectionsDetail(context: HealthCheckContext) {
    // In demo mode, return metadata-driven connection details
    if (process.env.DEMO_MODE === "true") {
      const meta = getDemoTenantMetadata(context.tenantId);

      const connections: Array<{
        name: string;
        displayName: string;
        status: "valid" | "expired" | "missing";
        expiryDate?: string;
        issue?: string;
      }> = [];

      if (meta) {
        switch (meta.connectionStatus) {
          case "expired":
            connections.push({
              name: "shared_commondataserviceforapps",
              displayName: "Dataverse",
              status: "expired",
              expiryDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              issue: meta.connectionIssue || "Connection expired, needs reauthentication",
            });
            break;

          case "missing":
            connections.push({
              name: "shared_commondataserviceforapps",
              displayName: "Dataverse",
              status: "valid",
              expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            });
            connections.push({
              name: "shared_sharepointonline",
              displayName: "SharePoint",
              status: "missing",
              issue: meta.connectionIssue || "Connection never configured",
            });
            break;

          case "expiring_certificate":
            connections.push({
              name: "shared_commondataserviceforapps",
              displayName: "Dataverse",
              status: "valid",
              expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
              issue: meta.connectionIssue || "OAuth certificate expiring in 15 days",
            });
            break;

          default:
            connections.push({
              name: "shared_commondataserviceforapps",
              displayName: "Dataverse",
              status: "valid",
              expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            });
            break;
        }

        // Add Office 365 connection for tenants that have valid/expiring connections
        if (meta.connectionStatus !== "expired") {
          connections.push({
            name: "shared_office365",
            displayName: "Office 365 Outlook",
            status: "valid",
            expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      } else {
        // Unknown tenant, return sensible defaults
        connections.push({
          name: "shared_commondataserviceforapps",
          displayName: "Dataverse",
          status: "valid",
          expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        });
        connections.push({
          name: "shared_office365",
          displayName: "Office 365 Outlook",
          status: "valid",
          expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      return connections;
    }

    // TODO: Real connection detail via Dataverse API
    return [];
  }

  private getRecentDeploymentHistory(context: HealthCheckContext) {
    if (!context.deploymentHistory) return [];

    return context.deploymentHistory.slice(0, 20).map((d, idx) => ({
      id: `deployment-${idx}`,
      timestamp: d.completedAt,
      status: d.status,
      duration: d.durationMinutes,
      error: d.error,
    }));
  }

  private generateRecommendations(health: TenantHealth, gdap: any, connections: any[]): string[] {
    const recommendations: string[] = [];

    // GDAP recommendations
    if (gdap.status === "missing_role") {
      recommendations.push("Add missing GDAP roles in Partner Center before deploying");
    } else if (gdap.status === "expired") {
      recommendations.push("Renew GDAP relationship in Partner Center");
    } else if (gdap.status === "propagating") {
      recommendations.push("Wait 24-48 hours for GDAP permissions to fully propagate");
    }

    // Connection recommendations
    const expiredConnections = connections.filter((c) => c.status === "expired");
    if (expiredConnections.length > 0) {
      recommendations.push(
        `Reauthenticate ${expiredConnections.length} expired connection${expiredConnections.length > 1 ? "s" : ""} in maker portal`
      );
    }

    // History-based recommendations
    if (health.recentSuccessRate < 0.7) {
      recommendations.push("Review and fix recent deployment failures before deploying again");
    }

    // General health recommendations
    if (health.healthScore < 50) {
      recommendations.push("Address critical issues before attempting deployments to this tenant");
    } else if (health.healthScore < 70) {
      recommendations.push("Consider fixing warnings to improve deployment success rate");
    }

    return recommendations;
  }

  // ============================================================================
  // Scoring
  // ============================================================================

  private calculateHealthScore(issues: HealthIssue[], successRate: number): number {
    // Start with perfect score
    let score = 100;

    // Deduct points for issues
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

    // Factor in deployment success rate (30% weight)
    const historyScore = successRate * 30;
    score = score * 0.7 + historyScore;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private determineStatus(
    score: number,
    issues: HealthIssue[]
  ): "healthy" | "warning" | "critical" {
    // Critical if any critical issues or score very low
    if (issues.some((i) => i.severity === "critical") || score < 40) {
      return "critical";
    }

    // Warning if any errors/warnings or medium score
    if (issues.some((i) => i.severity === "error" || i.severity === "warning") || score < 70) {
      return "warning";
    }

    return "healthy";
  }
}

// Export singleton
export const healthChecker = new HealthChecker();
