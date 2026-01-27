// Shared in-memory stores for demo mode
// These are module-level singletons that persist across requests in development
// Custom agents are also persisted to a JSON file to survive server restarts

import { DeploymentJob } from '@agentsync/core'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const CUSTOM_AGENTS_FILE = join(process.cwd(), '.demo-custom-agents.json')

export interface DeployedAgent {
  solutionName: string
  version: string
  deployedAt: string
  deploymentId: string
  status: 'active' | 'failed' | 'updating'
}

export interface CustomAgent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  description?: string
  publisherName?: string
  isManaged: boolean
  createdAt: string
}

// Demo deployments store - uses the core DeploymentJob type for consistency
export const demoDeployments = new Map<string, DeploymentJob>()

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

// Demo deployed agents per tenant
export const demoDeployedAgents = new Map<string, DeployedAgent[]>()

// Demo tenant status (enabled/disabled overrides)
export const demoTenantStatus = new Map<string, boolean>()

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
