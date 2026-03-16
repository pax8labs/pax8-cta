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
 * AI-Powered Deployment Doctor
 *
 * Analyzes deployment failures and provides intelligent remediation guidance.
 * Uses pattern matching + AI to identify root causes and suggest fixes.
 */

export type ErrorCategory =
  | "authentication"
  | "authorization"
  | "network"
  | "timeout"
  | "conflict"
  | "dependency"
  | "configuration"
  | "resource_limit"
  | "validation"
  | "unknown";

export interface ErrorPattern {
  category: ErrorCategory;
  patterns: RegExp[];
  confidence: number; // 0-1
  description: string;
  commonCauses: string[];
  remediationSteps: string[];
  autoFixable: boolean;
  autoFixAction?: "retry" | "retry_with_delay" | "update_config" | "request_admin_action";
}

export interface FailureAnalysis {
  deploymentId: string;
  tenantId: string;
  tenantName: string;
  errorMessage: string;
  category: ErrorCategory;
  confidence: number;
  rootCause: string;
  remediationPlan: {
    priority: "critical" | "high" | "medium" | "low";
    estimatedEffort: "quick" | "moderate" | "complex";
    steps: Array<{
      order: number;
      action: string;
      description: string;
      automated: boolean;
    }>;
    preventionTips?: string[];
  };
  similarFailures?: Array<{
    deploymentId: string;
    tenantName: string;
    resolved: boolean;
    resolution?: string;
  }>;
  autoFixSuggestion?: {
    action: "retry" | "retry_with_delay" | "update_config" | "request_admin_action";
    parameters?: Record<string, any>;
    safetyNote?: string;
  };
}

export interface FleetHealthInsight {
  pattern: string;
  affectedDeployments: number;
  affectedTenants: string[];
  severity: "critical" | "warning" | "info";
  recommendation: string;
  trend?: "increasing" | "stable" | "decreasing";
}

