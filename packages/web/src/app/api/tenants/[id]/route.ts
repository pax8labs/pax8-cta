import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { loadConfig, isDemoMode, DEMO_CONFIG } from '@agentsync/core'
import { resolve } from 'path'
import { demoDeployedAgents, initializeDemoAgents } from '@/lib/demo-store'
import { requireTenantAccess, logAuthFailure } from '@/lib/api-middleware'
import { notFound, internalError } from '@/lib/errors'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params

  // Require authentication and tenant access
  const session = await requireTenantAccess(tenantId)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/tenants/${tenantId}`, 'forbidden', { tenantId })
    return session
  }

  try {

    const config = isDemoMode()
      ? DEMO_CONFIG
      : await loadConfig(resolve(CONFIG_PATH))

    const tenant = config.tenants.find((t) => t.tenantId === tenantId)

    if (!tenant) {
      return notFound('Tenant', tenantId)
    }

    // Get deployed agents for this tenant
    initializeDemoAgents()
    const deployedAgents = isDemoMode()
      ? demoDeployedAgents.get(tenantId) || []
      : [] // In real mode, would query Dataverse

    return NextResponse.json({
      demoMode: isDemoMode(),
      tenant: {
        name: tenant.name,
        tenantId: tenant.tenantId,
        environmentUrl: tenant.environmentUrl,
        tags: tenant.tags,
        enabled: tenant.enabled,
        metadata: tenant.metadata,
        deployedAgents,
      },
    })
  } catch (error) {
    console.error('Tenant detail error:', error)
    return internalError(
      'Failed to load tenant details',
      process.env.NODE_ENV === 'development' && error instanceof Error ? { error: error.message } : undefined
    )
  }
}
