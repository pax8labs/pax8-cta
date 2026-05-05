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
 * Deployment Risk Analyzer
 * Analyzes deployment risk before execution
 */

import { getDemoTenantMetadata, type DemoPreconditionState } from "../mock/demo-data.js";
import {
  loadPreconditionManifest,
  checkPreconditions,
  PreconditionManifestValidationError,
  type Precondition,
  type PreconditionFailure,
} from "../preconditions/index.js";
import type { TenantConfig } from "../config/schema.js";
import { join } from "node:path";
import type { WaveExecutionPlan } from "./waves.js";

// Simple tenant interface for risk analysis
export interface Tenant {
  id: string;
  name: string;
  environmentUrl: string;
  tags?: string[];
}

/**
 * Confidence qualifier — coarse bucket suitable for both human-readable
 * labels and machine-readable scripting. Gated on the numeric `confidence`
 * field via `confidenceQualifier()`.
 */
export type ConfidenceQualifier = "limited" | "moderate" | "high";

/**
 * Per-tenant risk row surfaced in `RiskAnalysis.perTenantBreakdown`. Same
 * dimensions as the aggregate analysis (issues are already attributed by
 * `affectedTenants`), but rolled up per-tenant for scripting and display.
 */
export interface TenantRiskRow {
  tenantId: string;
  tenantName: string;
  /** Risk level computed from issues that affect this specific tenant. */
  score: "low" | "medium" | "high" | "critical";
  /** The single highest-severity issue that mentions this tenant. */
  topFactor?: {
    severity: RiskSeverity;
    category: RiskCategory;
    message: string;
  };
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
  | "configuration"
  | "preconditions";

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
  /**
   * Coarse bucket for `confidence`: "limited" (< 70), "moderate" (70-90),
   * "high" (>= 90). Surfaced separately so scripts/CI can branch without
   * re-implementing the threshold logic.
   */
  confidenceQualifier: ConfidenceQualifier;
  /** Snake-case alias of `confidenceQualifier` for JSON consumers. */
  confidence_qualifier: ConfidenceQualifier;
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
  /** Per-tenant risk rollup. Same dimensions, attributed per tenant. */
  perTenantBreakdown: TenantRiskRow[];
  /**
   * Preflight (preconditions) results — the fifth analyze dimension. When
   * no manifest was found for the solution, `manifestFound` is false and
   * `failures` is empty. When the manifest validates and the diff engine
   * runs, every failed (tenant × requirement) lands in `failures` here AND
   * is mirrored into `issues` as a RiskIssue with category `preconditions`.
   */
  preconditions: {
    manifestFound: boolean;
    solution?: string;
    manifestVersion?: string;
    failures: PreconditionFailure[];
  };
}

// Deployment context for analysis
export interface DeploymentContext {
  tenants: Tenant[];
  solutionFile?: string;
  solutionSize?: number;
  isProduction: boolean;
  scheduledTime?: Date;
  deploymentHistory?: DeploymentHistoryEntry[];
  /**
   * Wave execution plan to model duration with parallelism. Built from
   * `WaveService.createExecutionPlan(config, destinations)` by callers that
   * have access to a Config (real-mode `analyze`). When omitted, the
   * analyzer assumes a single wave with `maxParallel = DEFAULT_MAX_PARALLEL`.
   */
  waves?: WaveExecutionPlan;
  /**
   * Override for the single-wave default parallelism. Only consulted when
   * `waves` is not provided. Defaults to `DEFAULT_MAX_PARALLEL` (5).
   */
  maxParallel?: number;
  /**
   * Directories to search for `<solution>.preconditions.yaml`. When omitted,
   * defaults to `["./agent packages", process.cwd()]`. The fifth analyze
   * dimension (preconditions) walks this list and skips silently if no
   * manifest is found.
   */
  preconditionSearchDirs?: string[];
}

