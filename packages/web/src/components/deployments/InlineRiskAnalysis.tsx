'use client'

/**
 * Inline Risk Analysis Component
 * Compact risk analysis display for integration into the deployment form
 */

import { useState, useEffect } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp, ExternalLink, RefreshCw } from 'lucide-react'
import type { RiskAnalysis, RiskIssue } from '@agentsync/core'

interface InlineRiskAnalysisProps {
  analysis: RiskAnalysis | null
  loading?: boolean
  onRefresh?: () => void
}

const SEVERITY_CONFIG = {
  critical: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertCircle,
    label: 'BLOCKER',
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertCircle,
    label: 'ERROR',
  },
  warning: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: AlertTriangle,
    label: 'WARNING',
  },
  info: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Info,
    label: 'INFO',
  },
}

function IssueCard({ issue }: { issue: RiskIssue }) {
  const [showDetails, setShowDetails] = useState(false)
  const config = SEVERITY_CONFIG[issue.severity]
  const Icon = config.icon

  return (
    <div className={`${config.bgColor} ${config.borderColor} border rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`${config.color} h-5 w-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${config.color}`}>
              {config.label}
            </span>
            {issue.category && (
              <span className="text-xs text-gray-500">• {issue.category}</span>
            )}
          </div>
          <p className={`font-medium ${config.color} mb-2`}>{issue.message}</p>

          {issue.affectedTenants && issue.affectedTenants.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-600 mb-1">Affected tenants:</p>
              <div className="flex flex-wrap gap-1">
                {issue.affectedTenants.map((tenant, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-gray-200"
                  >
                    {tenant}
                  </span>
                ))}
              </div>
            </div>
          )}

          {issue.resolution && (
            <div className="bg-white bg-opacity-50 rounded p-2 mb-2">
              <p className="text-xs font-medium text-gray-700 mb-1">💡 How to fix:</p>
              <p className="text-sm text-gray-700">{issue.resolution}</p>
            </div>
          )}

          {issue.link && (
            <a
              href={issue.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              Open in Partner Center
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {issue.details && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="mt-2 text-xs text-gray-600 hover:text-gray-800 flex items-center gap-1"
            >
              {showDetails ? 'Hide' : 'Show'} details
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          {showDetails && issue.details && (
            <pre className="mt-2 p-2 bg-gray-800 text-gray-100 text-xs rounded overflow-x-auto">
              {JSON.stringify(issue.details, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export function InlineRiskAnalysis({ analysis, loading, onRefresh }: InlineRiskAnalysisProps) {
  const [expanded, setExpanded] = useState(true)

  // Auto-expand when blockers are found
  useEffect(() => {
    if (analysis && analysis.blockers && analysis.blockers.length > 0) {
      setExpanded(true)
    }
  }, [analysis])

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          <div>
            <p className="font-medium text-blue-900">Analyzing deployment risk...</p>
            <p className="text-sm text-blue-700">Checking permissions, health, and history</p>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return null
  }

  const blockers = analysis.blockers || []
  const criticalIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'error')
  const warnings = analysis.issues.filter(i => i.severity === 'warning')
  const infos = analysis.issues.filter(i => i.severity === 'info')

  // Determine overall status color
  const statusColor = blockers.length > 0
    ? 'bg-red-50 border-red-300'
    : warnings.length > 0
    ? 'bg-yellow-50 border-yellow-300'
    : 'bg-green-50 border-green-300'

  const statusIcon = blockers.length > 0
    ? AlertCircle
    : warnings.length > 0
    ? AlertTriangle
    : CheckCircle

  const statusIconColor = blockers.length > 0
    ? 'text-red-600'
    : warnings.length > 0
    ? 'text-yellow-600'
    : 'text-green-600'

  const StatusIcon = statusIcon

  return (
    <div className={`${statusColor} border-2 rounded-lg overflow-hidden`}>
      {/* Summary Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
        >
          <StatusIcon className={`${statusIconColor} h-6 w-6 flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">
              {blockers.length > 0 ? (
                <>Deployment Blocked - {blockers.length} issue{blockers.length > 1 ? 's' : ''} must be fixed</>
              ) : warnings.length > 0 ? (
                <>Ready to Deploy - {warnings.length} warning{warnings.length > 1 ? 's' : ''}</>
              ) : (
                <>Ready to Deploy - All checks passed</>
              )}
            </h3>
            <div className="flex items-center gap-3 text-sm text-gray-600 mt-0.5">
              <span>Success probability: {analysis.successProbability}%</span>
              <span>•</span>
              <span>Est. duration: {analysis.estimatedDuration.min}-{analysis.estimatedDuration.max} min</span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRefresh()
              }}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-white hover:bg-opacity-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh analysis"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {blockers.length > 0 && (
            <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded">
              BLOCKED
            </span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 pt-0 space-y-3">
          {/* Blockers */}
          {criticalIssues.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Critical Issues ({criticalIssues.length})
              </h4>
              <div className="space-y-2">
                {criticalIssues.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Warnings ({warnings.length})
              </h4>
              <div className="space-y-2">
                {warnings.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          {infos.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Information ({infos.length})
              </h4>
              <div className="space-y-2">
                {infos.map((issue, idx) => (
                  <IssueCard key={idx} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="bg-white bg-opacity-50 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">💡 Recommendations</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                {analysis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
