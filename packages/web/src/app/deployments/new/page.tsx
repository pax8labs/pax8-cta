'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { FlaskLoadingOverlay } from '@/components/ui/flask-spinner'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface DeployedTenant {
  tenantId: string
  tenantName: string
  version: string
  deployedAt: string
  status: 'active' | 'failed' | 'updating'
}

interface UrlTemplate {
  id: string
  type: 'sharepoint' | 'dynamics_crm' | 'onmicrosoft' | 'custom'
  originalUrl: string
  templatePattern: string
  extractedTenant: string
  fileLocations: string[]
  description?: string
  confirmed: boolean
}

interface AgentUrlTemplates {
  sourceTenant: string
  templates: UrlTemplate[]
  createdAt: string
  confirmedAt?: string
}

type AgentStatus = 'active' | 'deprecated' | 'archived'

interface Agent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  description: string
  publisherName: string
  isManaged: boolean
  status?: AgentStatus
  deployedTenants: DeployedTenant[]
  totalDeployments: number
  urlTemplates?: AgentUrlTemplates
  hasSolutionStored?: boolean
}

interface Tenant {
  tenantId: string
  name: string
  environmentUrl: string
  tags?: string[]
  enabled: boolean
}

interface TenantUrlOverride {
  tenant: string
  sharepoint: string
  dynamicsCrm: string
  onmicrosoft: string
}

// Helper to extract tenant name from environment URL
function extractTenantFromUrl(environmentUrl: string): string | null {
  try {
    const url = new URL(environmentUrl)
    const hostname = url.hostname
    const match = hostname.match(/^([a-zA-Z0-9-]+)\.(crm[0-9]*)\.dynamics\.com$/i)
    if (match) return match[1]
    return null
  } catch {
    return null
  }
}

// Helper to generate default URL values for a tenant
function generateTenantUrls(tenant: Tenant): TenantUrlOverride {
  const extracted = extractTenantFromUrl(tenant.environmentUrl)
  const tenantName = extracted || tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Extract region from environment URL
  let region = 'crm'
  try {
    const url = new URL(tenant.environmentUrl)
    const match = url.hostname.match(/\.(crm[0-9]*)\.dynamics\.com$/i)
    if (match) region = match[1]
  } catch {
    // ignore
  }

  return {
    tenant: tenantName,
    sharepoint: `${tenantName}.sharepoint.com`,
    dynamicsCrm: `${tenantName}.${region}.dynamics.com`,
    onmicrosoft: `${tenantName}.onmicrosoft.com`,
  }
}

// Helper to resolve a template URL to actual URL
function resolveTemplateUrl(templatePattern: string, tenantUrls: TenantUrlOverride): string {
  let resolved = templatePattern
  resolved = resolved.replace(/\{tenant\}\.sharepoint\.com/g, tenantUrls.sharepoint)
  resolved = resolved.replace(/\{tenant\}\.(crm[0-9]*)\.dynamics\.com/g, tenantUrls.dynamicsCrm)
  resolved = resolved.replace(/\{tenant\}\.onmicrosoft\.com/g, tenantUrls.onmicrosoft)
  resolved = resolved.replace(/\{tenant\}/g, tenantUrls.tenant)
  return resolved
}

