'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface Agent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  description: string
  publisherName: string
  isManaged: boolean
  deployedTenants: DeployedTenant[]
  totalDeployments: number
}

interface Tenant {
  tenantId: string
  name: string
  environmentUrl: string
  tags?: string[]
  enabled: boolean
}

function NewDeploymentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preSelectedAgentId = searchParams.get('agent')

  const { data: tenantsData } = useSWR('/api/tenants', fetcher)
  const { data: agentsData } = useSWR('/api/agents', fetcher)

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // Pre-select agent if coming from Agents page with query param
  useEffect(() => {
    if (preSelectedAgentId && agentsData?.agents && !selectedAgent) {
      const agent = agentsData.agents.find((a: Agent) => a.id === preSelectedAgentId)
      if (agent) {
        setSelectedAgent(agent)
      }
    }
  }, [preSelectedAgentId, agentsData, selectedAgent])
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreparingDeploy, setIsPreparingDeploy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [agentUrl, setAgentUrl] = useState('')
  const [urlResolving, setUrlResolving] = useState(false)
  const [urlResolved, setUrlResolved] = useState<{
    bot: { id: string; name: string };
    solution: { uniqueName: string; friendlyName: string; version: string };
  } | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const tenants: Tenant[] = tenantsData?.tenants?.filter((t: Tenant) => t.enabled) || []
  const agents: Agent[] = agentsData?.agents || []

  // Create a set of tenant IDs where the selected agent is already deployed
  const deployedTenantIds = useMemo(() => {
    if (!selectedAgent) return new Set<string>()
    return new Set(selectedAgent.deployedTenants.map(d => d.tenantId))
  }, [selectedAgent])

  // Get unique tags
  const allTags = [...new Set(tenants.flatMap((t: Tenant) => t.tags || []))] as string[]

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent)
    // Clear tenant selection when changing agent
    setSelectedTenants([])
    setSelectAll(false)
    setSelectedTags([])
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      // Only select tenants that don't already have this agent deployed
      const availableTenants = tenants
        .filter((t: Tenant) => !deployedTenantIds.has(t.tenantId))
        .map((t: Tenant) => t.tenantId)
      setSelectedTenants(availableTenants)
    } else {
      setSelectedTenants([])
    }
  }

  const handleTenantToggle = (tenantId: string) => {
    setSelectedTenants((prev) =>
      prev.includes(tenantId)
        ? prev.filter((id) => id !== tenantId)
        : [...prev, tenantId]
    )
  }

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => {
      const newTags = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]

      // Update selected tenants based on tags (excluding already deployed)
      if (newTags.length > 0) {
        const matchingTenants = tenants
          .filter((t: Tenant) =>
            newTags.some((tag) => t.tags?.includes(tag)) &&
            !deployedTenantIds.has(t.tenantId)
          )
          .map((t: Tenant) => t.tenantId)
        setSelectedTenants(matchingTenants)
      }

      return newTags
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedAgent) {
      setError('Please select an agent to deploy')
      return
    }

    if (selectedTenants.length === 0) {
      setError('Please select at least one tenant')
      return
    }

    setIsPreparingDeploy(true)
    const startTime = Date.now()

    try {
      // Download the agent solution file
      const response = await fetch(`/api/demo-solutions/${selectedAgent.uniqueName}`)
      if (!response.ok) throw new Error('Failed to prepare agent for deployment')

      const blob = await response.blob()
      const filename = `${selectedAgent.uniqueName}_${selectedAgent.version.replace(/\./g, '_')}_managed.zip`
      const solutionFile = new File([blob], filename, { type: 'application/zip' })

      setIsSubmitting(true)
      setIsPreparingDeploy(false)

      // Create form data for file upload
      const formData = new FormData()
      formData.append('solution', solutionFile)
      formData.append('tenantIds', JSON.stringify(selectedTenants))

      const createResponse = await fetch('/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      if (!createResponse.ok) {
        const data = await createResponse.json()
        throw new Error(data.error || 'Failed to create deployment')
      }

      const { deploymentId } = await createResponse.json()

      // Ensure the overlay is visible for at least 1.5 seconds so users can see the status
      const elapsed = Date.now() - startTime
      const minDisplayTime = 1500
      if (elapsed < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed))
      }

      router.push(`/deployments/${deploymentId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deployment')
      setIsPreparingDeploy(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <a
          href="/deployments"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-blue-600 text-sm mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Deployments
        </a>
        <h1 className="text-3xl font-bold text-slate-900">New Deployment</h1>
        <p className="text-slate-500 mt-1">
          Deploy a Copilot Studio solution to multiple customer tenants
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-rose-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Select Agent */}
        <div className="bg-white shadow-md rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-semibold text-sm">1</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Select Agent
            </h2>
          </div>

          {agents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleSelectAgent(agent)}
                  className={`text-left p-4 rounded-lg border-2 transition-all ${
                    selectedAgent?.id === agent.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedAgent?.id === agent.id
                        ? 'bg-blue-100'
                        : 'bg-violet-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        selectedAgent?.id === agent.id
                          ? 'text-blue-600'
                          : 'text-violet-600'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{agent.friendlyName}</p>
                        {selectedAgent?.id === agent.id && (
                          <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{agent.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-slate-400">v{agent.version}</span>
                        {agent.totalDeployments > 0 && (
                          <>
                            <span className="text-xs text-slate-400">|</span>
                            <span className="text-xs text-emerald-600 font-medium">
                              {agent.totalDeployments} tenant{agent.totalDeployments !== 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              {/* Import from URL card */}
              <button
                type="button"
                onClick={() => setShowAddAgentModal(true)}
                className="text-left p-4 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100 group-hover:bg-blue-100 transition-colors">
                    <svg className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 group-hover:text-blue-700">Import from URL</p>
                    <p className="text-xs text-slate-500">Paste an M365 agent URL to import</p>
                  </div>
                </div>
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <div className="animate-spin w-6 h-6 mx-auto mb-2 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              Loading agents...
            </div>
          )}

          {/* Selected Agent Summary with Deployment Info */}
          {selectedAgent && selectedAgent.totalDeployments > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Already deployed to {selectedAgent.totalDeployments} tenant{selectedAgent.totalDeployments !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    {selectedAgent.deployedTenants.map(d => d.tenantName).join(', ')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Select Tenants */}
        <div className="bg-white shadow-md rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-semibold text-sm">2</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Select Target Tenants
            </h2>
          </div>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div className="mb-4 pb-4 border-b border-slate-100">
              <p className="text-sm font-medium text-slate-700 mb-3">
                Quick select by tag:
              </p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Select All */}
          <div className="flex items-center mb-4 pb-4 border-b border-slate-100">
            <input
              type="checkbox"
              id="select-all"
              checked={selectAll}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <label
              htmlFor="select-all"
              className="ml-3 text-sm font-medium text-slate-700"
            >
              Select all enabled tenants ({tenants.length})
            </label>
          </div>

          {/* Tenant List */}
          <div className="max-h-72 overflow-y-auto space-y-1 pr-2">
            {tenants.map((tenant: Tenant) => {
              const isDeployed = deployedTenantIds.has(tenant.tenantId)
              const deployedInfo = selectedAgent?.deployedTenants.find(d => d.tenantId === tenant.tenantId)

              return (
                <div
                  key={tenant.tenantId}
                  className={`flex items-center p-3 rounded-lg transition-colors ${
                    isDeployed
                      ? 'bg-emerald-50 border border-emerald-200'
                      : selectedTenants.includes(tenant.tenantId)
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={tenant.tenantId}
                    checked={selectedTenants.includes(tenant.tenantId)}
                    onChange={() => handleTenantToggle(tenant.tenantId)}
                    disabled={isDeployed}
                    className={`h-4 w-4 rounded border-slate-300 focus:ring-blue-500 ${
                      isDeployed ? 'text-emerald-600' : 'text-blue-600'
                    }`}
                  />
                  <label
                    htmlFor={tenant.tenantId}
                    className={`ml-3 flex-1 ${isDeployed ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isDeployed ? 'text-slate-600' : 'text-slate-900'}`}>
                        {tenant.name}
                      </span>
                      {isDeployed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Deployed v{deployedInfo?.version}
                        </span>
                      )}
                      {tenant.tags?.map((tag: string) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-slate-500">
                      {new URL(tenant.environmentUrl).hostname}
                    </span>
                  </label>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-blue-600">{selectedTenants.length}</span> tenant(s) selected
            </p>
            {selectedTenants.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTenants([])
                  setSelectAll(false)
                  setSelectedTags([])
                }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <a
            href="/deployments"
            className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors font-medium"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={isSubmitting || isPreparingDeploy || !selectedAgent || selectedTenants.length === 0}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center gap-2"
          >
            {isPreparingDeploy ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Preparing Agent...
              </>
            ) : isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Starting Deployment...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Start Deployment
              </>
            )}
          </button>
        </div>
      </form>

      {/* Deployment Progress Overlay */}
      {(isPreparingDeploy || isSubmitting) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-2 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {isPreparingDeploy ? 'Preparing Deployment' : 'Starting Deployment'}
              </h3>
              <p className="text-slate-500 text-sm">
                {isPreparingDeploy
                  ? `Packaging ${selectedAgent?.friendlyName} for deployment...`
                  : `Deploying to ${selectedTenants.length} tenant${selectedTenants.length !== 1 ? 's' : ''}...`
                }
              </p>
              <div className="mt-4 flex justify-center gap-1">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* URL Import Modal */}
      {showAddAgentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Import Agent from URL</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddAgentModal(false)
                  setAgentUrl('')
                  setUrlResolved(null)
                  setUrlError(null)
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  M365 Agent URL
                </label>
                <input
                  type="url"
                  value={agentUrl}
                  onChange={(e) => {
                    setAgentUrl(e.target.value)
                    setUrlResolved(null)
                    setUrlError(null)
                  }}
                  placeholder="https://m365.cloud.microsoft/chat/?titleId=..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Paste a Microsoft 365 Copilot agent URL to import
                </p>
              </div>

              {urlError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-sm text-rose-700">{urlError}</p>
                </div>
              )}

              {!urlResolved && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!agentUrl) return
                    setUrlResolving(true)
                    setUrlError(null)
                    try {
                      const response = await fetch('/api/solutions/from-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: agentUrl, dryRun: true }),
                      })
                      const data = await response.json()
                      if (!response.ok) throw new Error(data.error || 'Failed to resolve URL')
                      setUrlResolved({ bot: data.bot, solution: data.solution })
                    } catch (err) {
                      setUrlError(err instanceof Error ? err.message : 'Failed to resolve URL')
                    } finally {
                      setUrlResolving(false)
                    }
                  }}
                  disabled={!agentUrl || urlResolving}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {urlResolving ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Resolving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Resolve URL
                    </>
                  )}
                </button>
              )}

              {urlResolved && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-emerald-900">{urlResolved.bot.name}</p>
                        <p className="text-sm text-emerald-700 mt-0.5">
                          Solution: {urlResolved.solution.friendlyName} v{urlResolved.solution.version}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setUrlResolved(null)
                        setAgentUrl('')
                      }}
                      className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
                    >
                      Try Another
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsImporting(true)
                        try {
                          const response = await fetch('/api/solutions/from-url', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: agentUrl, dryRun: false }),
                          })
                          const data = await response.json()
                          if (!response.ok) throw new Error(data.error || 'Failed to import')

                          // Close modal and refresh agents list
                          setShowAddAgentModal(false)
                          setAgentUrl('')
                          setUrlResolved(null)
                          // Trigger a re-fetch of agents
                          window.location.reload()
                        } catch (err) {
                          setUrlError(err instanceof Error ? err.message : 'Failed to import')
                        } finally {
                          setIsImporting(false)
                        }
                      }}
                      disabled={isImporting}
                      className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isImporting ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Importing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Import Agent
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <a
          href="/deployments"
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-blue-600 text-sm mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Deployments
        </a>
        <h1 className="text-3xl font-bold text-slate-900">New Deployment</h1>
        <p className="text-slate-500 mt-1">
          Deploy a Copilot Studio solution to multiple customer tenants
        </p>
      </div>
      <div className="bg-white shadow-md rounded-xl border border-slate-200 p-8 text-center">
        <div className="animate-spin w-8 h-8 mx-auto mb-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        <p className="text-slate-500">Loading...</p>
      </div>
    </div>
  )
}

export default function NewDeploymentPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewDeploymentContent />
    </Suspense>
  )
}