/**
 * Default parallelism when no wave config is supplied. Five concurrent
 * deploys is what `deploy --all` does in practice and matches the
 * Dataverse `importSolutionAsync` rate-limit headroom we have observed.
 */
export const DEFAULT_MAX_PARALLEL = 5;

/**
 * Per-tenant Dataverse `importSolutionAsync` median, in minutes. Real
 * deploys land in the 30-90 second range; 1 minute is the median we use
 * as the calibration point. Tighten with history once we collect it.
 */
const PER_TENANT_MINUTES = 1;

/**
 * Build a Phase 1 state resolver against `DEMO_TENANTS[].metadata.preconditionState`.
 *
 *  - If a tenant has no `preconditionState` set, we synthesize a state where
 *    every requirement passes. "We didn't snapshot this tenant" is treated
 *    as "assume good"; this keeps non-demo tenants and tenants that didn't
 *    opt into preflight quiet.
 *  - If a tenant has `preconditionState` defined, we look for a snapshot
 *    matching every key/value in the precondition's `matcher`. Found → real
 *    state. Not found → "missing-resource".
 *
 * Phase 2: replace this whole factory with one that calls Microsoft Graph
 * TCM endpoints. The diff engine and manifest format don't change.
 */
function synthesizeTenantStateResolver(): (
  tenant: TenantConfig,
  precondition: Precondition
) => DemoPreconditionState | "missing-resource" {
  return (tenant, precondition) => {
    const meta = getDemoTenantMetadata(tenant.tenantId);
    const states = meta?.preconditionState;

    if (!states) {
      // No preflight snapshot at all — synthesize a passing state. Each
      // requirement's required value lands at its `property` dot-path.
      const props: Record<string, unknown> = {};
      for (const req of precondition.requirements) {
        setByDotPath(props, req.property, req.value);
      }
      return {
        resourceType: precondition.resourceType,
        resourceMatcher: precondition.matcher,
        resourceDisplayName:
          precondition.matcher.displayName ??
          Object.values(precondition.matcher)[0] ??
          "(synthesized)",
        currentProperties: props,
      };
    }

    // Look for a snapshot whose matcher fields all line up.
    const match = states.find(
      (s) =>
        s.resourceType === precondition.resourceType &&
        Object.entries(precondition.matcher).every(([k, v]) => s.resourceMatcher[k] === v)
    );
    if (!match) return "missing-resource";
    return match;
  };
}

/**
 * Walk into `obj` along a dot-path and assign `value` at the leaf, creating
 * intermediate objects as needed. Used by the synthesized passing-state.
 */
function setByDotPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Internal — return shape for each risk dimension check. `dataAvailable`
 * feeds the coverage component of `calculateConfidence`.
 */
interface DimensionResult {
  issues: RiskIssue[];
  dataAvailable: boolean;
}

/**
 * Extended dimension result for preflight. Same `dataAvailable` semantics,
 * plus the manifest envelope and structured failures so `analyze()` can
 * forward them to the CLI render layer.
 */
interface PreconditionDimensionResult extends DimensionResult {
  manifestFound: boolean;
  manifest?: { solution: string; version: string };
  failures: PreconditionFailure[];
}

/**
 * Map a numeric confidence value to its coarse qualifier bucket.
 * Boundaries: < 70 -> limited, 70..89 -> moderate, >= 90 -> high.
 * Exposed (not just internal) so CLI rendering can render
 * `Risk Score: LOW (limited data)` without re-implementing thresholds.
 */
export function confidenceQualifier(confidence: number): ConfidenceQualifier {
  if (confidence >= 90) return "high";
  if (confidence >= 70) return "moderate";
  return "limited";
}

/**
 * Map a confidence qualifier to the human-readable suffix shown next to
 * the risk score (e.g. `LOW (limited data)`).
 */
