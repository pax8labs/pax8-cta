'use client'

import { useState } from 'react'

export interface SolutionDiffData {
  tenant: {
    name: string
    tenantId: string
    environmentUrl: string
  }
  solution: {
    uniqueName: string
    friendlyName: string
    version: string
    publisher: string
  }
  preview: {
    existingSolution?: {
      version: string
      installedOn?: string
    }
    changes: {
      added: Array<{
        type: string
        name: string
        displayName?: string
      }>
      modified: Array<{
        type: string
        name: string
        displayName?: string
        changes?: string[]
      }>
      removed: Array<{
        type: string
        name: string
        displayName?: string
      }>
    }
    warnings?: Array<{
      type: 'breaking_change' | 'dependency' | 'warning'
      message: string
    }>
    isUpdate: boolean
  }
}

interface SolutionDiffPreviewProps {
  solutionPath: string
  tenantId: string
  onConfirm: () => void
  onCancel: () => void
}

export function SolutionDiffPreview({
  solutionPath,
  tenantId,
  onConfirm,
  onCancel,
}: SolutionDiffPreviewProps) {
  const [loading, setLoading] = useState(false)
  const [diffData, setDiffData] = useState<SolutionDiffData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'added' | 'modified' | 'removed'>('added')

  const loadDiff = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/solutions/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solutionPath, tenantId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load diff')
      }

      const data = await res.json()
      setDiffData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load solution diff')
    } finally {
      setLoading(false)
    }
  }

  // Auto-load on mount
  if (!loading && !diffData && !error) {
    loadDiff()
  }

  if (loading) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center py-8">
          <div className="text-gray-500 dark:text-gray-400">Analyzing solution changes...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800">
        <div className="flex items-start gap-3">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-medium text-red-900 dark:text-red-200">Failed to Load Preview</h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={loadDiff}
                className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                Retry
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!diffData) return null

  const { changes, warnings, isUpdate } = diffData.preview
  const totalChanges = changes.added.length + changes.modified.length + changes.removed.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Solution Deployment Preview
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Review changes before deploying to <strong>{diffData.tenant.name}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Confirm & Deploy
            </button>
          </div>
        </div>

        {/* Solution Info */}
        <div className="mt-4 grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Solution</p>
            <p className="font-medium text-gray-900 dark:text-white">{diffData.solution.friendlyName}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              v{diffData.solution.version}
              {isUpdate && diffData.preview.existingSolution && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  (update from v{diffData.preview.existingSolution.version})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Publisher</p>
            <p className="font-medium text-gray-900 dark:text-white">{diffData.solution.publisher}</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
              </p>
              <ul className="mt-2 space-y-1">
                {warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-amber-800 dark:text-amber-300">
                    • {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Changes Summary */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h4 className="font-medium text-gray-900 dark:text-white mb-4">
          Changes ({totalChanges} component{totalChanges !== 1 ? 's' : ''})
        </h4>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('added')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'added'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Added ({changes.added.length})
          </button>
          <button
            onClick={() => setActiveTab('modified')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'modified'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Modified ({changes.modified.length})
          </button>
          <button
            onClick={() => setActiveTab('removed')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'removed'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Removed ({changes.removed.length})
          </button>
        </div>

        {/* Component Lists */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activeTab === 'added' && (
            changes.added.length > 0 ? (
              changes.added.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400">+</span>
                    <div>
                      <p className="text-sm font-medium text-green-900 dark:text-green-200">
                        {item.displayName || item.name}
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-400">
                        {item.type}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
                No components added
              </p>
            )
          )}

          {activeTab === 'modified' && (
            changes.modified.length > 0 ? (
              changes.modified.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400">~</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                        {item.displayName || item.name}
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-400">
                        {item.type}
                      </p>
                      {item.changes && item.changes.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {item.changes.map((change, cIdx) => (
                            <li key={cIdx} className="text-xs text-blue-600 dark:text-blue-400">
                              • {change}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
                No components modified
              </p>
            )
          )}

          {activeTab === 'removed' && (
            changes.removed.length > 0 ? (
              changes.removed.map((item, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                  <div className="flex items-start gap-2">
                    <span className="text-red-600 dark:text-red-400">-</span>
                    <div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-200">
                        {item.displayName || item.name}
                      </p>
                      <p className="text-xs text-red-700 dark:text-red-400">
                        {item.type}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-4 text-center">
                No components removed
              </p>
            )
          )}
        </div>
      </div>
    </div>
  )
}
