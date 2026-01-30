// Shared in-memory stores for demo mode
// These are module-level singletons that persist across requests in development
// Custom agents are also persisted to a JSON file to survive server restarts

import { DeploymentJob, Deployment, DeploymentBatch, DeploymentStatus, generateMockDeployment } from '@agentsync/core'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const CUSTOM_AGENTS_FILE = join(process.cwd(), '.demo-custom-agents.json')
const DEPLOYMENTS_FILE = join(process.cwd(), '.demo-deployments.json')
// v2 model files
const DEPLOYMENTS_V2_FILE = join(process.cwd(), '.demo-deployments-v2.json')
const BATCHES_FILE = join(process.cwd(), '.demo-batches.json')

export interface DeployedAgent {
  solutionName: string
  version: string
  deployedAt: string
  deploymentId: string
  status: 'active' | 'failed' | 'updating'
}

// URL template for tenant-specific URL replacement
export interface UrlTemplate {
  id: string
  type: 'sharepoint' | 'dynamics_crm' | 'onmicrosoft' | 'custom'
  originalUrl: string
  templatePattern: string
  extractedTenant: string
  fileLocations: string[]
  description?: string
  confirmed: boolean
}

// Agent's URL template configuration
export interface AgentUrlTemplates {
  sourceTenant: string
  templates: UrlTemplate[]
  createdAt: string
  confirmedAt?: string
}

// Agent lifecycle status
export type AgentStatus = 'active' | 'deprecated' | 'archived'

export interface CustomAgent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  description?: string
  publisherName?: string
  isManaged: boolean
  createdAt: string
  // Agent lifecycle status
  status: AgentStatus
  // URL templating data for multi-tenant deployment
  urlTemplates?: AgentUrlTemplates
  // Original solution stored as base64 for deploy-time modification
  solutionBase64?: string
  // Dependencies (knowledge sources like SharePoint, Dataverse, etc.)
  dependencies?: string[]
  // Connection references required by this agent
  connectionReferences?: { name: string; connectorId: string; displayName?: string }[]
}

// Demo deployments store - uses the core DeploymentJob type for consistency
// This map is backed by a JSON file for persistence across server restarts
const _demoDeployments = new Map<string, DeploymentJob>()

// Load persisted deployments on module init
function loadDeployments() {
  try {
    if (existsSync(DEPLOYMENTS_FILE)) {
      const data = JSON.parse(readFileSync(DEPLOYMENTS_FILE, 'utf-8'))
      for (const deployment of data) {
        _demoDeployments.set(deployment.id, deployment)
      }
    }
  } catch (err) {
    console.warn('Failed to load deployments from file:', err)
  }
}

// Save deployments to file
function saveDeployments() {
  try {
    const data = Array.from(_demoDeployments.values())
    writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save deployments to file:', err)
  }
}

// Initialize on module load
loadDeployments()

// Proxy the map to auto-persist on changes
export const demoDeployments = {
  get: (key: string) => _demoDeployments.get(key),
  set: (key: string, value: DeploymentJob) => {
    _demoDeployments.set(key, value)
    saveDeployments()
    return demoDeployments
  },
  delete: (key: string) => {
    const result = _demoDeployments.delete(key)
    saveDeployments()
    return result
  },
  has: (key: string) => _demoDeployments.has(key),
  values: () => _demoDeployments.values(),
  keys: () => _demoDeployments.keys(),
  entries: () => _demoDeployments.entries(),
  get size() { return _demoDeployments.size },
  [Symbol.iterator]: () => _demoDeployments[Symbol.iterator](),
}

// Custom agents added by user (in addition to DEMO_SOLUTIONS)
// This map is backed by a JSON file for persistence
const _demoCustomAgents = new Map<string, CustomAgent>()

// Load persisted custom agents on module init
function loadCustomAgents() {
  try {
    if (existsSync(CUSTOM_AGENTS_FILE)) {
      const data = JSON.parse(readFileSync(CUSTOM_AGENTS_FILE, 'utf-8'))
      for (const agent of data) {
        _demoCustomAgents.set(agent.uniqueName, agent)
      }
    }
  } catch (err) {
    console.warn('Failed to load custom agents from file:', err)
  }
}

