'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface DeployedTenant {
  tenantId: string
  tenantName: string
  version: string
  deployedAt: string
  status: 'active' | 'failed' | 'updating'
}

interface ConnectionReference {
  name: string
  connectorId: string
  required: boolean
}

interface EnvironmentVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'secret'
  required: boolean
  defaultValue?: string
}

type AgentStatus = 'active' | 'deprecated' | 'archived'

interface Agent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
  isCustom?: boolean
  status: AgentStatus
  description?: string
  publisherName?: string
  category?: string
  capabilities?: string[]
  tags?: string[]
  deployedTenants: DeployedTenant[]
  totalDeployments: number
  // Extended details
  dependencies?: string[]
  connectionReferences?: ConnectionReference[]
  environmentVariables?: EnvironmentVariable[]
  lastPublished?: string
  sizeKb?: number
  changelog?: string
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

export default function SolutionsPage() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR('/api/agents', fetcher)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [showDeployments, setShowDeployments] = useState(false)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)
  const [editingTagsAgentId, setEditingTagsAgentId] = useState<string | null>(null)
  const [editTagsInput, setEditTagsInput] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [changingStatusAgentId, setChangingStatusAgentId] = useState<string | null>(null)
  const [showStatusConfirm, setShowStatusConfirm] = useState<{ agentId: string; newStatus: AgentStatus } | null>(null)
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active')
  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadedMetadata, setUploadedMetadata] = useState<{
    uniqueName: string;
    friendlyName: string;
    version: string;
    publisherName: string;
    isManaged: boolean;
    description?: string;
    connectionReferences?: { name: string; connectorId: string; displayName?: string }[];
    knowledgeSources?: string[];
    tenantSpecificValues?: { type: string; value: string; location: string; description?: string }[];
  } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Filter agents by search and view mode
  const filteredAgents = useMemo(() => {
    const agents: Agent[] = data?.agents || []
    // First filter by view mode (active/deprecated vs archived)
    const byStatus = agents.filter(agent => {
      const status = agent.status || 'active'
      if (viewMode === 'archived') return status === 'archived'
      return status !== 'archived' // active view shows both active and deprecated
    })
    // Then filter by search
    if (!searchQuery) return byStatus
    const query = searchQuery.toLowerCase()
    return byStatus.filter(agent =>
      agent.friendlyName.toLowerCase().includes(query) ||
      agent.uniqueName.toLowerCase().includes(query) ||
      agent.description?.toLowerCase().includes(query) ||
      agent.category?.toLowerCase().includes(query) ||
      agent.publisherName?.toLowerCase().includes(query)
    )
  }, [data?.agents, searchQuery, viewMode])

  // Count archived agents for the tab badge
  const archivedCount = useMemo(() => {
    const agents: Agent[] = data?.agents || []
    return agents.filter(a => (a.status || 'active') === 'archived').length
  }, [data?.agents])

  const handleDeploy = (agent: Agent) => {
    router.push(`/deployments/new?agent=${agent.id}`)
  }

  // Handle file selection (from input or drag-drop)
  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setUploadError('Please select a .zip file exported from Copilot Studio')
      return
    }

    setSelectedFile(file)
    setUploadError(null)
    setUploadingFile(true)
    setUploadedMetadata(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Upload and parse the solution to preview metadata
      const response = await fetch('/api/solutions/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to parse solution')

      setUploadedMetadata(result.metadata)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to process solution file')
      setSelectedFile(null)
    } finally {
      setUploadingFile(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleConfirmUpload = () => {
    // The upload already happened during preview - just close modal and refresh
    setShowAddAgent(false)
    setSelectedFile(null)
    setUploadedMetadata(null)
    mutate()
  }

  const handleCancelUpload = () => {
    setSelectedFile(null)
    setUploadedMetadata(null)
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle tag editing
  const handleStartEditTags = (agent: Agent) => {
    setEditingTagsAgentId(agent.id)
    setEditTagsInput((agent.tags || []).join(', '))
  }

  const handleSaveTags = async (agentId: string) => {
    setSavingTags(true)
    try {
      const tags = editTagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const response = await fetch(`/api/agents/${agentId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (!response.ok) throw new Error('Failed to save tags')
      mutate()
      setEditingTagsAgentId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingTags(false)
    }
  }

  const handleChangeStatus = async (agentId: string, newStatus: AgentStatus) => {
    setChangingStatusAgentId(agentId)
    try {
      const response = await fetch(`/api/agents/${agentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update agent status')
      }
      mutate()
      setShowStatusConfirm(null)
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null)
      }
    } catch (err) {
      console.error('Change status error:', err)
      alert(err instanceof Error ? err.message : 'Failed to update agent status')
    } finally {
      setChangingStatusAgentId(null)
    }
  }

  // Calculate stats for an agent
  const getAgentStats = (agent: Agent) => {
    const tenants = agent.deployedTenants || []
    const active = tenants.filter(t => t.status === 'active').length
    const failed = tenants.filter(t => t.status === 'failed').length
    const health = tenants.length > 0 ? Math.round((active / tenants.length) * 100) : null
    const lastDeploy = tenants.length > 0
      ? new Date(Math.max(...tenants.map(t => new Date(t.deployedAt).getTime())))
      : null
    return { active, failed, health, lastDeploy }
  }

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-slate-900">Agents</h1>
        <button
          onClick={() => setShowAddAgent(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          + Add Agent
        </button>
      </div>

      {/* View tabs and search */}
      <div className="flex items-center gap-4">
        {/* View toggle */}
        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('active')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'active'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setViewMode('archived')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'archived'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Archived
            {archivedCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                viewMode === 'archived' ? 'bg-slate-700' : 'bg-slate-200'
              }`}>
                {archivedCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {data?.demoMode && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Demo</span>
        )}
        <span className="text-xs text-slate-400">{filteredAgents.length} agents</span>
      </div>

      {/* Agents Grid */}
      {error ? (
        <div className="p-4 text-center text-sm text-rose-600 bg-white border border-slate-200 rounded-lg">Failed to load agents</div>
      ) : isLoading ? (
        <div className="p-4 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-lg">Loading...</div>
      ) : filteredAgents.length === 0 ? (
        <div className="p-6 text-center bg-white border border-slate-200 rounded-lg">
          <p className="text-slate-500 text-sm">{searchQuery ? 'No matching agents' : 'No agents found'}</p>
          {!searchQuery && (
            <button onClick={() => setShowAddAgent(true)} className="text-sm text-blue-600 hover:text-blue-700 mt-1">
              Add first agent →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAgents.map((agent: Agent) => {
            const stats = getAgentStats(agent)
            const isSelected = selectedAgent?.id === agent.id
            const isExpanded = expandedAgentId === agent.id
            return (
              <div
                key={agent.id}
                className={`bg-white border rounded-lg overflow-hidden transition-colors ${
                  isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-slate-200'
                }`}
              >
                {/* Main row */}
                <div
                  className="p-4 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedAgent(isSelected ? null : agent)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedAgentId(isExpanded ? null : agent.id)
                          }}
                          className="text-slate-400 hover:text-slate-600 transition-transform"
                          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <h3 className="font-medium text-slate-900">{agent.friendlyName}</h3>
                        <span className="text-xs text-slate-400 tabular-nums">v{agent.version}</span>
                        {agent.isCustom && <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">custom</span>}
                        {(agent.status || 'active') === 'deprecated' && (
                          <span className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">deprecated</span>
                        )}
                        {(agent.status || 'active') === 'archived' && (
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
                        {agent.lastPublished && <span>published {formatRelativeTime(new Date(agent.lastPublished))}</span>}
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
                              setSelectedAgent(agent)
                              setShowDeployments(true)
                            }}
                            className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                          >
                            tenants
                          </button>
                        )}
                        {(agent.status || 'active') === 'active' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeploy(agent)
                            }}
                            className="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded font-medium"
                          >
                            Deploy
                          </button>
                        ) : (
                          <span className="px-3 py-1 text-xs text-slate-400 bg-slate-100 rounded">
                            {agent.status === 'deprecated' ? 'Deprecated' : 'Archived'}
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
                          {editingTagsAgentId !== agent.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStartEditTags(agent) }}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingTagsAgentId === agent.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editTagsInput}
                              onChange={(e) => setEditTagsInput(e.target.value)}
                              placeholder="tag1, tag2, tag3"
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSaveTags(agent.id) }}
                                disabled={savingTags}
                                className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {savingTags ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTagsAgentId(null) }}
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
                      {showStatusConfirm?.agentId === agent.id ? (
                        <div className="space-y-2">
                          {showStatusConfirm.newStatus === 'archived' && agent.totalDeployments > 0 && (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                              <strong>Note:</strong> This agent is deployed to {agent.totalDeployments} tenant{agent.totalDeployments !== 1 ? 's' : ''}.
                              Archiving will automatically uninstall it from all tenants.
                            </div>
                          )}
                          {showStatusConfirm.newStatus === 'deprecated' && (
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                              Deprecating will prevent new deployments but keep existing installations.
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-slate-700">
                              {showStatusConfirm.newStatus === 'archived' && 'Archive this agent?'}
                              {showStatusConfirm.newStatus === 'deprecated' && 'Deprecate this agent?'}
                              {showStatusConfirm.newStatus === 'active' && 'Restore this agent?'}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleChangeStatus(agent.id, showStatusConfirm.newStatus) }}
                              disabled={changingStatusAgentId === agent.id}
                              className={`px-3 py-1 text-xs text-white rounded disabled:opacity-50 ${
                                showStatusConfirm.newStatus === 'archived' ? 'bg-slate-600 hover:bg-slate-700' :
                                showStatusConfirm.newStatus === 'deprecated' ? 'bg-amber-600 hover:bg-amber-700' :
                                'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {changingStatusAgentId === agent.id ? 'Updating...' : 'Confirm'}
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
                          {(agent.status || 'active') === 'active' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowStatusConfirm({ agentId: agent.id, newStatus: 'deprecated' }) }}
                                className="text-xs text-amber-600 hover:text-amber-700"
                              >
                                Deprecate
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowStatusConfirm({ agentId: agent.id, newStatus: 'archived' }) }}
                                className="text-xs text-slate-500 hover:text-slate-700"
                              >
                                Archive
                              </button>
                            </>
                          )}
                          {(agent.status || 'active') === 'deprecated' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowStatusConfirm({ agentId: agent.id, newStatus: 'active' }) }}
                                className="text-xs text-emerald-600 hover:text-emerald-700"
                              >
                                Restore to Active
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowStatusConfirm({ agentId: agent.id, newStatus: 'archived' }) }}
                                className="text-xs text-slate-500 hover:text-slate-700"
                              >
                                Archive
                              </button>
                            </>
                          )}
                          {(agent.status || 'active') === 'archived' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowStatusConfirm({ agentId: agent.id, newStatus: 'active' }) }}
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
          })}
        </div>
      )}

      {/* Selected agent quick action bar */}
      {selectedAgent && !showDeployments && (
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-900">{selectedAgent.friendlyName}</span>
            <span className="text-slate-500">v{selectedAgent.version}</span>
            {selectedAgent.totalDeployments > 0 && (
              <span className="text-emerald-600">{selectedAgent.totalDeployments} tenants</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedAgent.totalDeployments > 0 && (
              <button
                onClick={() => setShowDeployments(true)}
                className="px-2 py-1 text-slate-600 hover:text-slate-900"
              >
                view tenants
              </button>
            )}
            <button
              onClick={() => handleDeploy(selectedAgent)}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Deploy →
            </button>
            <button onClick={() => setSelectedAgent(null)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
          </div>
        </div>
      )}

      {/* Deployed Tenants Modal - Compact */}
      {showDeployments && selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[70vh] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-slate-900">{selectedAgent.friendlyName}</h3>
                <p className="text-xs text-slate-500">{selectedAgent.totalDeployments} tenants</p>
              </div>
              <button onClick={() => setShowDeployments(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Tenant list as table */}
            <div className="max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-[1fr_60px_70px] gap-2 px-4 py-1 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                <div>Tenant</div>
                <div className="text-right">Version</div>
                <div className="text-right">Status</div>
              </div>
              {selectedAgent.deployedTenants.map((deployment) => (
                <Link
                  key={deployment.tenantId}
                  href={`/tenants/${deployment.tenantId}`}
                  className="grid grid-cols-[1fr_60px_70px] gap-2 px-4 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div className="truncate text-slate-900">{deployment.tenantName}</div>
                  <div className="text-right text-slate-500 tabular-nums">v{deployment.version}</div>
                  <div className="text-right">
                    <span className={`text-xs ${
                      deployment.status === 'active' ? 'text-emerald-600' :
                      deployment.status === 'updating' ? 'text-amber-600' : 'text-rose-600'
                    }`}>
                      {deployment.status === 'active' ? '✓ ok' :
                       deployment.status === 'updating' ? '◐ updating' : '✗ failed'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => { setShowDeployments(false); handleDeploy(selectedAgent) }}
                className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Deploy to more tenants →
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Add Agent Modal - File Upload */}
      {showAddAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Import Agent</h3>
              <button onClick={() => { setShowAddAgent(false); setUploadError(null); setUploadedMetadata(null); setSelectedFile(null) }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="p-4 space-y-4">
              {uploadError && (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">{uploadError}</div>
              )}

              {/* File upload area */}
              {!uploadedMetadata && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                    id="solution-file-input"
                  />
                  {uploadingFile ? (
                    <div className="py-4">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm text-slate-600">Parsing solution...</p>
                    </div>
                  ) : (
                    <>
                      <svg className="w-10 h-10 text-slate-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-slate-600 mb-2">
                        Drag & drop your solution .zip file here
                      </p>
                      <p className="text-xs text-slate-400 mb-3">or</p>
                      <label
                        htmlFor="solution-file-input"
                        className="inline-block px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer"
                      >
                        Browse files
                      </label>
                      <p className="text-xs text-slate-400 mt-4">
                        Export your agent from Copilot Studio as a managed solution
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Parsed solution preview */}
              {uploadedMetadata && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-emerald-900">{uploadedMetadata.friendlyName}</p>
                      <p className="text-xs text-emerald-700 mt-1">
                        {uploadedMetadata.uniqueName} • v{uploadedMetadata.version}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${uploadedMetadata.isManaged ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                          {uploadedMetadata.isManaged ? 'Managed' : 'Unmanaged'}
                        </span>
                        <span className="text-emerald-600">by {uploadedMetadata.publisherName}</span>
                      </div>
                      {uploadedMetadata.description && (
                        <p className="text-xs text-emerald-600 mt-2">{uploadedMetadata.description}</p>
                      )}

                      {/* Knowledge Sources */}
                      {uploadedMetadata.knowledgeSources && uploadedMetadata.knowledgeSources.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-emerald-200">
                          <p className="text-xs font-medium text-emerald-800 mb-1">Knowledge Sources:</p>
                          <div className="flex flex-wrap gap-1">
                            {uploadedMetadata.knowledgeSources.map((source, i) => (
                              <span key={i} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Connection References */}
                      {uploadedMetadata.connectionReferences && uploadedMetadata.connectionReferences.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-emerald-200">
                          <p className="text-xs font-medium text-emerald-800 mb-1">Connections Required:</p>
                          <div className="flex flex-wrap gap-1">
                            {uploadedMetadata.connectionReferences.map((conn, i) => (
                              <span key={i} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title={conn.connectorId}>
                                {conn.displayName || conn.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tenant-Specific Values (URLs that need remapping) */}
                      {uploadedMetadata.tenantSpecificValues && uploadedMetadata.tenantSpecificValues.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-emerald-200">
                          <p className="text-xs font-medium text-amber-700 mb-1">
                            ⚠️ Tenant-Specific Configuration Required:
                          </p>
                          <div className="space-y-1.5">
                            {uploadedMetadata.tenantSpecificValues.map((val, i) => (
                              <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                                <div className="font-mono text-amber-800 break-all">{val.value}</div>
                                <div className="text-amber-600 mt-1">
                                  {val.type === 'sharepoint_url' && 'SharePoint URL'}
                                  {val.type === 'dataverse_url' && 'Dataverse URL'}
                                  {val.type === 'custom_url' && 'Custom URL'}
                                  {' — needs mapping per tenant'}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-amber-600 mt-2">
                            These URLs are specific to your source environment and will need to be configured for each target tenant during deployment.
                          </p>
                        </div>
                      )}

                      {selectedFile && (
                        <p className="text-xs text-emerald-500 mt-2">{selectedFile.name}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2 justify-end">
                {uploadedMetadata ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                    >
                      Upload different file
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmUpload}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Add Agent
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowAddAgent(false); setUploadError(null) }}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
