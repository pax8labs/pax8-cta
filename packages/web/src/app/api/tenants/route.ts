import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { loadConfig, isDemoMode, DEMO_CONFIG, TenantDiscoveryService } from '@agentsync/core'
import { resolve } from 'path'
import { demoDeployedAgents, demoTenantStatus, initializeDemoAgents } from '@/lib/demo-store'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

// Cache for discovered tenants (shared across requests)
let discoveryCache: {
  data: Awaited<ReturnType<TenantDiscoveryService['discoverTenants']>> | null
  expiresAt: number
} = { data: null, expiresAt: 0 }

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Check if tenant discovery via GDAP is enabled
 */
function isDiscoveryEnabled(): boolean {
  return process.env.TENANT_DISCOVERY_ENABLED === 'true' &&
    !!process.env.PARTNER_TENANT_ID &&
    !!process.env.PARTNER_CLIENT_ID &&
    !!process.env.PARTNER_CLIENT_SECRET
}

/**
 * Discover tenants via GDAP relationships
 */
async function discoverTenantsViaGDAP() {
  // Check cache first
  if (discoveryCache.data && Date.now() < discoveryCache.expiresAt) {
    return discoveryCache.data
  }

  const discoveryService = new TenantDiscoveryService({
    tenantId: process.env.PARTNER_TENANT_ID!,
    clientId: process.env.PARTNER_CLIENT_ID!,
    clientSecret: process.env.PARTNER_CLIENT_SECRET!,
  })

  const tenants = await discoveryService.discoverTenants()

  // Update cache
  discoveryCache = {
    data: tenants,
    expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
  }

  return tenants
}

export async function GET() {
  try {
    // Demo mode - use hardcoded demo data
    if (isDemoMode()) {
      initializeDemoAgents()

      const config = DEMO_CONFIG
      return NextResponse.json({
        demoMode: true,
        discoveryMode: false,
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
          deployedAgents: demoDeployedAgents.get(t.tenantId) || [],
        })),
      })
    }

    // Discovery mode - fetch tenants via GDAP
    if (isDiscoveryEnabled()) {
      const discoveredTenants = await discoverTenantsViaGDAP()

      return NextResponse.json({
        demoMode: false,
        discoveryMode: true,
        partner: {
          tenantId: process.env.PARTNER_TENANT_ID,
          clientId: process.env.PARTNER_CLIENT_ID,
        },
        tenants: discoveredTenants.map((t) => ({
          name: t.displayName,
          tenantId: t.tenantId,
          environmentUrl: t.defaultEnvironment?.instanceUrl || '',
          environments: t.environments,
          defaultEnvironment: t.defaultEnvironment,
          tags: t.hasPowerPlatformAdmin ? ['gdap', 'power-platform-admin'] : ['gdap'],
          enabled: t.gdapStatus === 'active' && !t.error,
          gdapStatus: t.gdapStatus,
          gdapEndDateTime: t.gdapEndDateTime,
          hasPowerPlatformAdmin: t.hasPowerPlatformAdmin,
          discoveredAt: t.discoveredAt,
          error: t.error,
          metadata: {
            gdapRelationshipId: t.gdapRelationshipId,
            environmentCount: t.environments.length,
          },
          // No deployed agents tracking in discovery mode yet
          // This would need to query each environment's solutions
          deployedAgents: [],
        })),
      })
    }

    // Config file mode - load from YAML
    const config = await loadConfig(resolve(CONFIG_PATH))

    return NextResponse.json({
      demoMode: false,
      discoveryMode: false,
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
        enabled: t.enabled,
        metadata: t.metadata,
        deployedAgents: [],
      })),
    })
  } catch (error) {
    console.error('Tenants error:', error)
    return NextResponse.json(
      { error: 'Failed to load tenants configuration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint to refresh tenant discovery cache
 */
export async function POST() {
  try {
    if (!isDiscoveryEnabled()) {
      return NextResponse.json(
        { error: 'Tenant discovery is not enabled' },
        { status: 400 }
      )
    }

    // Clear cache to force refresh
    discoveryCache = { data: null, expiresAt: 0 }

    const tenants = await discoverTenantsViaGDAP()

    return NextResponse.json({
      success: true,
      message: 'Tenant discovery cache refreshed',
      tenantCount: tenants.length,
      discoveredAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Tenant discovery refresh error:', error)
    return NextResponse.json(
      { error: 'Failed to refresh tenant discovery', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
