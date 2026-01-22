'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { AgentCard, AgentUploadModal } from '@/components/agents'
import type { Agent } from '@/types/agent'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type ViewMode = 'active' | 'archived'

export default function AgentsPage() {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{ agents: Agent[]; demoMode?: boolean }>('/api/agents', fetcher)

  // UI state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [showDeployments, setShowDeployments] = useState(false)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('active')

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

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Agents</h1>
        <button
          onClick={() => setShowAddAgent(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
          aria-label="Add a new agent"
        >
          + Add Agent
        </button>
      </div>

      {/* View tabs and search */}
      <div className="flex items-center gap-4">
        {/* View toggle */}
        <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('active')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'active'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setViewMode('archived')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              viewMode === 'archived'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Archived
            {archivedCount > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                viewMode === 'archived' ? 'bg-slate-700 dark:bg-slate-300' : 'bg-slate-200 dark:bg-slate-700'
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
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {data?.demoMode && (
          <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded">Demo</span>
        )}
        <span className="text-xs text-slate-400">{filteredAgents.length} agents</span>
      </div>

      {/* Agents Grid */}
      {error ? (
        <div className="p-4 text-center text-sm text-rose-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">Failed to load agents</div>
      ) : isLoading ? (
        <div className="p-4 text-center text-sm text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">Loading...</div>
      ) : filteredAgents.length === 0 ? (
        <div className="p-6 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <p className="text-slate-500 dark:text-slate-400 text-sm">{searchQuery ? 'No matching agents' : 'No agents found'}</p>
          {!searchQuery && (
            <button onClick={() => setShowAddAgent(true)} className="text-sm text-blue-600 hover:text-blue-700 mt-1">
              Add first agent →
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAgents.map((agent: Agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent?.id === agent.id}
              isExpanded={expandedAgentId === agent.id}
              onSelect={setSelectedAgent}
              onToggleExpand={() => setExpandedAgentId(expandedAgentId === agent.id ? null : agent.id)}
              onDeploy={handleDeploy}
              onShowDeployments={() => {
                setSelectedAgent(agent)
                setShowDeployments(true)
              }}
              onRefresh={() => mutate()}
            />
          ))}
        </div>
      )}

      {/* Selected agent quick action bar */}
      {selectedAgent && !showDeployments && (
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-900 dark:text-white">{selectedAgent.friendlyName}</span>
            <span className="text-slate-500 dark:text-slate-400">v{selectedAgent.version}</span>
            {selectedAgent.totalDeployments > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">{selectedAgent.totalDeployments} tenants</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedAgent.totalDeployments > 0 && (
              <button
                onClick={() => setShowDeployments(true)}
                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
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
            <button onClick={() => setSelectedAgent(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">✕</button>
          </div>
        </div>
      )}

      {/* Deployed Tenants Modal */}
      {showDeployments && selectedAgent && (
        <DeployedTenantsModal
          agent={selectedAgent}
          onClose={() => setShowDeployments(false)}
          onDeploy={() => {
            setShowDeployments(false)
            handleDeploy(selectedAgent)
          }}
        />
      )}

      {/* Add Agent Modal */}
      <AgentUploadModal
        isOpen={showAddAgent}
        onClose={() => setShowAddAgent(false)}
        onSuccess={() => mutate()}
      />
    </div>
  )
}

// Deployed tenants modal - kept inline as it's simple
function DeployedTenantsModal({
  agent,
  onClose,
  onDeploy,
}: {
  agent: Agent
  onClose: () => void
  onDeploy: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[70vh] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-slate-900 dark:text-white">{agent.friendlyName}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{agent.totalDeployments} tenants</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">✕</button>
        </div>

        {/* Tenant list as table */}
        <div className="max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_60px_70px] gap-2 px-4 py-1 text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
            <div>Tenant</div>
            <div className="text-right">Version</div>
            <div className="text-right">Status</div>
          </div>
          {agent.deployedTenants.map((deployment) => (
            <Link
              key={deployment.tenantId}
              href={`/tenants/${deployment.tenantId}`}
              className="grid grid-cols-[1fr_60px_70px] gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0"
            >
              <div className="truncate text-slate-900 dark:text-white">{deployment.tenantName}</div>
              <div className="text-right text-slate-500 dark:text-slate-400 tabular-nums">v{deployment.version}</div>
              <div className="text-right">
                <span className={`text-xs ${
                  deployment.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' :
                  deployment.status === 'updating' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {deployment.status === 'active' ? '✓ ok' :
                   deployment.status === 'updating' ? '◐ updating' : '✗ failed'}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <button
            onClick={onDeploy}
            className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Deploy to more tenants →
          </button>
        </div>
      </div>
    </div>
  )
}
