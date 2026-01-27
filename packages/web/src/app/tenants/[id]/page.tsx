'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import Link from 'next/link'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface DeployedAgent {
  solutionName: string
  version: string
  deployedAt: string
  deploymentId: string
  status: 'active' | 'failed' | 'updating'
}

interface Tenant {
  name: string
  tenantId: string
  environmentUrl: string
  tags: string[]
  enabled: boolean
  metadata?: Record<string, unknown>
  deployedAgents?: DeployedAgent[]
}

export default function TenantDetailPage() {
  const params = useParams()
  const tenantId = params.id as string
  const router = useRouter()
  const { data, error, isLoading } = useSWR(`/api/tenants/${tenantId}`, fetcher)
  const { data: allTagsData } = useSWR('/api/tenants/tags', fetcher)

  const [isEditingTags, setIsEditingTags] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [isRemovingAgent, setIsRemovingAgent] = useState<string | null>(null)
  const [agentToRemove, setAgentToRemove] = useState<string | null>(null)
  const [showDisableWarning, setShowDisableWarning] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const tenant: Tenant | undefined = data?.tenant
  const allTags: string[] = allTagsData?.tags ?? []

  const handleStartEditTags = () => {
    setSelectedTags(tenant?.tags ?? [])
    setIsEditingTags(true)
    setActionError(null)
    setActionSuccess(null)
  }

  const handleSaveTags = async () => {
    try {
      const response = await fetch(`/api/tenants/${tenantId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selectedTags }),
      })

      if (!response.ok) throw new Error('Failed to update tags')

      mutate(`/api/tenants/${tenantId}`)
      mutate('/api/tenants')
      setIsEditingTags(false)
      setActionSuccess('Tags updated successfully')
    } catch (err) {
      setActionError('Failed to update tags')
    }
  }

  const handleCreateTag = async () => {
    if (!newTagInput.trim()) return

    setIsCreatingTag(true)
    try {
      const response = await fetch('/api/tenants/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTagInput.trim().toLowerCase() }),
      })

      if (!response.ok) throw new Error('Failed to create tag')

      mutate('/api/tenants/tags')
      setSelectedTags([...selectedTags, newTagInput.trim().toLowerCase()])
      setNewTagInput('')
      setActionSuccess(`Tag "${newTagInput.trim()}" created`)
    } catch (err) {
      setActionError('Failed to create tag')
    } finally {
      setIsCreatingTag(false)
    }
  }

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  const handleConfirmRemoveAgent = async () => {
    if (!agentToRemove) return

    setIsRemovingAgent(agentToRemove)
    setActionError(null)

    try {
      const response = await fetch(`/api/tenants/${tenantId}/agents/${encodeURIComponent(agentToRemove)}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to remove agent')

      mutate(`/api/tenants/${tenantId}`)
      mutate('/api/agents')
      setActionSuccess(`Agent "${agentToRemove}" has been removed from this tenant`)
    } catch (err) {
      setActionError('Failed to remove agent')
    } finally {
      setIsRemovingAgent(null)
      setAgentToRemove(null)
    }
  }

  const handleToggleEnabled = () => {
    // If currently enabled, show warning before disabling
    if (tenant?.enabled) {
      setShowDisableWarning(true)
    } else {
      // If currently disabled, enable directly
      confirmToggleEnabled()
    }
  }

  const confirmToggleEnabled = async () => {
    setIsTogglingStatus(true)
    try {
      const response = await fetch(`/api/tenants/${tenantId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !tenant?.enabled }),
      })

      if (!response.ok) throw new Error('Failed to update status')

      mutate(`/api/tenants/${tenantId}`)
      mutate('/api/tenants')
      setActionSuccess(`Tenant ${tenant?.enabled ? 'disabled' : 'enabled'} successfully`)
      setShowDisableWarning(false)
    } catch (err) {
      setActionError('Failed to update tenant status')
    } finally {
      setIsTogglingStatus(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link href="/tenants" className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tenants
        </Link>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6">
          <p className="text-rose-700 font-medium">Failed to load tenant details</p>
          <p className="text-rose-600 text-sm mt-1">Tenant not found or an error occurred.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link href="/tenants" className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Tenants
        </Link>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span className="ml-3 text-slate-500">Loading tenant details...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/tenants" className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tenants
      </Link>

      {/* Success/Error Messages */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-emerald-700">{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-rose-700">{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-800">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center">
            <span className="text-2xl font-bold text-blue-600">
              {tenant?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{tenant?.name}</h1>
            <p className="text-slate-500 font-mono text-sm mt-1">{tenant?.tenantId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleEnabled}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tenant?.enabled
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}
          >
            {tenant?.enabled ? 'Disable Tenant' : 'Enable Tenant'}
          </button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-3">
        {tenant?.enabled ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-600">
            <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
            Disabled
          </span>
        )}
        <a
          href={tenant?.environmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          {new URL(tenant?.environmentUrl || 'https://example.com').hostname}
        </a>
      </div>

      {/* Tags Section */}
      <div className="bg-white shadow-md rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Tags</h2>
          {!isEditingTags ? (
            <button
              onClick={handleStartEditTags}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Tags
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingTags(false)}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTags}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          )}
        </div>
        <div className="p-6">
          {isEditingTags ? (
            <div className="space-y-4">
              {/* Available tags */}
              <div>
                <p className="text-sm text-slate-600 mb-3">Select tags to apply:</p>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleToggleTag(tag)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tag}
                      {selectedTags.includes(tag) && (
                        <svg className="w-3 h-3 ml-1.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Create new tag */}
              <div className="pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-3">Or create a new tag:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="Enter new tag name..."
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  />
                  <button
                    onClick={handleCreateTag}
                    disabled={!newTagInput.trim() || isCreatingTag}
                    className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {isCreatingTag ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tenant?.tags && tenant.tags.length > 0 ? (
                tenant.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-700"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-slate-500 text-sm">No tags assigned</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Deployed Agents Section */}
      <div className="bg-white shadow-md rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Deployed Agents</h2>
          <p className="text-sm text-slate-500 mt-1">Copilot Studio agents installed on this tenant</p>
        </div>
        <div className="p-6">
          {tenant?.deployedAgents && tenant.deployedAgents.length > 0 ? (
            <div className="space-y-3">
              {tenant.deployedAgents.map((agent) => (
                <div
                  key={agent.solutionName}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-violet-100 to-violet-200 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{agent.solutionName}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs font-mono text-slate-500">v{agent.version}</span>
                        <span className="text-xs text-slate-400">
                          Deployed {new Date(agent.deployedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {agent.status === 'active' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        Active
                      </span>
                    )}
                    {agent.status === 'updating' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                        Updating
                      </span>
                    )}
                    {agent.status === 'failed' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                        Failed
                      </span>
                    )}
                    <button
                      onClick={() => setAgentToRemove(agent.solutionName)}
                      disabled={isRemovingAgent === agent.solutionName}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove agent from tenant"
                    >
                      {isRemovingAgent === agent.solutionName ? (
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">No agents deployed</p>
              <p className="text-slate-400 text-sm mt-1">Deploy an agent from the Agents page</p>
              <Link
                href="/agents"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Deploy an Agent
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Section */}
      {tenant?.metadata && Object.keys(tenant.metadata).length > 0 && (
        <div className="bg-white shadow-md rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Metadata</h2>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(tenant.metadata).map(([key, value]) => (
                <div key={key} className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">{key}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Deployment History */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-sm text-slate-600">
          <svg className="w-4 h-4 inline-block mr-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          View full deployment history for this tenant in the{' '}
          <Link href={`/deployments?tenant=${tenantId}`} className="text-blue-600 hover:underline">
            Deployments
          </Link>{' '}
          page.
        </p>
      </div>

      {/* Remove Agent Confirmation Modal */}
      {agentToRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Remove Agent</h3>
                  <p className="text-sm text-slate-500">This action cannot be undone</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-slate-700">
                  You are about to remove <span className="font-semibold text-slate-900">{agentToRemove}</span> from <span className="font-semibold text-slate-900">{tenant?.name}</span>.
                </p>
                <ul className="mt-3 text-sm text-slate-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    The agent will be uninstalled from this tenant
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Users on this tenant will lose access to the agent
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    You can redeploy the agent later if needed
                  </li>
                </ul>
              </div>

              <p className="text-sm text-slate-600 mb-4">
                Are you sure you want to proceed?
              </p>
            </div>

            <div className="flex gap-3 p-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => setAgentToRemove(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveAgent}
                disabled={isRemovingAgent !== null}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {isRemovingAgent ? 'Removing...' : 'Yes, Remove Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Tenant Warning Modal */}
      {showDisableWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Disable Tenant</h3>
                  <p className="text-sm text-slate-500">This will affect deployments</p>
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-4 mb-4 border border-amber-100">
                <p className="text-sm text-slate-700">
                  You are about to disable <span className="font-semibold text-slate-900">{tenant?.name}</span>.
                </p>
                <ul className="mt-3 text-sm text-slate-600 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    This tenant will be excluded from future deployments
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Existing deployed agents will remain active
                  </li>
                  <li className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    You can re-enable this tenant at any time
                  </li>
                </ul>
              </div>

              {tenant?.deployedAgents && tenant.deployedAgents.length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <p className="text-xs text-slate-500 mb-2">Currently deployed agents ({tenant.deployedAgents.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {tenant.deployedAgents.map(agent => (
                      <span key={agent.solutionName} className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {agent.solutionName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm text-slate-600">
                Are you sure you want to disable this tenant?
              </p>
            </div>

            <div className="flex gap-3 p-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => setShowDisableWarning(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggleEnabled}
                disabled={isTogglingStatus}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {isTogglingStatus ? 'Disabling...' : 'Yes, Disable Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
