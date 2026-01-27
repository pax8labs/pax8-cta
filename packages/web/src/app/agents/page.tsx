'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type AddAgentTab = 'manual' | 'url'

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

interface Agent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
  isCustom?: boolean
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
  const [formData, setFormData] = useState({
    friendlyName: '',
    uniqueName: '',
    version: '1.0.0.0',
    description: '',
    publisherName: '',
  })
  const [addAgentTab, setAddAgentTab] = useState<AddAgentTab>('url')
  const [agentUrl, setAgentUrl] = useState('')
  const [urlResolving, setUrlResolving] = useState(false)
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)
  const [editingTagsAgentId, setEditingTagsAgentId] = useState<string | null>(null)
  const [editTagsInput, setEditTagsInput] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [urlResolved, setUrlResolved] = useState<{
    bot: { id: string; name: string };
    solution: { uniqueName: string; friendlyName: string; version: string };
  } | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    const agents: Agent[] = data?.agents || []
    if (!searchQuery) return agents
    const query = searchQuery.toLowerCase()
    return agents.filter(agent =>
      agent.friendlyName.toLowerCase().includes(query) ||
      agent.uniqueName.toLowerCase().includes(query) ||
      agent.description?.toLowerCase().includes(query) ||
      agent.category?.toLowerCase().includes(query) ||
      agent.publisherName?.toLowerCase().includes(query)
    )
  }, [data?.agents, searchQuery])

  const handleDeploy = (agent: Agent) => {
    router.push(`/deployments/new?agent=${agent.id}`)
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setCreateError(null)

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to create agent')
      setFormData({ friendlyName: '', uniqueName: '', version: '1.0.0.0', description: '', publisherName: '' })
      setShowAddAgent(false)
      mutate()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setIsCreating(false)
    }
  }

  const generateUniqueName = (friendlyName: string) => {
    return friendlyName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '')
  }

  const handleResolveUrl = async () => {
    if (!agentUrl.trim()) return
    setUrlResolving(true)
    setUrlError(null)
    setUrlResolved(null)

    try {
      const response = await fetch('/api/solutions/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: agentUrl, dryRun: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to resolve URL')
      setUrlResolved({ bot: result.bot, solution: result.solution })
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to resolve URL')
    } finally {
      setUrlResolving(false)
    }
  }

  const handleImportFromUrl = async () => {
    if (!urlResolved) return
    setIsCreating(true)
    setCreateError(null)

    try {
      const response = await fetch('/api/solutions/from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: agentUrl, dryRun: false, managed: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to import agent')

      // Reset and close modal
      setAgentUrl('')
      setUrlResolved(null)
      setShowAddAgent(false)
      mutate()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to import agent')
    } finally {
      setIsCreating(false)
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

      {/* Search and source info */}
      <div className="flex items-center gap-4">
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeploy(agent)
                          }}
                          className="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded font-medium"
                        >
                          Deploy
                        </button>
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


      {/* Add Agent Modal - With URL Import */}
      {showAddAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-medium text-slate-900">Add Agent</h3>
              <button onClick={() => { setShowAddAgent(false); setCreateError(null); setUrlError(null); setUrlResolved(null); setAgentUrl('') }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setAddAgentTab('url')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  addAgentTab === 'url'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Import from URL
              </button>
              <button
                onClick={() => setAddAgentTab('manual')}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  addAgentTab === 'manual'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Manual Entry
              </button>
            </div>

            {/* URL Import Tab */}
            {addAgentTab === 'url' && (
              <div className="p-4 space-y-4">
                {(createError || urlError) && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">{createError || urlError}</div>
                )}

                <div>
                  <label className="block text-xs text-slate-500 mb-1">M365 Agent URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={agentUrl}
                      onChange={(e) => { setAgentUrl(e.target.value); setUrlResolved(null); setUrlError(null) }}
                      placeholder="https://m365.cloud.microsoft/chat/?titleId=..."
                      className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleResolveUrl}
                      disabled={urlResolving || !agentUrl.trim()}
                      className="px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 disabled:opacity-50"
                    >
                      {urlResolving ? '...' : 'Resolve'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Paste the URL from your Copilot Studio agent</p>
                </div>

                {urlResolved && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-emerald-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-medium text-emerald-900">{urlResolved.solution.friendlyName}</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          {urlResolved.solution.uniqueName} • v{urlResolved.solution.version}
                        </p>
                        <p className="text-xs text-emerald-600 mt-1">
                          Bot: {urlResolved.bot.name}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowAddAgent(false); setUrlError(null); setUrlResolved(null); setAgentUrl('') }} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportFromUrl}
                    disabled={isCreating || !urlResolved}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isCreating ? 'Importing...' : 'Import Agent'}
                  </button>
                </div>
              </div>
            )}

            {/* Manual Entry Tab */}
            {addAgentTab === 'manual' && (
              <form onSubmit={handleCreateAgent}>
                <div className="p-4 space-y-3">
                  {createError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-sm text-rose-700">{createError}</div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Display Name *</label>
                    <input
                      type="text"
                      value={formData.friendlyName}
                      onChange={(e) => {
                        const friendlyName = e.target.value
                        setFormData(prev => ({ ...prev, friendlyName, uniqueName: prev.uniqueName || generateUniqueName(friendlyName) }))
                      }}
                      placeholder="Customer Support Agent"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Unique Name *</label>
                    <input
                      type="text"
                      value={formData.uniqueName}
                      onChange={(e) => setFormData(prev => ({ ...prev, uniqueName: e.target.value }))}
                      placeholder="CustomerSupportAgent"
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Version *</label>
                      <input
                        type="text"
                        value={formData.version}
                        onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0.0.0"
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Publisher</label>
                      <input
                        type="text"
                        value={formData.publisherName}
                        onChange={(e) => setFormData(prev => ({ ...prev, publisherName: e.target.value }))}
                        placeholder="Contoso"
                        className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description..."
                      className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button type="button" onClick={() => { setShowAddAgent(false); setCreateError(null) }} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                    Cancel
                  </button>
                  <button type="submit" disabled={isCreating} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