/**
 * Knowledge base of error patterns and remediations
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Authentication errors
  {
    category: "authentication",
    patterns: [
      /invalid_client/i,
      /unauthorized/i,
      /authentication.*failed/i,
      /AADSTS\d+/i,
      /token.*expired/i,
      /invalid.*credentials/i,
    ],
    confidence: 0.95,
    description: "Authentication failure with Azure AD or Dataverse",
    commonCauses: [
      "Service principal credentials expired or invalid",
      "Client secret needs renewal",
      "App registration misconfigured",
      "Token cache issues",
    ],
    remediationSteps: [
      "Verify service principal credentials in Azure Portal",
      "Check if client secret has expired",
      "Ensure app registration has correct API permissions",
      "Clear token cache and retry",
      "Verify GDAP relationship is active",
    ],
    autoFixable: true,
    autoFixAction: "retry",
  },

  // Authorization / Permission errors
  {
    category: "authorization",
    patterns: [
      /insufficient.*privileges/i,
      /access.*denied/i,
      /forbidden/i,
      /privilege.*missing/i,
      /prvWrite/i,
      /prvCreate/i,
      /Missing privilege/i,
    ],
    confidence: 0.98,
    description: "Missing permissions or GDAP role insufficient",
    commonCauses: [
      "GDAP role lacks required Dynamics 365 privileges",
      "User does not have System Administrator role",
      "Power Platform Admin role not assigned",
      "Environment security not configured correctly",
    ],
    remediationSteps: [
      "Go to Partner Center → Customers → select customer",
      'Request "Power Platform Admin" or "Dynamics 365 Admin" role',
      "Wait for customer approval (can take hours/days)",
      "Alternatively: Ask customer to add service principal to environment with System Admin role",
      "Retry deployment after role assignment",
    ],
    autoFixable: false,
    autoFixAction: "request_admin_action",
  },

  // Network errors
  {
    category: "network",
    patterns: [
      /network.*error/i,
      /connection.*refused/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /socket.*hang/i,
      /dns.*lookup.*failed/i,
    ],
    confidence: 0.9,
    description: "Network connectivity issue to tenant environment",
    commonCauses: [
      "Tenant environment temporarily unavailable",
      "Network firewall blocking requests",
      "DNS resolution failure",
      "Dataverse API throttling",
      "ISP or Azure network issue",
    ],
    remediationSteps: [
      "Verify tenant environment URL is correct",
      "Check tenant environment is online (Power Platform Admin Center)",
      "Wait 5-10 minutes and retry (transient issue)",
      "Check firewall rules allow outbound HTTPS to *.dynamics.com",
      "Verify no service outages on Azure Status page",
    ],
    autoFixable: true,
    autoFixAction: "retry_with_delay",
  },

  // Timeout errors
  {
    category: "timeout",
    patterns: [/timeout/i, /timed out/i, /operation.*exceeded.*time/i, /request.*took too long/i],
    confidence: 0.85,
    description: "Operation exceeded time limit",
    commonCauses: [
      "Large solution file taking too long to import",
      "Tenant environment under heavy load",
      "Solution has complex dependencies that slow import",
      "Dataverse import queue backlog",
    ],
    remediationSteps: [
      "Retry during off-peak hours (evenings/weekends)",
      "Check tenant environment performance in admin center",
      "Consider breaking solution into smaller components",
      "Increase timeout limit in deployment configuration",
      "Contact Microsoft support if persistent",
    ],
    autoFixable: true,
    autoFixAction: "retry_with_delay",
  },

  // Conflict errors
  {
    category: "conflict",
    patterns: [
      /already exists/i,
      /duplicate/i,
      /conflict/i,
      /name.*is already in use/i,
      /solution.*already installed/i,
    ],
    confidence: 0.92,
    description: "Resource conflict with existing component",
    commonCauses: [
      "Solution already installed (maybe older version)",
      "Agent with same name exists in environment",
      "Conflicting component from another solution",
      "Previous deployment partially completed",
    ],
    remediationSteps: [
      "Check if solution is already installed in environment",
      "Upgrade existing solution instead of new install",
      "Remove conflicting component manually",
      "Use unique names for agents/components",
      "Perform rollback if previous deployment is incomplete",
    ],
    autoFixable: false,
    autoFixAction: "request_admin_action",
  },

  // Dependency errors
  {
    category: "dependency",
    patterns: [
      /missing.*dependency/i,
      /dependent.*component/i,
      /requires.*connector/i,
      /connection.*reference.*not found/i,
      /environment.*variable.*not found/i,
    ],
    confidence: 0.94,
    description: "Missing dependencies or connection references",
    commonCauses: [
      "Required connectors not installed in tenant",
      "Connection references not mapped correctly",
      "Environment variables not configured",
      "Dependent solution not installed",
    ],
    remediationSteps: [
      "Review solution dependencies in source environment",
      "Install required connectors in target environment",
      "Update tenant configuration with correct connection mappings",
      "Set environment variable values in tenant config",
      "Deploy dependency solutions first, then main solution",
    ],
    autoFixable: false,
    autoFixAction: "update_config",
  },

  // Configuration errors
  {
    category: "configuration",
    patterns: [
      /invalid.*configuration/i,
      /malformed/i,
      /invalid.*format/i,
      /validation.*failed/i,
      /invalid.*parameter/i,
    ],
    confidence: 0.88,
    description: "Invalid configuration or malformed request",
    commonCauses: [
      "Tenant configuration has incorrect format",
      "Environment URL is malformed",
      "Connection mapping schema invalid",
      "Solution file corrupted",
    ],
    remediationSteps: [
      "Validate tenant configuration YAML syntax",
      "Check environment URL format (https://org.crm.dynamics.com)",
      "Verify connection mappings follow correct schema",
      "Re-export solution from source environment",
      "Run configuration validation before deployment",
    ],
    autoFixable: false,
    autoFixAction: "update_config",
  },

  // Resource limits
  {
    category: "resource_limit",
    patterns: [
      /quota.*exceeded/i,
      /too many requests/i,
      /rate.*limit/i,
      /throttle/i,
      /storage.*limit/i,
    ],
    confidence: 0.9,
    description: "Resource quota or rate limit exceeded",
    commonCauses: [
      "API rate limit exceeded (too many requests)",
      "Tenant storage quota full",
      "Concurrent deployment limit reached",
      "Power Platform API throttling",
    ],
    remediationSteps: [
      "Reduce deployment concurrency (deploy to fewer tenants at once)",
      "Add delays between deployments",
      "Check tenant storage usage and clean up",
      "Upgrade tenant license for higher limits",
      "Retry after rate limit reset (usually 5-15 minutes)",
    ],
    autoFixable: true,
    autoFixAction: "retry_with_delay",
  },
];

/**
 * Deployment Doctor Service
 */
