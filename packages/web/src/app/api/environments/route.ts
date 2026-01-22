import { NextResponse } from 'next/server'
import {
  isDemoMode,
  PowerPlatformAdminClient,
  TokenManager,
  getEffectiveIntegrationSettings,
} from '@agentsync/core'
import { internalError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

// Demo environments for showcasing the UI
const DEMO_ENVIRONMENTS = [
  {
    id: 'env-1',
    displayName: 'Pax8 Demo (Production)',
    uniqueName: 'pax8demo',
    domainName: 'pax8demo',
    type: 'Production' as const,
    instanceUrl: 'https://pax8demo.crm.dynamics.com',
    instanceApiUrl: 'https://pax8demo.api.crm.dynamics.com',
    version: '9.2.24013.123',
    state: 'Ready',
    location: 'unitedstates',
    isDefault: true,
    createdTime: '2024-01-15T10:00:00Z',
  },
  {
    id: 'env-2',
    displayName: 'Development Environment',
    uniqueName: 'pax8dev',
    domainName: 'pax8dev',
    type: 'Sandbox' as const,
    instanceUrl: 'https://pax8dev.crm.dynamics.com',
    instanceApiUrl: 'https://pax8dev.api.crm.dynamics.com',
    version: '9.2.24013.123',
    state: 'Ready',
    location: 'unitedstates',
    isDefault: false,
    createdTime: '2024-03-20T14:30:00Z',
  },
  {
    id: 'env-3',
    displayName: 'Agent Testing',
    uniqueName: 'agenttesting',
    domainName: 'agenttesting',
    type: 'Sandbox' as const,
    instanceUrl: 'https://agenttesting.crm.dynamics.com',
    instanceApiUrl: 'https://agenttesting.api.crm.dynamics.com',
    version: '9.2.24013.123',
    state: 'Ready',
    location: 'unitedstates',
    isDefault: false,
    createdTime: '2024-06-10T09:00:00Z',
  },
]

/**
 * Get all accessible Power Platform environments
 * This allows users to browse any environment they have access to
 */
export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({
        demoMode: true,
        environments: DEMO_ENVIRONMENTS,
      })
    }

    const settings = await getEffectiveIntegrationSettings()

    if (!settings.partnerClientId || !settings.partnerClientSecret || !settings.partnerTenantId) {
      return NextResponse.json({
        configured: false,
        message: 'Partner credentials not configured',
        environments: [],
      })
    }

    const tokenManager = new TokenManager({
      tenantId: settings.partnerTenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    })

    const adminClient = new PowerPlatformAdminClient({ tokenManager })
    const environments = await adminClient.listEnvironmentSummaries()

    return NextResponse.json({
      demoMode: false,
      configured: true,
      environments,
    })
  } catch (error) {
    console.error('Environments error:', error)
    return internalError(
      'Failed to fetch environments',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}
