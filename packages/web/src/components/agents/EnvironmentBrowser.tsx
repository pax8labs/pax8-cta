'use client'

import { FlaskSpinner } from '@/components/ui/flask-spinner'
import type { Environment, SourceSolution } from '@/types/agent'

interface EnvironmentBrowserProps {
  environments: Environment[]
  loadingEnvironments: boolean
  selectedEnvironment: string | null
  onEnvironmentChange: (url: string) => void
  solutions: SourceSolution[]
  loadingSolutions: boolean
  showAgentsOnly: boolean
  onShowAgentsOnlyChange: (checked: boolean) => void
  importingId: string | null
  onImport: (solution: SourceSolution) => void
  onPreview: (solution: SourceSolution) => void
}

export function EnvironmentBrowser({
  environments,
  loadingEnvironments,
  selectedEnvironment,
  onEnvironmentChange,
  solutions,
  loadingSolutions,
  showAgentsOnly,
  onShowAgentsOnlyChange,
  importingId,
  onImport,
  onPreview,
}: EnvironmentBrowserProps) {
  if (loadingEnvironments) {
    return (
      <div className="py-8">
        <FlaskSpinner size="sm" message="Loading environments..." />
      </div>
    )
  }

  if (environments.length === 0) {
    return (
      <div className="py-8 text-center">
        <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-slate-600 mb-2">No Power Platform connection configured</p>
        <p className="text-xs text-slate-400 mb-4">
          Configure your Azure AD credentials in Settings to browse Power Platform environments.
        </p>
        <a href="/settings" className="text-sm text-blue-600 hover:text-blue-700">
          Go to Settings →
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Environment selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Environment:</label>
        <select
          value={selectedEnvironment || ''}
          onChange={(e) => onEnvironmentChange(e.target.value)}
          className="flex-1 text-sm border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {environments.map((env) => (
            <option key={env.id} value={env.environmentUrl}>
              {env.displayName} ({env.type})
            </option>
          ))}
        </select>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAgentsOnly}
            onChange={(e) => onShowAgentsOnlyChange(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Show Copilot agents only
        </label>
        <span className="text-xs text-slate-400">
          {solutions.length} solution{solutions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Solutions list */}
      {loadingSolutions ? (
        <div className="py-4">
          <FlaskSpinner size="sm" message="Loading solutions..." />
        </div>
      ) : solutions.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">
          {showAgentsOnly ? 'No Copilot agents found in this environment' : 'No exportable solutions found'}
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto space-y-2">
          {solutions.map((solution) => (
            <SolutionCard
              key={solution.uniqueName}
              solution={solution}
              importing={importingId === solution.uniqueName}
              onImport={() => onImport(solution)}
              onPreview={() => onPreview(solution)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SolutionCardProps {
  solution: SourceSolution
  importing: boolean
  onImport: () => void
  onPreview: () => void
}

function SolutionCard({ solution, importing, onImport, onPreview }: SolutionCardProps) {
  // Type assertion for extended solution properties from API
  const extendedSolution = solution as SourceSolution & {
    displayName?: string
    publisher?: string
    hasBot?: boolean
    botInfo?: {
      botName?: string
    }
  }

  return (
    <div
      className="p-3 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors cursor-pointer"
      onClick={onPreview}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-slate-900">{extendedSolution.displayName || solution.name}</h4>
            {extendedSolution.hasBot && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Agent</span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono">{solution.uniqueName}</p>
          {solution.description && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-1">{solution.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
            <span>v{solution.version}</span>
            <span>•</span>
            <span>{extendedSolution.publisher || solution.publisherId}</span>
            {extendedSolution.botInfo?.botName && (
              <>
                <span>•</span>
                <span className="text-blue-600">{extendedSolution.botInfo.botName}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPreview()
            }}
            className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
          >
            Preview
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onImport()
            }}
            disabled={importing}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
          >
            {importing ? (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                ...
              </span>
            ) : (
              'Import'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
