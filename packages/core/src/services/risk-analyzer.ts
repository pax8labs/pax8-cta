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

/**
 * Deployment Risk Analyzer
 * Analyzes deployment risk before execution
 */

import { getDemoTenantMetadata } from "../mock/demo-data.js";

// Simple tenant interface for risk analysis
export interface Tenant {
  id: string;
  name: string;
  environmentUrl: string;
  tags?: string[];
}

// Risk severity levels
export type RiskSeverity = "info" | "warning" | "error" | "critical";

// Risk categories
export type RiskCategory =
  | "permissions"
  | "dependencies"
  | "health"
  | "timing"
  | "history"
  | "connections"
  | "configuration";

// Individual risk issue
export interface RiskIssue {
  severity: RiskSeverity;
  category: RiskCategory;
  message: string;
  affectedTenants?: string[];
  resolution?: string;
  link?: string;
  details?: Record<string, unknown>;
}

// Overall risk assessment
export interface RiskAnalysis {
  score: "low" | "medium" | "high" | "critical";
  confidence: number; // 0-100%
  estimatedDuration: {
    min: number; // minutes
    max: number; // minutes
  };
  successProbability: number; // 0-100%
  issues: RiskIssue[];
  recommendations: string[];
  blockers: RiskIssue[]; // Critical issues that prevent deployment
  canProceed: boolean;
  requiresApproval: boolean;
}

// Deployment context for analysis
export interface DeploymentContext {
  tenants: Tenant[];
  solutionFile?: string;
  solutionSize?: number;
  isProduction: boolean;
  scheduledTime?: Date;
  deploymentHistory?: DeploymentHistoryEntry[];
}

// Historical deployment data
export interface DeploymentHistoryEntry {
  tenantId: string;
  status: "success" | "failure";
  error?: string;
  completedAt: string;
  durationMinutes?: number;
}

/**
 * Main risk analyzer class
 */
export class DeploymentRiskAnalyzer {
  /**
   * Analyze deployment risk
   */
  async analyze(context: DeploymentContext): Promise<RiskAnalysis> {
    const issues: RiskIssue[] = [];
    const recommendations: string[] = [];

    // Run all checks in parallel
    const [gdapIssues, connectionIssues, healthIssues, historyIssues] = await Promise.all([
      this.checkGDAPPermissions(context),
      this.checkConnections(context),
      this.checkTenantHealth(context),
      this.analyzeHistory(context),
    ]);

    issues.push(...gdapIssues, ...connectionIssues, ...healthIssues, ...historyIssues);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(issues);

    // Identify blockers (critical issues)
    const blockers = issues.filter((i) => i.severity === "critical");

    // Generate recommendations
    const recs = this.generateRecommendations(issues, context);
    recommendations.push(...recs);

    // Estimate duration
    const duration = this.estimateDuration(context, issues);

    // Calculate success probability
    const successProbability = this.calculateSuccessProbability(context, issues);

    // Determine if deployment can proceed
    const canProceed = blockers.length === 0;

    // Determine if approval is required
    const requiresApproval =
      riskScore === "high" || riskScore === "critical" || context.isProduction;

    return {
      score: riskScore,
      confidence: this.calculateConfidence(context),
      estimatedDuration: duration,
      successProbability,
      issues,
      recommendations,
      blockers,
      canProceed,
      requiresApproval,
    };
  }