export function confidenceQualifierLabel(qualifier: ConfidenceQualifier): string {
  switch (qualifier) {
    case "limited":
      return "limited data";
    case "moderate":
      return "moderate confidence";
    case "high":
      return "high confidence";
  }
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

    // Run all checks in parallel. Each check returns its issues plus a
    // `dataAvailable` flag — used to compute coverage for confidence.
    const [gdap, connections, health, history, preconditions] = await Promise.all([
      this.checkGDAPPermissions(context),
      this.checkConnections(context),
      this.checkTenantHealth(context),
      this.analyzeHistory(context),
      this.checkPreconditions(context),
    ]);

    issues.push(
      ...gdap.issues,
      ...connections.issues,
      ...health.issues,
      ...history.issues,
      ...preconditions.issues
    );

    const coverage = [gdap, connections, health, history, preconditions].filter(
      (r) => r.dataAvailable
    ).length;

    // Calculate risk score
    const riskScore = this.calculateRiskScore(issues);

    // Identify blockers (critical issues)
    const blockers = issues.filter((i) => i.severity === "critical");

    // Generate recommendations
    const recs = this.generateRecommendations(issues, context);
    recommendations.push(...recs);

    // Estimate duration (wave-aware)
    const duration = this.estimateDuration(context, issues);

    // Calculate success probability
    const successProbability = this.calculateSuccessProbability(context, issues);

    // Confidence factors in coverage + per-tenant sample size
    const confidence = this.calculateConfidence(context, coverage);
    const qualifier = confidenceQualifier(confidence);

    // Per-tenant rollup of dimensions. Issues are already attributed via
    // `affectedTenants`; we just project them per-tenant and pick the
    // highest-severity finding as the "top factor".
    const perTenantBreakdown = this.buildPerTenantBreakdown(context, issues);

    // Determine if deployment can proceed
    const canProceed = blockers.length === 0;

    // Determine if approval is required
    const requiresApproval =
      riskScore === "high" || riskScore === "critical" || context.isProduction;

    return {
      score: riskScore,
      confidence,
      confidenceQualifier: qualifier,
      confidence_qualifier: qualifier,
      estimatedDuration: duration,
      successProbability,
      issues,
      recommendations,
      blockers,
      canProceed,
      requiresApproval,
      perTenantBreakdown,
      preconditions: {
        manifestFound: preconditions.manifestFound,
        solution: preconditions.manifest?.solution,
        manifestVersion: preconditions.manifest?.version,
        failures: preconditions.failures,
      },
    };
  }

  /**
   * Check GDAP permissions for all tenants. Returns `dataAvailable=true`
   * when at least one tenant produced a determination — used as a
   * coverage signal for `calculateConfidence`.
   */
  private async checkGDAPPermissions(context: DeploymentContext): Promise<DimensionResult> {
    const issues: RiskIssue[] = [];
    let dataAvailable = false;

    // In demo mode, use tenant metadata for deterministic GDAP scenarios
    if (process.env.DEMO_MODE === "true") {
      // Coverage proxy: any tenant with demo metadata counts as "checked".
      dataAvailable = context.tenants.some((t) => getDemoTenantMetadata(t.id) !== undefined);
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

    // Live GDAP risk checks via Microsoft Graph API are planned for a future release.
    // Currently uses demo metadata and deployment history for risk assessment.

    return { issues, dataAvailable };
  }

  /**
   * Check connection references. Returns `dataAvailable=true` when we had
   * any signal (currently: demo metadata).
   */
  private async checkConnections(context: DeploymentContext): Promise<DimensionResult> {
    const issues: RiskIssue[] = [];
    let dataAvailable = false;

    // In demo mode, use tenant metadata for deterministic connection scenarios
    if (process.env.DEMO_MODE === "true") {
      dataAvailable = context.tenants.some((t) => getDemoTenantMetadata(t.id) !== undefined);
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

    // Live connection reference checks via Dataverse API are planned for a future release.
    // Currently uses demo metadata for connection risk assessment.

    return { issues, dataAvailable };
  }

  /**
   * Check tenant health. `dataAvailable=true` when we had health-relevant
   * input (deployment history with at least one failure-bearing entry, or
   * demo metadata). Note: an empty deploymentHistory still counts as "we
   * looked but found nothing," not "we couldn't check."
   */
  private async checkTenantHealth(context: DeploymentContext): Promise<DimensionResult> {
    const issues: RiskIssue[] = [];
    let dataAvailable = false;

    // Check for recurring failures (same error appearing multiple times)
    if (context.deploymentHistory) {
      dataAvailable = true;
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

    // Demo mode supplies tenant-level health hints via metadata even when
    // no deploymentHistory was provided.
    if (process.env.DEMO_MODE === "true" && !dataAvailable) {
      dataAvailable = context.tenants.some((t) => getDemoTenantMetadata(t.id) !== undefined);
    }

    return { issues, dataAvailable };
  }

  /**
   * Analyze deployment history. `dataAvailable=true` when we had real
   * deploymentHistory entries or demo metadata to draw from.
   */
  private async analyzeHistory(context: DeploymentContext): Promise<DimensionResult> {
    const issues: RiskIssue[] = [];
    let dataAvailable = false;

    // In demo mode, generate history issues from tenant metadata
    if (process.env.DEMO_MODE === "true" && !context.deploymentHistory) {
      dataAvailable = context.tenants.some((t) => getDemoTenantMetadata(t.id) !== undefined);
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

      return { issues, dataAvailable };
    }

    if (!context.deploymentHistory || context.deploymentHistory.length === 0) {
      issues.push({
        severity: "info",
        category: "history",
        message: "No deployment history available",
        resolution: "Consider deploying to test tenant first",
      });
      return { issues, dataAvailable };
    }

    dataAvailable = true;
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

    return { issues, dataAvailable };
  }

  /**
   * Fifth dimension — tenant-config preflight. Loads a sibling YAML
   * `<solution>.preconditions.yaml`, runs it against synthetic per-tenant
   * state (Phase 1), and emits one `RiskIssue` per failed requirement plus a
   * structured `failures[]` payload the CLI can render with deep-link / CLI
   * / manual remediation steps.
   *
   * When no manifest is found we emit a single `info` issue ("preflight
   * skipped") and return — deploy still proceeds.
   *
   * Phase 2 will replace `synthesizeTenantStateResolver` with a real
   * Microsoft Graph TCM client; the manifest format and the diff engine
   * stay the same.
   */
  private async checkPreconditions(
    context: DeploymentContext
  ): Promise<PreconditionDimensionResult> {
    const issues: RiskIssue[] = [];
    const failures: PreconditionFailure[] = [];

    if (!context.solutionFile) {
      return { issues, dataAvailable: false, manifestFound: false, failures };
    }

    const searchDirs = context.preconditionSearchDirs ?? [
      join(process.cwd(), "agent packages"),
      process.cwd(),
    ];

    let manifest;
    try {
      manifest = await loadPreconditionManifest(context.solutionFile, searchDirs);
    } catch (error) {
      // Surface validation errors as a non-blocking warning rather than
      // crashing analyze — the user has a manifest but it's malformed and
      // they need to know why.
      const message =
        error instanceof PreconditionManifestValidationError
          ? error.message
          : `Failed to load precondition manifest: ${error instanceof Error ? error.message : String(error)}`;
      issues.push({
        severity: "warning",
        category: "preconditions",
        message: "Precondition manifest failed to load",
        resolution: "Fix the manifest schema errors above and re-run analyze",
        details: { error: message },
      });
      return { issues, dataAvailable: false, manifestFound: false, failures };
    }

    if (!manifest) {
      // Visible note — preflight skipped because there's no manifest. Not
      // a warning, not blocking; just transparency about coverage.
      issues.push({
        severity: "info",
        category: "preconditions",
        message: "No precondition manifest for this solution; preflight skipped.",
      });
      return { issues, dataAvailable: false, manifestFound: false, failures };
    }

    // Build the Phase 1 state resolver from demo metadata. This is the
    // single seam Phase 2 will replace with a Graph TCM client.
    const resolver = synthesizeTenantStateResolver();

    // The check engine wants TenantConfig[]; map our richer-but-stripped
    // `Tenant` view back. We fall back to a minimal TenantConfig-shaped
    // value so the resolver can read tenantId/name without a deeper lookup.
    const tenantConfigs: TenantConfig[] = context.tenants.map((t) => ({
      name: t.name,
      tenantId: t.id,
      environmentUrl: t.environmentUrl,
      tags: t.tags ?? [],
      enabled: true,
      autoSetup: true,
    }));

    failures.push(...checkPreconditions(manifest, tenantConfigs, resolver));

    // Mirror each failure into a RiskIssue so the existing aggregate score,
    // recommendations, and per-tenant breakdown all see preflight findings.
    for (const failure of failures) {
      issues.push({
        severity: failure.severity === "error" ? "error" : "warning",
        category: "preconditions",
        message: `${failure.description} — ${failure.resourceDisplayName} (${failure.failedProperty})`,
        affectedTenants: [failure.tenantName],
        resolution: failure.remediation.title,
        details: {
          preconditionId: failure.preconditionId,
          resourceType: failure.resourceType,
          resourceDisplayName: failure.resourceDisplayName,
          failedProperty: failure.failedProperty,
          currentValue: failure.currentValue,
          requiredValue: failure.requiredValue,
          comparisonOp: failure.comparisonOp,
          remediation: failure.remediation,
        },
      });
    }

    return {
      issues,
      dataAvailable: true,
      manifestFound: true,
      manifest: { solution: manifest.solution, version: manifest.version },
      failures,
    };
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
   * Calculate confidence in the risk assessment.
   *
   * Two inputs drive confidence:
   *   - **Coverage** — number of dimensions (GDAP / connections / health /
   *     history) that returned data. Each adds 10 points.
   *   - **Sample size** — median per-tenant deploy history count, log-scaled
   *     and capped at 40 points.
   *
   * Formula: `50 + 10 * coverage + min(40, ceil(log2(median_history + 1)) * 10)`.
   * Clamped to [0, 100]. Lands in the 50–95% range for realistic inputs:
   *   - 0 coverage, 0 history     -> 50
   *   - 4 coverage, 0 history     -> 90
   *   - 4 coverage, 5 history     -> 90 + log2(6)*10 ≈ 90, capped to 95 by
   *     the 40-cap fallback (40 + 50 = 90, plus +5 if median ≥ 16).
   *   - 4 coverage, 50+ history   -> 50 + 40 + 40 = 100, clamped to 95.
   */
  private calculateConfidence(context: DeploymentContext, coverageCount: number): number {
    const sampleSize = this.medianSampleSize(context);
    const coveragePoints = 10 * coverageCount;
    // log2(n+1)*10, capped at 40 — diminishing returns past ~16 deploys.
    const samplePoints = Math.min(40, Math.ceil(Math.log2(sampleSize + 1)) * 10);

    const confidence = 50 + coveragePoints + samplePoints;
    // Cap at 95 in non-demo to leave headroom for "perfect" only when we
    // actually have live API data; cap at 95 in demo too — demo is by
    // construction simulated and shouldn't ever brag.
    return Math.max(0, Math.min(95, confidence));
  }

  /**
   * Median per-tenant historical deploy count for the requested solution
   * (best-effort — falls back to overall demo `totalDeploys` or to the
   * supplied `deploymentHistory` length / tenant count).
   */
  private medianSampleSize(context: DeploymentContext): number {
    const counts: number[] = [];

    if (process.env.DEMO_MODE === "true") {
      for (const tenant of context.tenants) {
        const meta = getDemoTenantMetadata(tenant.id);
        if (meta?.deploymentHistory) {
          counts.push(meta.deploymentHistory.totalDeploys);
        } else if (meta) {
          counts.push(0);
        }
      }
    }

    if (context.deploymentHistory && counts.length === 0) {
      // Distribute history entries evenly across tenants as a coarse proxy.
      const perTenant = context.deploymentHistory.length / Math.max(context.tenants.length, 1);
      for (let i = 0; i < context.tenants.length; i++) counts.push(perTenant);
    }

    if (counts.length === 0) return 0;
    const sorted = [...counts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  /**
   * Estimate deployment duration with wave-aware parallelism.
   *
   * Today's deploys are not sequential — `WaveService` runs up to
   * `maxParallel` tenants concurrently per wave. The previous estimate
   * (2 min × N tenants, sequential) overstated duration ~5×.
   *
   * Compute: `Σ_per_wave (ceil(wave.tenants / wave.maxParallel) ×
   * PER_TENANT_MINUTES) + Σ wave.waitAfterCompletion`. When no wave plan
   * is supplied, fall back to a single wave with `DEFAULT_MAX_PARALLEL`.
   */
  private estimateDuration(
    context: DeploymentContext,
    issues: RiskIssue[]
  ): { min: number; max: number } {
    const waves = context.waves?.waves ?? [
      {
        waveNumber: 1,
        name: "Default",
        tenants: context.tenants.map((t) => ({
          name: t.name,
          tenantId: t.id,
          environmentUrl: t.environmentUrl,
          tags: t.tags,
          enabled: true,
        })),
        maxParallel: context.maxParallel ?? DEFAULT_MAX_PARALLEL,
        waitAfterCompletion: undefined,
        continueOnFailure: false,
      },
    ];

    let baseMinutes = 0;
    for (const wave of waves) {
      const parallel = wave.maxParallel ?? wave.tenants.length;
      const batches = Math.ceil(wave.tenants.length / Math.max(parallel, 1));
      baseMinutes += batches * PER_TENANT_MINUTES;
      // waitAfterCompletion is in milliseconds; convert to minutes.
      if (wave.waitAfterCompletion) {
        baseMinutes += wave.waitAfterCompletion / 60_000;
      }
    }

    // Critical/error issues add real overhead (validation, retries). Was 3
    // min each; calibrated down to 2 to match observed retry costs.
    const issueOverhead =
      issues.filter((i) => i.severity === "critical" || i.severity === "error").length * 2;

    // Large solutions take longer to upload and import. Was 10 min flat;
    // calibrated to 5 min for >50 MB to match real Dataverse upload medians.
    const sizeOverhead = context.solutionSize && context.solutionSize > 50_000_000 ? 5 : 0;

    const min = Math.max(1, Math.ceil(baseMinutes + issueOverhead + sizeOverhead));
    const max = Math.ceil(min * 1.5); // 50% buffer for tail latency

    return { min, max };
  }

  /**
   * Build per-tenant rollup. For each tenant, find issues that name them
   * (or that have no `affectedTenants` field — those apply to the whole
   * fleet) and pick the highest-severity one as the top factor.
   */
  private buildPerTenantBreakdown(
    context: DeploymentContext,
    issues: RiskIssue[]
  ): TenantRiskRow[] {
    const SEVERITY_ORDER: Record<RiskSeverity, number> = {
      critical: 4,
      error: 3,
      warning: 2,
      info: 1,
    };

    return context.tenants.map((tenant) => {
      const tenantIssues = issues.filter((issue) => {
        if (!issue.affectedTenants || issue.affectedTenants.length === 0) {
          // Fleet-wide issue — include with reduced weight (info-tier).
          return issue.severity === "info";
        }
        return issue.affectedTenants.includes(tenant.name);
      });

      // Pick the single highest-severity issue as "top factor"
      const top = tenantIssues
        .slice()
        .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])[0];

      const score = this.calculateRiskScore(tenantIssues);

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        score,
        topFactor: top
          ? { severity: top.severity, category: top.category, message: top.message }
          : undefined,
      };
    });
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
