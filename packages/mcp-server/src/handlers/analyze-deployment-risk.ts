import { post } from '../lib/api-client.js';
import { validate, AnalyzeDeploymentRiskSchema, AnalyzeDeploymentRiskParams } from '../lib/validation.js';
import { logger } from '../lib/logger.js';

export interface RiskIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'permissions' | 'dependencies' | 'health' | 'timing' | 'history' | 'connections' | 'configuration';
  message: string;
  affectedTenants?: string[];
  resolution?: string;
  link?: string;
  details?: Record<string, unknown>;
}

export interface RiskAnalysis {
  score: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  estimatedDuration: {
    min: number;
    max: number;
  };
  successProbability: number;
  issues: RiskIssue[];
  recommendations: string[];
  blockers: RiskIssue[];
  canProceed: boolean;
  requiresApproval: boolean;
}

export interface AnalyzeDeploymentRiskResponse {
  analysis: RiskAnalysis;
  timestamp: string;
  analyzedTenants: number;
}

/**
 * Analyze deployment risk before executing
 */
export async function handleAnalyzeDeploymentRisk(args: unknown) {
  logger.info('Handling analyze_deployment_risk request', { args });

  // Validate input
  const params = validate(AnalyzeDeploymentRiskSchema, args || {});

  // Build request body
  const requestBody = {
    tenantIds: params.tenantIds,
    solutionFile: `${params.agentId}.zip`, // Basic solution file name
    isProduction: false, // MCP server can't know this, default to false
  };

  // Make API request
  const data = await post<AnalyzeDeploymentRiskResponse>(
    '/api/deployments/analyze',
    requestBody
  );

  logger.info('Risk analysis successful', {
    score: data.analysis.score,
    canProceed: data.analysis.canProceed,
    issueCount: data.analysis.issues.length,
    blockerCount: data.analysis.blockers.length,
  });

  // Format response for AI assistant
  const { analysis } = data;

  let summary = `Risk Analysis for ${params.agentId}\n`;
  summary += `${'='.repeat(50)}\n\n`;
  summary += `Risk Score: ${analysis.score.toUpperCase()}\n`;
  summary += `Success Probability: ${analysis.successProbability}%\n`;
  summary += `Estimated Duration: ${analysis.estimatedDuration.min}-${analysis.estimatedDuration.max} minutes\n`;
  summary += `Can Proceed: ${analysis.canProceed ? 'YES' : 'NO'}\n`;
  summary += `Requires Approval: ${analysis.requiresApproval ? 'YES' : 'NO'}\n\n`;

  if (analysis.blockers.length > 0) {
    summary += `🚫 BLOCKERS (${analysis.blockers.length}):\n`;
    summary += `${'='.repeat(50)}\n`;
    for (const blocker of analysis.blockers) {
      summary += `\n[${blocker.severity.toUpperCase()}] ${blocker.message}\n`;
      if (blocker.affectedTenants && blocker.affectedTenants.length > 0) {
        summary += `  Affected: ${blocker.affectedTenants.join(', ')}\n`;
      }
      if (blocker.resolution) {
        summary += `  💡 Resolution: ${blocker.resolution}\n`;
      }
      if (blocker.link) {
        summary += `  🔗 Link: ${blocker.link}\n`;
      }
    }
    summary += '\n';
  }

  const criticalIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'error');
  if (criticalIssues.length > 0) {
    summary += `⚠️  CRITICAL ISSUES (${criticalIssues.length}):\n`;
    summary += `${'='.repeat(50)}\n`;
    for (const issue of criticalIssues) {
      summary += `\n[${issue.severity.toUpperCase()}] ${issue.message}\n`;
      if (issue.affectedTenants && issue.affectedTenants.length > 0) {
        summary += `  Affected: ${issue.affectedTenants.join(', ')}\n`;
      }
      if (issue.resolution) {
        summary += `  💡 Resolution: ${issue.resolution}\n`;
      }
    }
    summary += '\n';
  }

  const warnings = analysis.issues.filter(i => i.severity === 'warning');
  if (warnings.length > 0) {
    summary += `⚠️  WARNINGS (${warnings.length}):\n`;
    summary += `${'='.repeat(50)}\n`;
    for (const warning of warnings) {
      summary += `\n${warning.message}\n`;
      if (warning.affectedTenants && warning.affectedTenants.length > 0) {
        summary += `  Affected: ${warning.affectedTenants.join(', ')}\n`;
      }
      if (warning.resolution) {
        summary += `  💡 Resolution: ${warning.resolution}\n`;
      }
    }
    summary += '\n';
  }

  if (analysis.recommendations.length > 0) {
    summary += `💡 RECOMMENDATIONS:\n`;
    summary += `${'='.repeat(50)}\n`;
    for (const rec of analysis.recommendations) {
      summary += `• ${rec}\n`;
    }
    summary += '\n';
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: summary,
      },
    ],
  };
}