  /**
   * Check GDAP permissions for all tenants
   */
  private async checkGDAPPermissions(context: DeploymentContext): Promise<RiskIssue[]> {
    const issues: RiskIssue[] = [];

    // In demo mode, use tenant metadata for deterministic GDAP scenarios
    if (process.env.DEMO_MODE === "true") {
      const missingRoleTenants: string[] = [];
      const expiredTenants: string[] = [];
      const propagatingTenants: string[] = [];
      const expiringSoonTenants: string[] = [];

      for (const tenant of context.tenants) {
        const meta = getDemoTenantMetadata(tenant.id);
        if (!meta) continue;

        switch (meta.gdapStatus) {
          case "missing_role":
            missingRoleTenants.push(tenant.name);
            break;
          case "expired":
            expiredTenants.push(tenant.name);
            break;
          case "propagating":
            propagatingTenants.push(tenant.name);
            break;
          case "expiring_soon":
            expiringSoonTenants.push(tenant.name);
            break;
        }
      }

      if (missingRoleTenants.length > 0) {
        issues.push({
          severity: "critical",
          category: "permissions",
          message: `${missingRoleTenants.length} tenant${missingRoleTenants.length > 1 ? "s" : ""} missing Power Platform Admin role`,
          affectedTenants: missingRoleTenants,
          resolution: "Add Power Platform Admin role to GDAP relationship in Partner Center",
          link: "https://partner.microsoft.com/en-us/dashboard/commerce2/customers/delegatedadmin",
          details: {
            missingRole: "Power Platform Administrator",
            requiredFor: ["Solution import", "Connection management", "Flow activation"],
          },
        });
      }

      if (expiredTenants.length > 0) {
        issues.push({
          severity: "critical",
          category: "permissions",
          message: `${expiredTenants.length} tenant${expiredTenants.length > 1 ? "s" : ""} with expired GDAP relationship`,
          affectedTenants: expiredTenants,
          resolution: "Renew GDAP relationship in Partner Center",
          link: "https://partner.microsoft.com/en-us/dashboard/commerce2/customers/delegatedadmin",
          details: {
            issue: "GDAP relationship has ended",
            impact: "Cannot perform any delegated admin operations",
          },
        });
      }

      if (propagatingTenants.length > 0) {
        issues.push({
          severity: "warning",
          category: "permissions",
          message: `${propagatingTenants.length} tenant${propagatingTenants.length > 1 ? "s" : ""} with recently added GDAP (permissions may not be propagated)`,
          affectedTenants: propagatingTenants,
          resolution: "Wait 24-48 hours for GDAP permissions to fully propagate",
        });
      }

      if (expiringSoonTenants.length > 0) {
        issues.push({
          severity: "warning",
          category: "permissions",
          message: `${expiringSoonTenants.length} tenant${expiringSoonTenants.length > 1 ? "s" : ""} with GDAP relationship expiring within 7 days`,
          affectedTenants: expiringSoonTenants,
          resolution: "Renew GDAP relationships before they expire",
          link: "https://partner.microsoft.com/en-us/dashboard/commerce2/customers/delegatedadmin",
        });
      }
    }

    // TODO: In production, check actual GDAP via Microsoft Graph API
    // const gdapStatus = await this.checkGDAPViaGraph(context.tenants)

    return issues;
  }

  /**
   * Check connection references
   */
  private async checkConnections(context: DeploymentContext): Promise<RiskIssue[]> {
    const issues: RiskIssue[] = [];

    // In demo mode, use tenant metadata for deterministic connection scenarios
    if (process.env.DEMO_MODE === "true") {
      const expiredTenants: string[] = [];
      const missingTenants: string[] = [];
      const expiringCertTenants: string[] = [];

      for (const tenant of context.tenants) {
        const meta = getDemoTenantMetadata(tenant.id);
        if (!meta) continue;

        switch (meta.connectionStatus) {
          case "expired":
            expiredTenants.push(tenant.name);
            break;
          case "missing":
            missingTenants.push(tenant.name);
            break;
          case "expiring_certificate":
            expiringCertTenants.push(tenant.name);
            break;
        }
      }

      if (expiredTenants.length > 0) {
        issues.push({
          severity: "critical",
          category: "connections",
          message: `${expiredTenants.length} tenant${expiredTenants.length > 1 ? "s" : ""} with expired connection references`,
          affectedTenants: expiredTenants,
          resolution: "Renew expired connections in the Connections page of each affected tenant",
          details: {
            connectionType: "OAuth",
            impact: "Solution import will fail without valid connections",
          },
        });
      }

      if (missingTenants.length > 0) {
        issues.push({
          severity: "critical",
          category: "connections",
          message: `${missingTenants.length} tenant${missingTenants.length > 1 ? "s" : ""} with missing required connections`,
          affectedTenants: missingTenants,
          resolution: "Configure required connections before deploying",
          details: {
            impact: "Solution cannot function without required connections",
          },
        });
      }

      if (expiringCertTenants.length > 0) {
        issues.push({
          severity: "warning",
          category: "connections",
          message: `${expiringCertTenants.length} tenant${expiringCertTenants.length > 1 ? "s" : ""} with certificates expiring within 30 days`,
          affectedTenants: expiringCertTenants,
          resolution: "Rotate certificates before they expire to avoid deployment failures",
        });
      }
    }

    // TODO: In production, check actual connection references
    // const connections = await this.checkConnectionsViaDataverse(context)

    return issues;
  }