// Domain suffix configurations for different dependency types
const DEPENDENCY_DOMAINS: Record<string, { suffixPattern: RegExp; defaultSuffix: string; label: string; description: string }> = {
  sharepoint: { suffixPattern: /\.sharepoint\.com$/i, defaultSuffix: '.sharepoint.com', label: 'SharePoint', description: 'SharePoint site collections' },
  dynamicsCrm: { suffixPattern: /\.(crm[0-9]*)\.dynamics\.com$/i, defaultSuffix: '.crm.dynamics.com', label: 'Dynamics 365', description: 'Dataverse / Power Platform' },
  onmicrosoft: { suffixPattern: /\.onmicrosoft\.com$/i, defaultSuffix: '.onmicrosoft.com', label: 'Microsoft 365', description: 'Entra ID / Azure AD tenant' },
  // Future Copilot agent dependencies can be added here
  powerBI: { suffixPattern: /\.powerbi\.com$/i, defaultSuffix: '.powerbi.com', label: 'Power BI', description: 'Power BI workspace' },
  graph: { suffixPattern: /\.graph\.microsoft\.com$/i, defaultSuffix: '.graph.microsoft.com', label: 'Microsoft Graph', description: 'Graph API endpoint' },
  teams: { suffixPattern: /\.teams\.microsoft\.com$/i, defaultSuffix: '.teams.microsoft.com', label: 'Teams', description: 'Teams channels and apps' },
}

// Extract tenant prefix and suffix from a full domain (e.g., "contoso.crm4.dynamics.com" -> { prefix: "contoso", suffix: ".crm4.dynamics.com" })
function extractDomainParts(domain: string, type: string): { prefix: string; suffix: string } {
  const config = DEPENDENCY_DOMAINS[type]
  if (!config) return { prefix: domain, suffix: '' }

  const match = domain.match(config.suffixPattern)
  if (match) {
    const suffix = match[0]
    const prefix = domain.slice(0, -suffix.length)
    return { prefix, suffix }
  }
  // If no match, assume just the prefix was provided
  return { prefix: domain.split('.')[0] || domain, suffix: config.defaultSuffix }
}

