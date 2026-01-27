import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { loadConfig, isDemoMode, DEMO_CONFIG } from '@agentsync/core'
import { resolve } from 'path'
import { demoDeployedAgents, demoTenantStatus, initializeDemoAgents } from '@/lib/demo-store'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

export async function GET() {
  try {
    // Use demo data if DEMO_MODE is enabled
    const config = isDemoMode()
      ? DEMO_CONFIG
      : await loadConfig(resolve(CONFIG_PATH))

    // Initialize demo data if needed
    if (isDemoMode()) {
      initializeDemoAgents()
    }

    return NextResponse.json({
      demoMode: isDemoMode(),
      partner: {
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
      },
      source: config.source,
      tenants: config.tenants.map((t) => ({
        name: t.name,
        tenantId: t.tenantId,
        environmentUrl: t.environmentUrl,
        tags: t.tags,
        enabled: demoTenantStatus.has(t.tenantId) ? demoTenantStatus.get(t.tenantId) : t.enabled,
        metadata: t.metadata,
        deployedAgents: isDemoMode() ? demoDeployedAgents.get(t.tenantId) || [] : [],
      })),
    })
  } catch (error) {
    console.error('Tenants error:', error)
    return NextResponse.json(
      { error: 'Failed to load tenants configuration' },
      { status: 500 }
    )
  }
}