  /**
   * Check tenant health
   */
  private async checkTenantHealth(context: DeploymentContext): Promise<RiskIssue[]> {
    const issues: RiskIssue[] = [];

    // Check for recurring failures (same error appearing multiple times)
    if (context.deploymentHistory) {
      const recentFailures = context.deploymentHistory.filter(
        (h) =>
          h.status === "failure" &&
          new Date(h.completedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      if (recentFailures.length > 0) {
        // Group failures by error message to identify recurring patterns
        const errorCounts = new Map<
          string,
          { count: number; tenantIds: Set<string>; fullError: string }
        >();

        for (const failure of recentFailures) {
          if (!failure.error) continue;

          // Extract error type (first line or first 100 chars for grouping)
          const errorType = failure.error.split("\n")[0].substring(0, 100);

          if (!errorCounts.has(errorType)) {
            errorCounts.set(errorType, {
              count: 0,
              tenantIds: new Set(),
              fullError: failure.error,
            });
          }

          const errorInfo = errorCounts.get(errorType)!;
          errorInfo.count++;
          errorInfo.tenantIds.add(failure.tenantId);
        }

        // Only warn about recurring errors (appeared 2+ times)
        const recurringErrors = Array.from(errorCounts.entries())
          .filter(([_, info]) => info.count >= 2)
          .sort((a, b) => b[1].count - a[1].count); // Sort by frequency

        if (recurringErrors.length > 0) {
          const [mostCommonError, errorInfo] = recurringErrors[0];
          const affectedTenantIds = Array.from(errorInfo.tenantIds);
          const tenantNames = context.tenants
            .filter((t) => affectedTenantIds.includes(t.id))
            .map((t) => t.name);

          issues.push({
            severity: "warning",
            category: "health",
            message: `Recurring deployment failure detected (${errorInfo.count}x in last 24 hours)`,
            affectedTenants: tenantNames,
            resolution:
              "This error has occurred multiple times. Fix the root cause before deploying again",
            details: {
              errorType: mostCommonError,
              occurrences: errorInfo.count,
              affectedTenantCount: affectedTenantIds.length,
              fullError: errorInfo.fullError,
              allRecurringErrors: recurringErrors.map(([err, info]) => ({
                error: err,
                count: info.count,
              })),
            },
          });
        }
      }
    }

    return issues;
  }

  /**
   * Analyze deployment history
   */
  private async analyzeHistory(context: DeploymentContext): Promise<RiskIssue[]> {
    const issues: RiskIssue[] = [];

    // In demo mode, generate history issues from tenant metadata
    if (process.env.DEMO_MODE === "true" && !context.deploymentHistory) {
      const tenantsWithNoDeployments: string[] = [];
      const tenantsWithHighFailRate: string[] = [];
      const tenantsWithRecentFailures: string[] = [];
      const tenantsWithStaleData: string[] = [];

      for (const tenant of context.tenants) {
        const meta = getDemoTenantMetadata(tenant.id);
        if (!meta) {
          tenantsWithNoDeployments.push(tenant.name);
          continue;
        }

        if (!meta.lastSuccessfulDeployment) {
          tenantsWithNoDeployments.push(tenant.name);
          continue;
        }

        // Check for stale deployments (> 30 days since last success)
        const lastSuccess = new Date(meta.lastSuccessfulDeployment);
        const daysSinceSuccess = (Date.now() - lastSuccess.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceSuccess > 30) {
          tenantsWithStaleData.push(tenant.name);
        }

        // Check for high failure rate
        if (meta.recentFailures >= 3) {
          tenantsWithHighFailRate.push(tenant.name);
        } else if (meta.recentFailures >= 1 && meta.lastDeploymentError) {
          tenantsWithRecentFailures.push(tenant.name);
        }
      }

      if (tenantsWithNoDeployments.length > 0) {
        issues.push({
          severity: "info",
          category: "history",
          message: `${tenantsWithNoDeployments.length} tenant${tenantsWithNoDeployments.length > 1 ? "s" : ""} with no deployment history`,
          affectedTenants: tenantsWithNoDeployments,
          resolution: "Consider deploying to a test tenant first",
        });
      }

      if (tenantsWithHighFailRate.length > 0) {
        issues.push({
          severity: "warning",
          category: "history",
          message: `${tenantsWithHighFailRate.length} tenant${tenantsWithHighFailRate.length > 1 ? "s" : ""} with high recent failure rate`,
          affectedTenants: tenantsWithHighFailRate,
          resolution: "Review and fix common failure patterns before deploying",
          details: {
            threshold: "3+ recent failures",
          },
        });
      }

      if (tenantsWithRecentFailures.length > 0) {
        issues.push({
          severity: "info",
          category: "history",
          message: `${tenantsWithRecentFailures.length} tenant${tenantsWithRecentFailures.length > 1 ? "s" : ""} with recent deployment failures`,
          affectedTenants: tenantsWithRecentFailures,
          resolution: "Monitor these tenants during deployment",
        });
      }

      if (tenantsWithStaleData.length > 0) {
        issues.push({
          severity: "warning",
          category: "history",
          message: `${tenantsWithStaleData.length} tenant${tenantsWithStaleData.length > 1 ? "s" : ""} not deployed to in over 30 days`,
          affectedTenants: tenantsWithStaleData,
          resolution: "Validate environment connectivity before deploying to stale tenants",
        });
      }

      return issues;
    }

    if (!context.deploymentHistory || context.deploymentHistory.length === 0) {
      issues.push({
        severity: "info",
        category: "history",
        message: "No deployment history available",
        resolution: "Consider deploying to test tenant first",
      });
      return issues;
    }

    const totalDeployments = context.deploymentHistory.length;
    const successCount = context.deploymentHistory.filter((h) => h.status === "success").length;
    const successRate = (successCount / totalDeployments) * 100;

    // Minimum sample size threshold: need at least 20 deployments for meaningful statistics
    const MIN_SAMPLE_SIZE = 20;

    if (totalDeployments < MIN_SAMPLE_SIZE) {
      // Not enough data for statistical analysis
      issues.push({
        severity: "info",
        category: "history",
        message: `Limited deployment history (${totalDeployments} deployments)`,
        resolution: "Build more deployment history for accurate risk assessment",
        details: {
          totalDeployments,
          successfulDeployments: successCount,
          successRate: `${successRate.toFixed(0)}%`,
          minimumRequired: MIN_SAMPLE_SIZE,
        },
      });
    } else if (successRate < 70) {
      // Enough data and success rate is low - this is a real warning
      issues.push({
        severity: "warning",
        category: "history",
        message: `Low historical success rate: ${successRate.toFixed(0)}%`,
        resolution: "Review and fix common failure patterns before deploying",
        details: {
          totalDeployments,
          successfulDeployments: successCount,
          successRate: `${successRate.toFixed(0)}%`,
        },
      });
    }

    return issues;
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(issues: RiskIssue[]): "low" | "medium" | "high" | "critical" {
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

  /**
   * Calculate confidence in risk assessment
   */
  private calculateConfidence(context: DeploymentContext): number {
    let confidence = 100;

    // Reduce confidence if we have limited data
    if (!context.deploymentHistory || context.deploymentHistory.length < 5) {
      confidence -= 20;
    }

    if (process.env.DEMO_MODE === "true") {
      confidence -= 15; // Demo mode has simulated data
    }

    return Math.max(confidence, 0);
  }

  /**
   * Estimate deployment duration
   */
  private estimateDuration(
    context: DeploymentContext,
    issues: RiskIssue[]
  ): { min: number; max: number } {
    // Base duration: 2 minutes per tenant
    const baseDuration = context.tenants.length * 2;

    // Add time for issues
    const issueOverhead = issues.filter((i) => i.severity !== "info").length * 3;

    // Add time for large solutions
    const sizeOverhead = context.solutionSize && context.solutionSize > 50_000_000 ? 10 : 0;

    const min = baseDuration + issueOverhead + sizeOverhead;
    const max = Math.ceil(min * 1.3); // 30% buffer

    return { min, max };
  }

  /**
   * Calculate success probability
   */
  private calculateSuccessProbability(context: DeploymentContext, issues: RiskIssue[]): number {
    let probability = 95; // Start optimistic

    // Reduce based on issues
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

    // Adjust based on history
    if (context.deploymentHistory && context.deploymentHistory.length > 0) {
      const successCount = context.deploymentHistory.filter((h) => h.status === "success").length;
      const historicalRate = (successCount / context.deploymentHistory.length) * 100;

      // Blend historical rate with calculated probability
      probability = probability * 0.6 + historicalRate * 0.4;
    }

    return Math.max(Math.min(Math.round(probability), 100), 0);
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(issues: RiskIssue[], context: DeploymentContext): string[] {
    const recommendations: string[] = [];
    const criticalIssues = issues.filter((i) => i.severity === "critical");
    const warningIssues = issues.filter((i) => i.severity === "warning");

    if (criticalIssues.length > 0) {
      recommendations.push(`Fix ${criticalIssues.length} critical issues before deploying`);

      // Add specific recommendations for each critical issue
      for (const issue of criticalIssues) {
        if (issue.resolution) {
          recommendations.push(issue.resolution);
        }
      }
    }

    if (warningIssues.length > 0 && context.tenants.length > 5) {
      recommendations.push("Consider deploying to a subset of tenants first");
    }

    if (context.isProduction && criticalIssues.length === 0) {
      recommendations.push("Deploy to test environment first to validate");
    }

    if (recommendations.length === 0) {
      recommendations.push("All checks passed - ready to deploy");
    }

    return recommendations;
  }
}

/**
 * Singleton instance
 */
export const riskAnalyzer = new DeploymentRiskAnalyzer();