// Separate component for URL mapping inputs to avoid closure issues
function UrlMappingInputs({
  tenantId,
  tenant,
  override,
  neededTypes,
  setUrlOverrides,
  generateTenantUrls,
}: {
  tenantId: string
  tenant: Tenant
  override: TenantUrlOverride
  neededTypes: Set<string>
  setUrlOverrides: React.Dispatch<React.SetStateAction<Record<string, TenantUrlOverride>>>
  generateTenantUrls: (tenant: Tenant) => TenantUrlOverride
}) {
  // Extract prefix and suffix from each domain, preserving region info (e.g., crm4)
  const sharepointParts = extractDomainParts(override.sharepoint, 'sharepoint')
  const dynamicsCrmParts = extractDomainParts(override.dynamicsCrm, 'dynamicsCrm')
  const onmicrosoftParts = extractDomainParts(override.onmicrosoft, 'onmicrosoft')

  // Local state for the editable prefixes
  const [localSharepoint, setLocalSharepoint] = useState(sharepointParts.prefix)
  const [localDynamicsCrm, setLocalDynamicsCrm] = useState(dynamicsCrmParts.prefix)
  const [localOnmicrosoft, setLocalOnmicrosoft] = useState(onmicrosoftParts.prefix)

  // Store the suffixes (preserve region for dynamics)
  const [sharepointSuffix, setSharepointSuffix] = useState(sharepointParts.suffix)
  const [dynamicsCrmSuffix, setDynamicsCrmSuffix] = useState(dynamicsCrmParts.suffix)
  const [onmicrosoftSuffix, setOnmicrosoftSuffix] = useState(onmicrosoftParts.suffix)

  // Sync local state when override changes from parent
  useEffect(() => {
    const sp = extractDomainParts(override.sharepoint, 'sharepoint')
    const dc = extractDomainParts(override.dynamicsCrm, 'dynamicsCrm')
    const om = extractDomainParts(override.onmicrosoft, 'onmicrosoft')
    setLocalSharepoint(sp.prefix)
    setLocalDynamicsCrm(dc.prefix)
    setLocalOnmicrosoft(om.prefix)
    setSharepointSuffix(sp.suffix)
    setDynamicsCrmSuffix(dc.suffix)
    setOnmicrosoftSuffix(om.suffix)
  }, [override.sharepoint, override.dynamicsCrm, override.onmicrosoft])

  // Update parent state with full domain (prefix + suffix)
  // Also sync the tenant prefix to other fields for consistency
  const updateParent = (field: keyof TenantUrlOverride, prefix: string, suffix: string) => {
    const fullDomain = `${prefix}${suffix}`
    setUrlOverrides(prev => {
      const current = prev[tenantId] || generateTenantUrls(tenant)
      // Update the specific field
      const updated = { ...current, [field]: fullDomain, tenant: prefix }
      // Also update other fields to use the same tenant prefix for consistency
      // This ensures all dependencies use the same tenant identifier
      if (field === 'sharepoint') {
        updated.dynamicsCrm = `${prefix}${dynamicsCrmSuffix}`
        updated.onmicrosoft = `${prefix}${onmicrosoftSuffix}`
        // Update local state for other fields too
        setLocalDynamicsCrm(prefix)
        setLocalOnmicrosoft(prefix)
      } else if (field === 'dynamicsCrm') {
        updated.sharepoint = `${prefix}${sharepointSuffix}`
        updated.onmicrosoft = `${prefix}${onmicrosoftSuffix}`
        setLocalSharepoint(prefix)
        setLocalOnmicrosoft(prefix)
      } else if (field === 'onmicrosoft') {
        updated.sharepoint = `${prefix}${sharepointSuffix}`
        updated.dynamicsCrm = `${prefix}${dynamicsCrmSuffix}`
        setLocalSharepoint(prefix)
        setLocalDynamicsCrm(prefix)
      }
      return { ...prev, [tenantId]: updated }
    })
  }

  // Render a domain input with prefix editing
  const renderDomainInput = (
    type: string,
    field: keyof TenantUrlOverride,
    prefix: string,
    setPrefix: (v: string) => void,
    suffix: string,
    isRequired: boolean
  ) => {
    const config = DEPENDENCY_DOMAINS[type]
    if (!config) return null

    // Only show required fields, hide non-required ones to keep UI clean
    if (!isRequired) return null

    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <label className="block text-xs font-medium text-amber-800 mb-1">
          {config.label}
        </label>
        <p className="text-xs text-slate-500 mb-2">{config.description}</p>
        <div className="flex items-center">
          <input
            type="text"
            value={prefix}
            onChange={(e) => {
              // Only allow valid characters for tenant names (lowercase alphanumeric and hyphens)
              const sanitized = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
              setPrefix(sanitized)
              updateParent(field, sanitized, suffix)
            }}
            placeholder="tenant-name"
            className="px-2 py-1.5 text-sm border border-amber-300 rounded-l focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white flex-1 min-w-0"
          />
          <span className="px-2 py-1.5 text-sm bg-slate-100 border border-l-0 border-slate-300 rounded-r text-slate-500 whitespace-nowrap">
            {suffix}
          </span>
        </div>
      </div>
    )
  }

  // Check if any fields are required
  const hasRequiredFields = neededTypes.has('sharepoint') || neededTypes.has('dynamicsCrm') || neededTypes.has('onmicrosoft')

  if (!hasRequiredFields) {
    return (
      <p className="text-xs text-slate-400">
        This agent does not require tenant-specific URL configuration.
      </p>
    )
  }

  return (
    <>
      <p className="text-xs text-slate-500 mb-3">
        Configure the tenant-specific URLs this agent needs. Enter just the tenant name - the domain suffix is added automatically.
      </p>
      <div className="space-y-3">
        {renderDomainInput('sharepoint', 'sharepoint', localSharepoint, setLocalSharepoint, sharepointSuffix, neededTypes.has('sharepoint'))}
        {renderDomainInput('dynamicsCrm', 'dynamicsCrm', localDynamicsCrm, setLocalDynamicsCrm, dynamicsCrmSuffix, neededTypes.has('dynamicsCrm'))}
        {renderDomainInput('onmicrosoft', 'onmicrosoft', localOnmicrosoft, setLocalOnmicrosoft, onmicrosoftSuffix, neededTypes.has('onmicrosoft'))}
      </div>
    </>
  )
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
      // Only pre-select if agent is active (not deprecated or archived)
      if (agent && (agent.status || 'active') === 'active') {
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
  const [tenantSearch, setTenantSearch] = useState('')
  const [agentSearch, setAgentSearch] = useState('')
  // URL override state for agents with urlTemplates
  const [urlOverrides, setUrlOverrides] = useState<Record<string, TenantUrlOverride>>({})
  const [showUrlMappingStep, setShowUrlMappingStep] = useState(false)

  const tenants: Tenant[] = tenantsData?.tenants?.filter((t: Tenant) => t.enabled) || []
  const agents: Agent[] = agentsData?.agents || []

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    // First filter out archived and deprecated agents - they can't be deployed
    const deployableAgents = agents.filter((a: Agent) => (a.status || 'active') === 'active')
    if (!agentSearch.trim()) return deployableAgents
    const query = agentSearch.toLowerCase()
    return deployableAgents.filter((a: Agent) =>
      a.friendlyName.toLowerCase().includes(query) ||
      a.uniqueName.toLowerCase().includes(query) ||
      a.description?.toLowerCase().includes(query) ||
      a.publisherName?.toLowerCase().includes(query)
    )
  }, [agents, agentSearch])

  // Create a set of tenant IDs where the selected agent is already deployed
  const deployedTenantIds = useMemo(() => {
    if (!selectedAgent) return new Set<string>()
    return new Set(selectedAgent.deployedTenants.map(d => d.tenantId))
  }, [selectedAgent])

  // Get unique tags
  const allTags = [...new Set(tenants.flatMap((t: Tenant) => t.tags || []))] as string[]

  // Check if selected agent has URL templates that need mapping
  const hasUrlTemplates = selectedAgent?.urlTemplates && selectedAgent.urlTemplates.templates.length > 0

  // Initialize URL overrides when tenants are selected and agent has URL templates
  useEffect(() => {
    if (hasUrlTemplates && selectedTenants.length > 0) {
      const newOverrides: Record<string, TenantUrlOverride> = {}
      for (const tenantId of selectedTenants) {
        if (!urlOverrides[tenantId]) {
          const tenant = tenants.find(t => t.tenantId === tenantId)
          if (tenant) {
            newOverrides[tenantId] = generateTenantUrls(tenant)
          }
        } else {
          newOverrides[tenantId] = urlOverrides[tenantId]
        }
      }
      // Only update if there are changes
      if (Object.keys(newOverrides).length > 0) {
        setUrlOverrides(prev => ({ ...prev, ...newOverrides }))
      }
    }
  }, [selectedTenants, hasUrlTemplates, tenants])

  // Filter tenants by search query
  const filteredTenants = useMemo(() => {
    if (!tenantSearch.trim()) return tenants
    const query = tenantSearch.toLowerCase()
    return tenants.filter((t: Tenant) =>
      t.name.toLowerCase().includes(query) ||
      t.environmentUrl.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }, [tenants, tenantSearch])

  const handleSelectAgent = (agent: Agent) => {
    // Block selecting deprecated/archived agents
    if ((agent.status || 'active') !== 'active') {
      return
    }
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
      console.log('[Deploy] Fetching solution for:', selectedAgent.uniqueName)
      const response = await fetch(`/api/demo-solutions/${selectedAgent.uniqueName}`)
      if (!response.ok) throw new Error('Failed to prepare agent for deployment')

      const blob = await response.blob()
      console.log('[Deploy] Solution downloaded, size:', blob.size)
      const filename = `${selectedAgent.uniqueName}_${selectedAgent.version.replace(/\./g, '_')}_managed.zip`
      const solutionFile = new File([blob], filename, { type: 'application/zip' })

      setIsSubmitting(true)
      setIsPreparingDeploy(false)

      // Create form data for file upload
      const formData = new FormData()
      formData.append('solution', solutionFile)
      formData.append('tenantIds', JSON.stringify(selectedTenants))

      // Include URL overrides if agent has URL templates
      // Only include the URL types that the agent actually needs
      if (hasUrlTemplates && Object.keys(urlOverrides).length > 0 && selectedAgent?.urlTemplates?.templates) {
        // Determine which URL types are needed based on agent's templates
        const neededTypes = new Set<string>()
        selectedAgent.urlTemplates.templates.forEach(t => {
          if (t.type === 'sharepoint') neededTypes.add('sharepoint')
          else if (t.type === 'dynamics_crm') neededTypes.add('dynamicsCrm')
          else if (t.type === 'onmicrosoft') neededTypes.add('onmicrosoft')
        })

        // Filter URL overrides to only include needed types
        const filteredOverrides: Record<string, Partial<TenantUrlOverride>> = {}
        for (const [tenantId, override] of Object.entries(urlOverrides)) {
          const filtered: Partial<TenantUrlOverride> = { tenant: override.tenant }
          if (neededTypes.has('sharepoint')) filtered.sharepoint = override.sharepoint
          if (neededTypes.has('dynamicsCrm')) filtered.dynamicsCrm = override.dynamicsCrm
          if (neededTypes.has('onmicrosoft')) filtered.onmicrosoft = override.onmicrosoft
          filteredOverrides[tenantId] = filtered
        }

        console.log('[Deploy] Including URL overrides (filtered):', Object.keys(filteredOverrides))
        formData.append('urlOverrides', JSON.stringify(filteredOverrides))
      }

      console.log('[Deploy] Creating deployment...')
      const createResponse = await fetch('/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      console.log('[Deploy] Response status:', createResponse.status)
      if (!createResponse.ok) {
        const data = await createResponse.json()
        throw new Error(data.error || 'Failed to create deployment')
      }

      const result = await createResponse.json()
      console.log('[Deploy] Result:', result)
      const { deploymentId } = result

      // Ensure the overlay is visible for at least 1.5 seconds so users can see the status
      const elapsed = Date.now() - startTime
      const minDisplayTime = 1500
      if (elapsed < minDisplayTime) {
        await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed))
      }

      console.log('[Deploy] Navigating to:', `/deployments/${deploymentId}`)
      // Use window.location for reliable navigation - router.push can get blocked by state updates
      window.location.href = `/deployments/${deploymentId}`
    } catch (err) {
      console.error('[Deploy] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create deployment')
      setIsPreparingDeploy(false)
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">1</span>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Select Agent
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowAddAgentModal(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
            >
              + Add Agent
            </button>
          </div>

          {agents.length > 0 ? (
            <div className="space-y-4">
              {/* Agent Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {agentSearch && (
                  <button
                    type="button"
                    onClick={() => setAgentSearch('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Agent Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                {filteredAgents.length === 0 ? (
                  <div className="col-span-2 text-center py-8 text-slate-500">
                    <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm">No agents match "{agentSearch}"</p>
                  </div>
                ) : (
                  <>
                    {filteredAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleSelectAgent(agent)}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${
                          selectedAgent?.id === agent.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            selectedAgent?.id === agent.id
                              ? 'bg-blue-100'
                              : 'bg-violet-100'
                          }`}>
                            <svg className={`w-4 h-4 ${
                              selectedAgent?.id === agent.id
                                ? 'text-blue-600'
                                : 'text-violet-600'
                            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-900 text-sm truncate">{agent.friendlyName}</p>
                              {selectedAgent?.id === agent.id && (
                                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono text-slate-400">v{agent.version}</span>
                              {agent.totalDeployments > 0 && (
                                <>
                                  <span className="text-xs text-slate-300">•</span>
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
                  </>
                )}
              </div>
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

          {/* Search and Tag Filters */}
          <div className="mb-4 pb-4 border-b border-slate-100 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="Search tenants by name, URL, or tag..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              {tenantSearch && (
                <button
                  type="button"
                  onClick={() => setTenantSearch('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Tag Filters */}
            {allTags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">
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
          </div>

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
            {filteredTenants.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-sm">No tenants match "{tenantSearch}"</p>
              </div>
            ) : filteredTenants.map((tenant: Tenant) => {
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

        {/* Step 3: URL Mapping (only shown if agent has URL templates) */}
        {hasUrlTemplates && selectedTenants.length > 0 && (
          <div className="bg-white shadow-md rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-amber-600 font-semibold text-sm">3</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Review URL Mappings
                </h2>
                <p className="text-sm text-slate-500">
                  This agent contains tenant-specific URLs from <span className="font-medium text-amber-600">{selectedAgent?.urlTemplates?.sourceTenant}</span> that need to be updated
                </p>
              </div>
            </div>

            {/* URL Templates Info */}
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Detected {selectedAgent?.urlTemplates?.templates.length} tenant-specific URL(s)</p>
                  <ul className="mt-1 space-y-0.5 text-amber-700">
                    {selectedAgent?.urlTemplates?.templates.map((t, i) => (
                      <li key={i} className="font-mono text-xs truncate">
                        {t.originalUrl}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Per-Tenant URL Mapping */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {selectedTenants.map(tenantId => {
                const tenant = tenants.find(t => t.tenantId === tenantId)
                if (!tenant) return null
                const override = urlOverrides[tenantId] || generateTenantUrls(tenant)

                // Determine which URL types are actually needed based on templates
                const neededTypes = new Set<string>()
                selectedAgent?.urlTemplates?.templates.forEach(t => {
                  if (t.type === 'sharepoint') neededTypes.add('sharepoint')
                  else if (t.type === 'dynamics_crm') neededTypes.add('dynamicsCrm')
                  else if (t.type === 'onmicrosoft') neededTypes.add('onmicrosoft')
                })

                // Helper to get current override value from state (avoids stale closure)
                const getOverride = () => urlOverrides[tenantId] || generateTenantUrls(tenant)

                return (
                  <div key={tenantId} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-slate-900">{tenant.name}</h4>
                        <p className="text-xs text-slate-500">Auto-detected from: {new URL(tenant.environmentUrl).hostname}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Toggle expanded view for manual editing
                          const el = document.getElementById(`url-details-${tenantId}`)
                          if (el) el.classList.toggle('hidden')
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        Edit mappings
                      </button>
                    </div>

                    {/* Preview of URL transformations */}
                    <div className="space-y-1.5 mb-3">
                      {selectedAgent?.urlTemplates?.templates.slice(0, 2).map((template, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400 truncate max-w-[180px]">{template.originalUrl}</span>
                          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="text-emerald-600 font-medium truncate max-w-[180px]">
                            {resolveTemplateUrl(template.templatePattern, override)}
                          </span>
                        </div>
                      ))}
                      {(selectedAgent?.urlTemplates?.templates.length || 0) > 2 && (
                        <p className="text-xs text-slate-400">
                          +{(selectedAgent?.urlTemplates?.templates.length || 0) - 2} more URL(s)
                        </p>
                      )}
                    </div>

                    {/* Editable URL mapping details (hidden by default) */}
                    <div id={`url-details-${tenantId}`} className="hidden space-y-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-500 mb-2">
                        Edit the domains below to match this tenant&apos;s environment. Only highlighted fields are used by this agent.
                      </p>
                      <UrlMappingInputs
                        tenantId={tenantId}
                        tenant={tenant}
                        override={override}
                        neededTypes={neededTypes}
                        setUrlOverrides={setUrlOverrides}
                        generateTenantUrls={generateTenantUrls}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
        <FlaskLoadingOverlay
          message={isPreparingDeploy ? 'Preparing Deployment' : 'Starting Deployment'}
          subMessage={isPreparingDeploy
            ? `Packaging ${selectedAgent?.friendlyName} for deployment...`
            : `Deploying to ${selectedTenants.length} tenant${selectedTenants.length !== 1 ? 's' : ''}...`
          }
        />
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