// Save custom agents to file
function saveCustomAgents() {
  try {
    const data = Array.from(_demoCustomAgents.values())
    writeFileSync(CUSTOM_AGENTS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save custom agents to file:', err)
  }
}

// Initialize on module load
loadCustomAgents()

// Proxy the map to auto-persist on changes
export const demoCustomAgents = {
  get: (key: string) => _demoCustomAgents.get(key),
  set: (key: string, value: CustomAgent) => {
    _demoCustomAgents.set(key, value)
    saveCustomAgents()
    return demoCustomAgents
  },
  delete: (key: string) => {
    const result = _demoCustomAgents.delete(key)
    saveCustomAgents()
    return result
  },
  has: (key: string) => _demoCustomAgents.has(key),
  values: () => _demoCustomAgents.values(),
  keys: () => _demoCustomAgents.keys(),
  entries: () => _demoCustomAgents.entries(),
  size: _demoCustomAgents.size,
  [Symbol.iterator]: () => _demoCustomAgents[Symbol.iterator](),
}

// ============================================================================
// v2 Model: Atomic Deployments + Batches
// ============================================================================

// Atomic deployments (one deployment = one tenant + one agent)
const _demoDeploymentsV2 = new Map<string, Deployment>()

function loadDeploymentsV2() {
  try {
    if (existsSync(DEPLOYMENTS_V2_FILE)) {
      const data = JSON.parse(readFileSync(DEPLOYMENTS_V2_FILE, 'utf-8'))
      for (const deployment of data) {
        _demoDeploymentsV2.set(deployment.id, deployment)
      }
    }
  } catch (err) {
    console.warn('Failed to load v2 deployments from file:', err)
  }
}

function saveDeploymentsV2() {
  try {
    const data = Array.from(_demoDeploymentsV2.values())
    writeFileSync(DEPLOYMENTS_V2_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save v2 deployments to file:', err)
  }
}

loadDeploymentsV2()

export const demoDeploymentsV2 = {
  get: (key: string) => _demoDeploymentsV2.get(key),
  set: (key: string, value: Deployment) => {
    _demoDeploymentsV2.set(key, value)
    saveDeploymentsV2()
    return demoDeploymentsV2
  },
  delete: (key: string) => {
    const result = _demoDeploymentsV2.delete(key)
    saveDeploymentsV2()
    return result
  },
  has: (key: string) => _demoDeploymentsV2.has(key),
  values: () => _demoDeploymentsV2.values(),
  keys: () => _demoDeploymentsV2.keys(),
  entries: () => _demoDeploymentsV2.entries(),
  get size() { return _demoDeploymentsV2.size },
  [Symbol.iterator]: () => _demoDeploymentsV2[Symbol.iterator](),
  // Helper: get all deployments for a batch
  getByBatchId: (batchId: string) => {
    return Array.from(_demoDeploymentsV2.values()).filter(d => d.batchId === batchId)
  },
  // Helper: get all deployments for a tenant
  getByTenantId: (tenantId: string) => {
    return Array.from(_demoDeploymentsV2.values()).filter(d => d.tenantId === tenantId)
  },
}

// Deployment batches (groups of deployments initiated together)
const _demoBatches = new Map<string, DeploymentBatch>()

function loadBatches() {
  try {
    if (existsSync(BATCHES_FILE)) {
      const data = JSON.parse(readFileSync(BATCHES_FILE, 'utf-8'))
      for (const batch of data) {
        _demoBatches.set(batch.id, batch)
      }
    }
  } catch (err) {
    console.warn('Failed to load batches from file:', err)
  }
}

function saveBatches() {
  try {
    const data = Array.from(_demoBatches.values())
    writeFileSync(BATCHES_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save batches to file:', err)
  }
}

loadBatches()

export const demoBatches = {
  get: (key: string) => _demoBatches.get(key),
  set: (key: string, value: DeploymentBatch) => {
    _demoBatches.set(key, value)
    saveBatches()
    return demoBatches
  },
  delete: (key: string) => {
    const result = _demoBatches.delete(key)
    saveBatches()
    return result
  },
  has: (key: string) => _demoBatches.has(key),
  values: () => _demoBatches.values(),
  keys: () => _demoBatches.keys(),
  entries: () => _demoBatches.entries(),
  get size() { return _demoBatches.size },
  [Symbol.iterator]: () => _demoBatches[Symbol.iterator](),
}

// ============================================================================
// Legacy stores (kept for backward compatibility during migration)
// ============================================================================

// Demo deployed agents per tenant
// Persisted to file for consistency across server restarts
const DEPLOYED_AGENTS_FILE = join(process.cwd(), '.demo-deployed-agents.json')
const _demoDeployedAgents = new Map<string, DeployedAgent[]>()

function loadDeployedAgents() {
  try {
    if (existsSync(DEPLOYED_AGENTS_FILE)) {
      const data = JSON.parse(readFileSync(DEPLOYED_AGENTS_FILE, 'utf-8'))
      for (const [tenantId, agents] of Object.entries(data)) {
        _demoDeployedAgents.set(tenantId, agents as DeployedAgent[])
      }
    }
  } catch (err) {
    console.warn('Failed to load deployed agents from file:', err)
  }
}

function saveDeployedAgents() {
  try {
    const data = Object.fromEntries(_demoDeployedAgents)
    writeFileSync(DEPLOYED_AGENTS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save deployed agents to file:', err)
  }
}

loadDeployedAgents()

// Proxy the map to auto-persist on changes
export const demoDeployedAgents = {
  get: (key: string) => _demoDeployedAgents.get(key),
  set: (key: string, value: DeployedAgent[]) => {
    _demoDeployedAgents.set(key, value)
    saveDeployedAgents()
    return demoDeployedAgents
  },
  delete: (key: string) => {
    const result = _demoDeployedAgents.delete(key)
    saveDeployedAgents()
    return result
  },
  has: (key: string) => _demoDeployedAgents.has(key),
  get size() { return _demoDeployedAgents.size },
  forEach: (callback: (agents: DeployedAgent[], tenantId: string) => void) => {
    _demoDeployedAgents.forEach(callback)
  },
}

// Demo tenant status (enabled/disabled overrides)
// Persisted to file for consistency across server restarts
const TENANT_STATUS_FILE = join(process.cwd(), '.demo-tenant-status.json')
const _demoTenantStatus = new Map<string, boolean>()

function loadTenantStatus() {
  try {
    if (existsSync(TENANT_STATUS_FILE)) {
      const data = JSON.parse(readFileSync(TENANT_STATUS_FILE, 'utf-8'))
      for (const [tenantId, status] of Object.entries(data)) {
        _demoTenantStatus.set(tenantId, status as boolean)
      }
    }
  } catch (err) {
    console.warn('Failed to load tenant status from file:', err)
  }
}

function saveTenantStatus() {
  try {
    const data = Object.fromEntries(_demoTenantStatus)
    writeFileSync(TENANT_STATUS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save tenant status to file:', err)
  }
}

// Initialize on module load
loadTenantStatus()

// Proxy the map to auto-persist on changes
export const demoTenantStatus = {
  get: (key: string) => _demoTenantStatus.get(key),
  set: (key: string, value: boolean) => {
    _demoTenantStatus.set(key, value)
    saveTenantStatus()
    return demoTenantStatus
  },
  delete: (key: string) => {
    const result = _demoTenantStatus.delete(key)
    saveTenantStatus()
    return result
  },
  has: (key: string) => _demoTenantStatus.has(key),
  get size() { return _demoTenantStatus.size },
}

// Demo tags store
export const demoTags = new Set<string>([
  'enterprise',
  'smb',
  'priority',
  'pilot',
  'production',
])

// Demo tenant tags
export const demoTenantTags = new Map<string, string[]>()

// ============================================================================
// Agent Status Store (for tracking status of both built-in and custom agents)
// ============================================================================
const AGENT_STATUS_FILE = join(process.cwd(), '.demo-agent-status.json')
const _demoAgentStatus = new Map<string, AgentStatus>()

function loadAgentStatus() {
  try {
    if (existsSync(AGENT_STATUS_FILE)) {
      const data = JSON.parse(readFileSync(AGENT_STATUS_FILE, 'utf-8'))
      for (const [agentId, status] of Object.entries(data)) {
        _demoAgentStatus.set(agentId, status as AgentStatus)
      }
    }
  } catch (err) {
    console.warn('Failed to load agent status from file:', err)
  }
}

function saveAgentStatus() {
  try {
    const data = Object.fromEntries(_demoAgentStatus)
    writeFileSync(AGENT_STATUS_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn('Failed to save agent status to file:', err)
  }
}

loadAgentStatus()

export const demoAgentStatus = {
  get: (key: string) => _demoAgentStatus.get(key),
  set: (key: string, value: AgentStatus) => {
    _demoAgentStatus.set(key, value)
    saveAgentStatus()
    return demoAgentStatus
  },
  delete: (key: string) => {
    const result = _demoAgentStatus.delete(key)
    saveAgentStatus()
    return result
  },
  has: (key: string) => _demoAgentStatus.has(key),
  get size() { return _demoAgentStatus.size },
}

// ============================================================================
// Helper: Resolve Historical Demo Deployments
// ============================================================================

/**
 * Resolves a deployment by ID, generating historical demo deployments on-demand.
 * Historical demo IDs follow the pattern: demo-hist-XXX
 *
 * This centralizes the logic that was previously duplicated across multiple endpoints.
 *
 * @param deploymentId - The deployment ID to resolve
 * @param store - Whether to persist generated deployments to the store (default: true)
 * @returns The deployment if found/generated, or null
 */
export function resolveDeployment(deploymentId: string, store: boolean = true): DeploymentJob | null {
  // First check if it exists in the store
  const existing = demoDeployments.get(deploymentId)
  if (existing) return existing

  // Only auto-generate for historical demo IDs (demo-hist-XXX)
  // Real deployments must already exist in the store from /create
  if (!deploymentId.startsWith('demo-hist-')) {
    return null
  }

  // Match the logic from generateMockDeploymentHistory in demo-data.ts
  const index = parseInt(deploymentId.split('-')[2], 10)
  let status: DeploymentStatus
  if (index === 0) {
    status = 'in_progress'
  } else if (index % 10 === 9) {
    status = 'failed'
  } else {
    status = 'completed'
  }

  const deployment = generateMockDeployment({
    id: deploymentId,
    status,
  })

  // Optionally store for future lookups
  if (store) {
    demoDeployments.set(deploymentId, deployment)
  }

  return deployment
}

// Initialize demo agents with hardcoded tenant IDs (matching DEMO_TENANTS from core)
export function initializeDemoAgents() {
  // Only initialize once
  if (demoDeployedAgents.size > 0) return

  // Contoso has all agents
  demoDeployedAgents.set('11111111-1111-1111-1111-111111111111', [
    {
      solutionName: 'Customer Service Agent',
      version: '1.0.0.5',
      deployedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      deploymentId: 'demo-deploy-1',
      status: 'active',
    },
    {
      solutionName: 'Sales Assistant Copilot',
      version: '2.1.0',
      deployedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      deploymentId: 'demo-deploy-2',
      status: 'active',
    },
  ])

  // Fabrikam has one agent
  demoDeployedAgents.set('22222222-2222-2222-2222-222222222222', [
    {
      solutionName: 'Customer Service Agent',
      version: '1.0.0.5',
      deployedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      deploymentId: 'demo-deploy-3',
      status: 'active',
    },
  ])

  // Adventure Works has HR bot
  demoDeployedAgents.set('33333333-3333-3333-3333-333333333333', [
    {
      solutionName: 'HR Onboarding Bot',
      version: '1.2.3',
      deployedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      deploymentId: 'demo-deploy-4',
      status: 'active',
    },
  ])

  // Woodgrove Bank has IT Helpdesk
  demoDeployedAgents.set('55555555-5555-5555-5555-555555555555', [
    {
      solutionName: 'IT Helpdesk Agent',
      version: '3.0.1',
      deployedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      deploymentId: 'demo-deploy-5',
      status: 'updating',
    },
  ])
}