export class DeploymentDoctor {
  /**
   * Categorize an error message
   */
  categorizeError(errorMessage: string): {
    category: ErrorCategory;
    confidence: number;
    matchedPattern?: ErrorPattern;
  } {
    let bestMatch: ErrorPattern | undefined;
    let bestConfidence = 0;

    for (const pattern of ERROR_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(errorMessage)) {
          if (pattern.confidence > bestConfidence) {
            bestMatch = pattern;
            bestConfidence = pattern.confidence;
          }
        }
      }
    }

    if (bestMatch) {
      return {
        category: bestMatch.category,
        confidence: bestConfidence,
        matchedPattern: bestMatch,
      };
    }

    return {
      category: "unknown",
      confidence: 0.3,
    };
  }

  /**
   * Analyze a single deployment failure
   */
  analyzeFailure(
    deploymentId: string,
    tenantId: string,
    tenantName: string,
    errorMessage: string,
    deploymentHistory?: Array<{
      deploymentId: string;
      tenantName: string;
      error?: string;
      resolved?: boolean;
    }>
  ): FailureAnalysis {
    const { category, confidence, matchedPattern } = this.categorizeError(errorMessage);

    // Find similar failures
    const similarFailures = deploymentHistory
      ?.filter((d) => d.error && this.categorizeError(d.error).category === category)
      .slice(0, 5)
      .map((d) => ({
        deploymentId: d.deploymentId,
        tenantName: d.tenantName,
        resolved: d.resolved || false,
      }));

    // Determine priority based on category
    const priorityMap: Record<ErrorCategory, "critical" | "high" | "medium" | "low"> = {
      authentication: "critical",
      authorization: "critical",
      network: "high",
      timeout: "medium",
      conflict: "high",
      dependency: "high",
      configuration: "high",
      resource_limit: "medium",
      validation: "medium",
      unknown: "medium",
    };

    // Determine effort
    const effortMap: Record<ErrorCategory, "quick" | "moderate" | "complex"> = {
      authentication: "quick",
      authorization: "complex",
      network: "quick",
      timeout: "quick",
      conflict: "moderate",
      dependency: "moderate",
      configuration: "moderate",
      resource_limit: "moderate",
      validation: "moderate",
      unknown: "complex",
    };

    // Build remediation steps
    const steps = matchedPattern
      ? matchedPattern.remediationSteps.map((step, i) => ({
          order: i + 1,
          action: this.generateActionTitle(step),
          description: step,
          automated: i === 0 && matchedPattern.autoFixable,
        }))
      : [
          {
            order: 1,
            action: "Investigate Error",
            description: "Review the full error message and deployment logs",
            automated: false,
          },
          {
            order: 2,
            action: "Check Environment Health",
            description: "Verify tenant environment is accessible and healthy",
            automated: false,
          },
          {
            order: 3,
            action: "Contact Support",
            description: "If issue persists, contact Microsoft support with deployment details",
            automated: false,
          },
        ];

    // Build auto-fix suggestion
    let autoFixSuggestion;
    if (matchedPattern?.autoFixable && matchedPattern.autoFixAction) {
      autoFixSuggestion = {
        action: matchedPattern.autoFixAction,
        parameters:
          matchedPattern.autoFixAction === "retry_with_delay" ? { delayMs: 300000 } : undefined,
        safetyNote:
          matchedPattern.autoFixAction === "retry"
            ? "Safe to retry immediately - no configuration changes needed"
            : "Will wait 5 minutes before retrying to allow transient issues to resolve",
      };
    }

    return {
      deploymentId,
      tenantId,
      tenantName,
      errorMessage,
      category,
      confidence,
      rootCause: matchedPattern?.description || "Unknown error - requires manual investigation",
      remediationPlan: {
        priority: priorityMap[category],
        estimatedEffort: effortMap[category],
        steps,
        preventionTips: matchedPattern?.commonCauses
          ? [`Common causes: ${matchedPattern.commonCauses.join(", ")}`]
          : undefined,
      },
      similarFailures,
      autoFixSuggestion,
    };
  }

  /**
   * Analyze multiple failures to identify fleet-wide patterns
   */
  analyzeFleetPatterns(
    failures: Array<{
      deploymentId: string;
      tenantId: string;
      tenantName: string;
      error: string;
      timestamp: string;
    }>
  ): FleetHealthInsight[] {
    const insights: FleetHealthInsight[] = [];

    // Group by error category
    const categoryGroups = new Map<ErrorCategory, typeof failures>();
    for (const failure of failures) {
      const { category } = this.categorizeError(failure.error);
      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category)!.push(failure);
    }

    // Generate insights for significant patterns
    for (const [category, categoryFailures] of categoryGroups.entries()) {
      if (categoryFailures.length >= 3) {
        // Pattern detected
        const affectedTenants = [...new Set(categoryFailures.map((f) => f.tenantName))];

        let severity: "critical" | "warning" | "info" = "warning";
        let recommendation = "";

        switch (category) {
          case "authentication":
            severity = "critical";
            recommendation =
              "Multiple authentication failures detected. Check service principal credentials and GDAP status immediately.";
            break;
          case "authorization":
            severity = "critical";
            recommendation = `${affectedTenants.length} tenant${
              affectedTenants.length > 1 ? "s need" : " needs"
            } additional GDAP permissions. Request Power Platform Admin role in Partner Center.`;
            break;
          case "network":
            severity = "warning";
            recommendation =
              "Network issues detected across multiple tenants. Check Azure service health and consider retrying later.";
            break;
          case "dependency":
            severity = "warning";
            recommendation =
              "Missing dependencies are a common issue. Review and update tenant connection mappings before next deployment.";
            break;
          case "timeout":
            severity = "info";
            recommendation =
              "Timeout issues detected. Consider deploying during off-peak hours or increasing timeout limits.";
            break;
          default:
            recommendation = `${category} errors affecting multiple tenants. Review individual failures for details.`;
        }

        insights.push({
          pattern: `${category} failures`,
          affectedDeployments: categoryFailures.length,
          affectedTenants,
          severity,
          recommendation,
        });
      }
    }

    // Check for tenant-specific patterns
    const tenantFailureCounts = new Map<string, number>();
    for (const failure of failures) {
      tenantFailureCounts.set(
        failure.tenantId,
        (tenantFailureCounts.get(failure.tenantId) || 0) + 1
      );
    }

    for (const [tenantId, count] of tenantFailureCounts.entries()) {
      if (count >= 3) {
        const tenant = failures.find((f) => f.tenantId === tenantId)?.tenantName;
        insights.push({
          pattern: "repeated failures for single tenant",
          affectedDeployments: count,
          affectedTenants: [tenant || tenantId],
          severity: "critical",
          recommendation: `Tenant '${
            tenant || tenantId
          }' has ${count} consecutive failures. Environment may have persistent issues - investigate tenant health before retrying.`,
        });
      }
    }

    return insights.sort((a, b) => {
      // Sort by severity
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Generate a concise action title from a remediation step
   */
  private generateActionTitle(step: string): string {
    // Extract the first few words as the action title
    const words = step.split(" ").slice(0, 4);
    return words.join(" ") + (step.split(" ").length > 4 ? "..." : "");
  }
}

/**
 * Singleton instance
 */
let doctorInstance: DeploymentDoctor | undefined;

export function getDeploymentDoctor(): DeploymentDoctor {
  if (!doctorInstance) {
    doctorInstance = new DeploymentDoctor();
  }
  return doctorInstance;
}
