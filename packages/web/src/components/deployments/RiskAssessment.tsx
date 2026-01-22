'use client'

/**
 * Deployment Risk Assessment Component
 * Displays risk analysis results with color-coded severity
 */

import { AlertCircle, AlertTriangle, CheckCircle, Info, Clock, TrendingUp } from 'lucide-react'
import type { RiskAnalysis, RiskIssue } from '@agentsync/core'

interface RiskAssessmentProps {
  analysis: RiskAnalysis
  onProceed?: () => void
  onCancel?: () => void
  onFixIssues?: () => void
  loading?: boolean
}

const SCORE_CONFIG = {
  critical: {
    color: 'bg-red-100 border-red-500 text-red-900',
    icon: AlertCircle,
    iconColor: 'text-red-600',
    label: 'CRITICAL RISK',
  },
  high: {
    color: 'bg-orange-100 border-orange-500 text-orange-900',
    icon: AlertTriangle,
    iconColor: 'text-orange-600',
    label: 'HIGH RISK',
  },
  medium: {
    color: 'bg-yellow-100 border-yellow-500 text-yellow-900',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    label: 'MEDIUM RISK',
  },
  low: {
    color: 'bg-green-100 border-green-500 text-green-900',
    icon: CheckCircle,
    iconColor: 'text-green-600',
    label: 'LOW RISK',
  },
}

const SEVERITY_CONFIG = {
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: AlertCircle,
    label: '🔴 BLOCKER',
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: AlertCircle,
    label: '🔴 ERROR',
  },
  warning: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    icon: AlertTriangle,
    label: '🟡 WARNING',
  },
  info: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    icon: Info,
    label: 'ℹ️ INFO',
  },
}

export function RiskAssessment({
  analysis,
  onProceed,
  onCancel,
  onFixIssues,
  loading = false,
}: RiskAssessmentProps) {
  const config = SCORE_CONFIG[analysis.score]
  const Icon = config.icon

  const criticalIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'error')
  const warnings = analysis.issues.filter(i => i.severity === 'warning')
  const infos = analysis.issues.filter(i => i.severity === 'info')

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className={`border-l-4 ${config.color} p-6`}>
        <div className="flex items-start gap-4">
          <Icon className={`${config.iconColor} h-8 w-8 flex-shrink-0`} />
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{config.label}</h2>
            <div className="flex items-center gap-4 text-sm">
              <span>Confidence: {analysis.confidence}%</span>
              <span>•</span>
              <span>Success Probability: {analysis.successProbability}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 p-6 border-b">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{analysis.estimatedDuration.min}-{analysis.estimatedDuration.max}</div>
          <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
            <Clock className="h-4 w-4" />
            Minutes
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{analysis.successProbability}%</div>
          <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
            <TrendingUp className="h-4 w-4" />
            Success Rate
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{analysis.issues.length}</div>
          <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
            <AlertCircle className="h-4 w-4" />
            Issues Found
          </div>
        </div>
      </div>

      {/* Issues */}
      {analysis.issues.length > 0 && (
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {criticalIssues.length > 0 && `⚠️ ${criticalIssues.length} issue${criticalIssues.length > 1 ? 's' : ''} found`}
            {criticalIssues.length === 0 && warnings.length > 0 && `⚠️ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`}
            {criticalIssues.length === 0 && warnings.length === 0 && '✅ All checks passed'}
          </h3>

          {/* Critical/Error Issues */}
          {criticalIssues.length > 0 && (
            <div className="space-y-3">
              {criticalIssues.map((issue, idx) => (
                <IssueCard key={idx} issue={issue} />
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-3">
              {warnings.map((issue, idx) => (
                <IssueCard key={idx} issue={issue} />
              ))}
            </div>
          )}

          {/* Info */}
          {infos.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                Show {infos.length} informational message{infos.length > 1 ? 's' : ''}
              </summary>
              <div className="mt-2 space-y-2">
                {infos.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="p-6 bg-blue-50 border-t">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">💡 Recommendations</h3>
          <ul className="space-y-2">
            {analysis.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-blue-600 font-bold mt-0.5">•</span>
                <span className="text-gray-800">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}

        {onFixIssues && analysis.blockers.length > 0 && (
          <button
            onClick={onFixIssues}
            disabled={loading}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Fix Issues
          </button>
        )}

        {onProceed && (
          <button
            onClick={onProceed}
            disabled={loading || !analysis.canProceed}
            className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
              analysis.canProceed
                ? analysis.score === 'low'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-red-600 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Analyzing...
              </span>
            ) : !analysis.canProceed ? (
              '❌ Cannot Deploy'
            ) : analysis.score === 'critical' || analysis.score === 'high' ? (
              '⚠️ Deploy Anyway'
            ) : (
              '✅ Proceed with Deployment'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: RiskIssue }) {
  const config = SEVERITY_CONFIG[issue.severity]
  const Icon = config.icon

  return (
    <div className={`${config.bgColor} border-l-4 border-${issue.severity === 'critical' || issue.severity === 'error' ? 'red' : issue.severity === 'warning' ? 'yellow' : 'blue'}-500 p-4 rounded`}>
      <div className="flex items-start gap-3">
        <Icon className={`${config.color} h-5 w-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              {config.label} • {issue.category}
            </span>
          </div>
          <p className="font-medium text-gray-900 mb-2">{issue.message}</p>

          {issue.affectedTenants && issue.affectedTenants.length > 0 && (
            <div className="mb-2">
              <span className="text-sm text-gray-600">Affected tenants:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {issue.affectedTenants.slice(0, 5).map((tenant, idx) => (
                  <span key={idx} className="text-xs bg-white px-2 py-1 rounded border">
                    {tenant}
                  </span>
                ))}
                {issue.affectedTenants.length > 5 && (
                  <span className="text-xs bg-white px-2 py-1 rounded border">
                    +{issue.affectedTenants.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {issue.resolution && (
            <div className="mt-2 p-2 bg-white rounded border">
              <span className="text-sm font-medium text-gray-700">💡 How to fix:</span>
              <p className="text-sm text-gray-600 mt-1">{issue.resolution}</p>
              {issue.link && (
                <a
                  href={issue.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                >
                  → Open in Partner Center
                </a>
              )}
            </div>
          )}

          {issue.details && Object.keys(issue.details).length > 0 && (
            <details className="mt-2">
              <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                Show details
              </summary>
              <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto">
                {JSON.stringify(issue.details, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
