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
 * Drift Risk Analyzer
 *
 * Scores the risk of updating each drifted tenant by combining:
 * - Version drift magnitude (how far behind)
 * - Deployment history (last result, success rate, recency)
 * - Tenant tags (production vs staging vs test)
 *
 * Produces a per-tenant recommendation: safe_to_update, review_recommended,
 * update_risky, or do_not_update.
 */

import { TenantVersionStatus, SolutionVersionInfo } from "./version-checker.js";
import { TenantConfig } from "../config/schema.js";

// ============================================================================
// Types
// ============================================================================

export type DriftRiskLevel = "low" | "medium" | "high";

export type DriftRecommendation =
  | "safe_to_update"
  | "review_recommended"
  | "update_risky"
  | "do_not_update"
  | "current";

export interface DriftRiskFactor {
  name: string;
  level: DriftRiskLevel;
  weight: number; // 0-10
  description: string;
}

export interface TenantDriftAnalysis {
  tenantId: string;
  tenantName: string;
  environmentUrl: string;
  riskLevel: DriftRiskLevel;
  riskScore: number; // 0-100
  recommendation: DriftRecommendation;
  recommendationReason: string;
  factors: DriftRiskFactor[];
  versionStatus: TenantVersionStatus;
  outdatedSolutions: SolutionVersionInfo[];
}

export interface FleetDriftAnalysis {
  tenants: TenantDriftAnalysis[];
  summary: {
    total: number;
    current: number;
    safeToUpdate: number;
    reviewRecommended: number;
    risky: number;
    doNotUpdate: number;
  };
}

/**
 * Deployment history for a single tenant, passed in by the caller.
 * Keeps the DriftAnalyzer decoupled from Dataverse query logic.
 */
export interface TenantDeploymentHistory {
  tenantId: string;
  lastDeployResult: "success" | "failure" | null;
  lastDeployDate: string | null;
  totalDeploys: number;
  successfulDeploys: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Weights for risk factors (higher = more impact on score) */
const WEIGHTS = {
  versionsBehind: 8,
  lastDeployResult: 7,
  timeSinceLastDeploy: 5,
  deploySuccessRate: 4,
  productionTag: 6,
};

const HIGH_RISK_TAGS = ["production", "enterprise", "priority", "finance"];
const LOW_RISK_TAGS = ["test", "staging", "dev", "sandbox"];

// ============================================================================
// DriftAnalyzer
// ============================================================================

export class DriftAnalyzer {
  /**
   * Analyze drift risk for a single tenant
   */
  analyzeTenant(
    tenant: TenantConfig,
    versionStatus: TenantVersionStatus,
    history?: TenantDeploymentHistory
  ): TenantDriftAnalysis {
    const factors: DriftRiskFactor[] = [];
    const outdatedSolutions = versionStatus.solutions.filter((s) => s.status === "outdated");

    // If tenant is current, short-circuit
    if (versionStatus.overallStatus === "current") {
      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        riskLevel: "low",
        riskScore: 0,
        recommendation: "current",
        recommendationReason: "All solutions are at the expected version",
        factors: [],
        versionStatus,
        outdatedSolutions: [],
      };
    }

    // Factor 1: How many versions behind
    const maxDrift = Math.max(...outdatedSolutions.map((s) => Math.abs(s.versionDrift)), 0);
    if (maxDrift >= 3) {
      factors.push({
        name: "versions_behind",
        level: "high",
        weight: WEIGHTS.versionsBehind,
        description: `${maxDrift} version(s) behind — significant gap increases upgrade risk`,
      });
    } else if (maxDrift === 2) {
      factors.push({
        name: "versions_behind",
        level: "medium",
        weight: WEIGHTS.versionsBehind,
        description: `${maxDrift} version(s) behind`,
      });
    } else if (maxDrift === 1) {
      factors.push({
        name: "versions_behind",
        level: "low",
        weight: WEIGHTS.versionsBehind,
        description: "1 version behind — minor update",
      });
    }

