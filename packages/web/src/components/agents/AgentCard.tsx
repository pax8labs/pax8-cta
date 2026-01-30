'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import type { Agent, AgentStatus } from '@/types/agent'

interface AgentCardProps {
  agent: Agent
  isSelected: boolean
  isExpanded: boolean
  onSelect: (agent: Agent | null) => void
  onToggleExpand: () => void
  onDeploy: (agent: Agent) => void
  onShowDeployments: () => void
  onRefresh: () => void
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const AgentCard = React.memo(function AgentCard({
  agent,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onDeploy,
  onShowDeployments,
  onRefresh,
}: AgentCardProps) {
  // Tag editing state
  const [editingTags, setEditingTags] = useState(false)
  const [editTagsInput, setEditTagsInput] = useState('')
  const [savingTags, setSavingTags] = useState(false)

  // Status change state
  const [showStatusConfirm, setShowStatusConfirm] = useState<AgentStatus | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)

  const stats = getAgentStats(agent)
  const status = agent.status || 'active'

  const handleStartEditTags = () => {
    setEditingTags(true)
    setEditTagsInput((agent.tags || []).join(', '))
  }

  const handleSaveTags = async () => {
    setSavingTags(true)
    try {
      const tags = editTagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const response = await fetch(`/api/agents/${agent.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (!response.ok) throw new Error('Failed to save tags')
      toast.success('Tags updated')
      onRefresh()
      setEditingTags(false)
    } catch (err) {
      console.error(err)
      toast.error('Failed to save tags')
    } finally {
      setSavingTags(false)
    }
  }

  const handleChangeStatus = async (newStatus: AgentStatus) => {
    setChangingStatus(true)
    try {
      const response = await fetch(`/api/agents/${agent.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update agent status')
      }
      const statusLabels: Record<AgentStatus, string> = {
        active: 'activated',
        deprecated: 'deprecated',
        archived: 'archived',
      }
      toast.success(`Agent ${statusLabels[newStatus]}`)
      onRefresh()
      setShowStatusConfirm(null)
      if (isSelected) {
        onSelect(null)
      }
    } catch (err) {
      console.error('Change status error:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update agent status')
    } finally {
      setChangingStatus(false)
    }
  }

  return (
    <div
      className={`bg-white border rounded-lg overflow-hidden transition-colors ${
        isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200'
      }`}
    >
      {/* Main row */}
      <div
        className="p-4 hover:bg-slate-50 cursor-pointer"
        onClick={() => onSelect(isSelected ? null : agent)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand()
                }}
                className="text-slate-400 hover:text-slate-600 transition-transform"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? `Collapse ${agent.friendlyName} details` : `Expand ${agent.friendlyName} details`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <h3 className="font-medium text-slate-900">{agent.friendlyName}</h3>
              <span className="text-xs text-slate-400 tabular-nums">v{agent.version}</span>
              {agent.isCustom && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">custom</span>}
              {status === 'deprecated' && (
                <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">deprecated</span>
              )}
              {status === 'archived' && (
                <span className="text-xs text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">archived</span>
              )}
              {agent.category && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{agent.category}</span>}
            </div>
            {agent.description && (
              <p className="text-sm text-slate-600 mb-2 ml-6">{agent.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-slate-400 ml-6">
              <span className="font-mono">{agent.uniqueName}</span>
              {agent.publisherName && <span>by {agent.publisherName}</span>}
              {agent.sizeKb && <span>{agent.sizeKb} KB</span>}
              {agent.lastPublished && <span suppressHydrationWarning>published {formatRelativeTime(new Date(agent.lastPublished))}</span>}
            </div>
            {/* Tags and capabilities row */}
            <div className="flex items-center gap-2 mt-2 ml-6 flex-wrap">
              {agent.tags && agent.tags.length > 0 && agent.tags.map(tag => (
                <span key={tag} className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{tag}</span>
              ))}
              {agent.capabilities && agent.capabilities.length > 0 && agent.capabilities.map(cap => (
                <span key={cap} className="text-xs text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{cap}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="flex items-center gap-3">
              {agent.totalDeployments > 0 ? (
                <>
                  <span className="text-slate-600 tabular-nums">{agent.totalDeployments} tenants</span>
                  {stats.health !== null && (
                    <span className={`tabular-nums ${stats.health >= 90 ? 'text-emerald-600' : stats.health >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {stats.health}%
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Not deployed</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {agent.totalDeployments > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onShowDeployments()
                  }}
                  className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                >
                  tenants
                </button>
              )}
              {status === 'active' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeploy(agent)
                  }}
                  className="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded font-medium"
                >
                  Deploy
                </button>
              ) : (
                <span className="px-3 py-1 text-xs text-slate-400 bg-slate-100 rounded">
                  {status === 'deprecated' ? 'Deprecated' : 'Archived'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {/* Tags section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-slate-700">Tags</h4>
                {!editingTags && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartEditTags() }}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingTags ? (
                <div className="space-y-2">
                  {agent.tags && agent.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pb-1 border-b border-slate-200">
                      <span className="text-xs text-slate-500">Current:</span>
                      {agent.tags.map(tag => (
                        <span key={tag} className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                  <input
                    type="text"
                    value={editTagsInput}
                    onChange={(e) => setEditTagsInput(e.target.value)}
                    placeholder="tag1, tag2, tag3"
                    className="w-full px-2 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  <p className="text-xs text-slate-400">Separate tags with commas</p>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSaveTags() }}
                      disabled={savingTags}
                      className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingTags ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTags(false) }}
                      className="px-2 py-0.5 text-xs text-slate-600 hover:text-slate-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {agent.tags && agent.tags.length > 0 ? (
                    agent.tags.map(tag => (
                      <span key={tag} className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">{tag}</span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No tags</span>
                  )}
                </div>
              )}
            </div>

            {/* Dependencies section */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Dependencies</h4>
              {agent.dependencies && agent.dependencies.length > 0 ? (
                <ul className="space-y-1">
                  {agent.dependencies.map(dep => (
                    <li key={dep} className="text-xs text-slate-600 flex items-center gap-1">
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      {dep}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-slate-400">No dependencies</span>
              )}
            </div>

            {/* Connection References section */}
            <div>
              <h4 className="font-medium text-slate-700 mb-2">Connection References</h4>
              {agent.connectionReferences && agent.connectionReferences.length > 0 ? (
                <ul className="space-y-1">
                  {agent.connectionReferences.map(ref => (
                    <li key={ref.name} className="text-xs text-slate-600 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${ref.required ? 'bg-amber-500' : 'bg-slate-300'}`}></span>
                      {ref.name}
                      {ref.required && <span className="text-amber-600">(required)</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-slate-400">No connections required</span>
              )}
            </div>
          </div>

          {/* Environment Variables (if any) */}
          {agent.environmentVariables && agent.environmentVariables.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-700 mb-2 text-sm">Environment Variables</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {agent.environmentVariables.map(envVar => (
                  <div key={envVar.name} className="text-xs bg-white border border-slate-200 rounded p-2">
                    <div className="font-mono text-slate-700">{envVar.name}</div>
                    <div className="text-slate-400 mt-0.5">
                      {envVar.type}
                      {envVar.required && <span className="text-amber-600 ml-1">• required</span>}
                    </div>
                    {envVar.defaultValue && (
                      <div className="text-slate-500 mt-0.5">default: {envVar.defaultValue}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Changelog (if any) */}
          {agent.changelog && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h4 className="font-medium text-slate-700 mb-2 text-sm">Changelog</h4>
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{agent.changelog}</p>
            </div>
          )}

          {/* Agent lifecycle actions */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            {showStatusConfirm !== null ? (
              <div className="space-y-2">
                {showStatusConfirm === 'archived' && agent.totalDeployments > 0 && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    <strong>Note:</strong> This agent is deployed to {agent.totalDeployments} tenant{agent.totalDeployments !== 1 ? 's' : ''}.
                    Archiving will automatically uninstall it from all tenants.
                  </div>
                )}
                {showStatusConfirm === 'deprecated' && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                    Deprecating will prevent new deployments but keep existing installations.
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-700">
                    {showStatusConfirm === 'archived' && 'Archive this agent?'}
                    {showStatusConfirm === 'deprecated' && 'Deprecate this agent?'}
                    {showStatusConfirm === 'active' && 'Restore this agent?'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleChangeStatus(showStatusConfirm) }}
                    disabled={changingStatus}
                    className={`px-3 py-1 text-xs text-white rounded disabled:opacity-50 ${
                      showStatusConfirm === 'archived' ? 'bg-slate-600 hover:bg-slate-700' :
                      showStatusConfirm === 'deprecated' ? 'bg-amber-600 hover:bg-amber-700' :
                      'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {changingStatus ? 'Updating...' : 'Confirm'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowStatusConfirm(null) }}
                    className="px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {status === 'active' && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowStatusConfirm('deprecated') }}
                      className="text-xs text-amber-600 hover:text-amber-700"
                    >
                      Deprecate
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowStatusConfirm('archived') }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Archive
                    </button>
                  </>
                )}
                {status === 'deprecated' && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowStatusConfirm('active') }}
                      className="text-xs text-emerald-600 hover:text-emerald-700"
                    >
                      Restore to Active
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowStatusConfirm('archived') }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      Archive
                    </button>
                  </>
                )}
                {status === 'archived' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowStatusConfirm('active') }}
                    className="text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    Restore to Active
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

function getAgentStats(agent: Agent) {
  const tenants = agent.deployedTenants || []
  const active = tenants.filter(t => t.status === 'active').length
  const failed = tenants.filter(t => t.status === 'failed').length
  const health = tenants.length > 0 ? Math.round((active / tenants.length) * 100) : null
  const lastDeploy = tenants.length > 0
    ? new Date(Math.max(...tenants.map(t => new Date(t.deployedAt).getTime())))
    : null
  return { active, failed, health, lastDeploy }
}