    // Factor 2: Last deployment result
    if (history) {
      if (history.lastDeployResult === "failure") {
        factors.push({
          name: "last_deploy_failed",
          level: "high",
          weight: WEIGHTS.lastDeployResult,
          description: "Last deployment failed — retrying may hit the same issue",
        });
      } else if (history.lastDeployResult === "success") {
        factors.push({
          name: "last_deploy_succeeded",
          level: "low",
          weight: WEIGHTS.lastDeployResult,
          description: "Last deployment succeeded",
        });
      }

      // Factor 3: Time since last deploy
      if (history.lastDeployDate) {
        const daysSince = Math.floor(
          (Date.now() - new Date(history.lastDeployDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSince > 90) {
          factors.push({
            name: "stale_environment",
            level: "high",
            weight: WEIGHTS.timeSinceLastDeploy,
            description: `${daysSince} days since last deploy — environment may have drifted significantly`,
          });
        } else if (daysSince > 30) {
          factors.push({
            name: "aging_environment",
            level: "medium",
            weight: WEIGHTS.timeSinceLastDeploy,
            description: `${daysSince} days since last deploy`,
          });
        } else {
          factors.push({
            name: "recent_deploy",
            level: "low",
            weight: WEIGHTS.timeSinceLastDeploy,
            description: `${daysSince} days since last deploy — recently active`,
          });
        }
      }

      // Factor 4: Deploy success rate
      if (history.totalDeploys > 0) {
        const successRate = history.successfulDeploys / history.totalDeploys;
        if (successRate < 0.5) {
          factors.push({
            name: "low_success_rate",
            level: "high",
            weight: WEIGHTS.deploySuccessRate,
            description: `${Math.round(successRate * 100)}% deploy success rate — this tenant is flaky`,
          });
        } else if (successRate < 0.8) {
          factors.push({
            name: "moderate_success_rate",
            level: "medium",
            weight: WEIGHTS.deploySuccessRate,
            description: `${Math.round(successRate * 100)}% deploy success rate`,
          });
        }
      }
    }

    // Factor 5: Tenant tags (production = higher risk)
    const tags = tenant.tags || [];
    const hasHighRiskTag = tags.some((t) => HIGH_RISK_TAGS.includes(t.toLowerCase()));
    const hasLowRiskTag = tags.some((t) => LOW_RISK_TAGS.includes(t.toLowerCase()));

    if (hasHighRiskTag) {
      factors.push({
        name: "production_tenant",
        level: "medium",
        weight: WEIGHTS.productionTag,
        description: `Tagged as ${tags.filter((t) => HIGH_RISK_TAGS.includes(t.toLowerCase())).join(", ")} — higher blast radius`,
      });
    } else if (hasLowRiskTag) {
      factors.push({
        name: "non_production_tenant",
        level: "low",
        weight: WEIGHTS.productionTag,
        description: `Tagged as ${tags.filter((t) => LOW_RISK_TAGS.includes(t.toLowerCase())).join(", ")} — lower risk`,
      });
    }

    // Calculate composite score
    const riskScore = this.calculateScore(factors);
    const riskLevel = this.scoreToLevel(riskScore);
    const { recommendation, reason } = this.getRecommendation(riskLevel, factors);

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      riskLevel,
      riskScore,
      recommendation,
      recommendationReason: reason,
      factors,
      versionStatus,
      outdatedSolutions,
    };
  }

  /**
   * Analyze drift risk for a fleet of tenants
   */
  analyzeFleet(
    tenants: TenantConfig[],
    versionStatuses: TenantVersionStatus[],
    histories?: Map<string, TenantDeploymentHistory>
  ): FleetDriftAnalysis {
    const analyses = tenants.map((tenant, i) => {
      const versionStatus = versionStatuses[i];
      const history = histories?.get(tenant.tenantId);
      return this.analyzeTenant(tenant, versionStatus, history);
    });

    return {
      tenants: analyses,
      summary: {
        total: analyses.length,
        current: analyses.filter((a) => a.recommendation === "current").length,
        safeToUpdate: analyses.filter((a) => a.recommendation === "safe_to_update").length,
        reviewRecommended: analyses.filter((a) => a.recommendation === "review_recommended").length,
        risky: analyses.filter((a) => a.recommendation === "update_risky").length,
        doNotUpdate: analyses.filter((a) => a.recommendation === "do_not_update").length,
      },
    };
  }

  // ============================================================================
  // Private
  // ============================================================================

  private calculateScore(factors: DriftRiskFactor[]): number {
    if (factors.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const factor of factors) {
      const levelScore = factor.level === "high" ? 100 : factor.level === "medium" ? 50 : 10;
      weightedSum += levelScore * factor.weight;
      totalWeight += factor.weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  private scoreToLevel(score: number): DriftRiskLevel {
    if (score >= 65) return "high";
    if (score >= 35) return "medium";
    return "low";
  }

  private getRecommendation(
    level: DriftRiskLevel,
    factors: DriftRiskFactor[]
  ): { recommendation: DriftRecommendation; reason: string } {
    const hasLastDeployFailed = factors.some((f) => f.name === "last_deploy_failed");
    const hasStaleEnv = factors.some((f) => f.name === "stale_environment");
    const hasLowSuccessRate = factors.some((f) => f.name === "low_success_rate");

    // Hard blockers
    if (hasLastDeployFailed && hasStaleEnv) {
      return {
        recommendation: "do_not_update",
        reason: "Last deploy failed and environment is stale — investigate before retrying",
      };
    }

    if (hasLowSuccessRate && hasLastDeployFailed) {
      return {
        recommendation: "do_not_update",
        reason: "Chronically failing tenant — fix underlying issues first",
      };
    }

    // Score-based
    if (level === "high") {
      return {
        recommendation: "update_risky",
        reason: this.getTopRiskDescription(factors),
      };
    }

    if (level === "medium") {
      return {
        recommendation: "review_recommended",
        reason: this.getTopRiskDescription(factors),
      };
    }

    return {
      recommendation: "safe_to_update",
      reason: "Low risk — safe to proceed",
    };
  }

  private getTopRiskDescription(factors: DriftRiskFactor[]): string {
    const highFactors = factors.filter((f) => f.level === "high" || f.level === "medium");
    if (highFactors.length === 0) return "Minor risk factors present";

    // Sort by weight descending, take top factor
    highFactors.sort((a, b) => b.weight - a.weight);
    return highFactors[0].description;
  }
}

// Export singleton
export const driftAnalyzer = new DriftAnalyzer();
