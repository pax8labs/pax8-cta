import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, TenantDiscoveryService, DEMO_TENANTS } from '@agentsync/core'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { id: string }
}

/**
 * Get environments for a specific tenant
 * In demo mode, returns mock data
 * In real mode, queries Power Platform Admin API
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const tenantId = params.id

  try {
    if (isDemoMode()) {
      // Return mock environment data for demo tenants
      const tenant = DEMO_TENANTS.find(t => t.tenantId === tenantId)

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      // Generate mock environments based on tenant
      type MockEnvironment = {
        id: string
        displayName: string
        uniqueName: string
        domainName: string
        type: string
        instanceUrl: string
        instanceApiUrl: string
        version: string
        state: string
        location: string
        isDefault: boolean
        createdTime: string
        capacity: {
          database: { used: number; rated: number; unit: string }
          file: { used: number; rated: number; unit: string }
        }
      }

      const mockEnvironments: MockEnvironment[] = [
        {
          id: `${tenantId}-default`,
          displayName: `${tenant.name} - Default`,
          uniqueName: tenant.name.toLowerCase().replace(/\s+/g, ''),
          domainName: new URL(tenant.environmentUrl).hostname.split('.')[0],
          type: 'Production',
          instanceUrl: tenant.environmentUrl,
          instanceApiUrl: `${tenant.environmentUrl}/api/data/v9.2`,
          version: '9.2.24053.00170',
          state: 'Ready',
          location: 'unitedstates',
          isDefault: true,
          createdTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          capacity: {
            database: { used: 1.2, rated: 4, unit: 'GB' },
            file: { used: 0.5, rated: 2, unit: 'GB' },
          },
        },
      ]

      // Some tenants have sandbox environments too
      if (['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'].includes(tenantId)) {
        mockEnvironments.push({
          id: `${tenantId}-sandbox`,
          displayName: `${tenant.name} - Sandbox`,
          uniqueName: `${tenant.name.toLowerCase().replace(/\s+/g, '')}_sandbox`,
          domainName: `${new URL(tenant.environmentUrl).hostname.split('.')[0]}-sandbox`,
          type: 'Sandbox',
          instanceUrl: tenant.environmentUrl.replace('.crm', '-sandbox.crm'),
          instanceApiUrl: `${tenant.environmentUrl.replace('.crm', '-sandbox.crm')}/api/data/v9.2`,
          version: '9.2.24053.00170',
          state: 'Ready',
          location: 'unitedstates',
          isDefault: false,
          createdTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          capacity: {
            database: { used: 0.3, rated: 2, unit: 'GB' },
            file: { used: 0.1, rated: 1, unit: 'GB' },
          },
        })
      }

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tenantName: tenant.name,
        environments: mockEnvironments,
      })
    }

    // Real mode - use tenant discovery service
    const partnerTenantId = process.env.PARTNER_TENANT_ID
    const partnerClientId = process.env.PARTNER_CLIENT_ID
    const partnerClientSecret = process.env.PARTNER_CLIENT_SECRET

    if (!partnerTenantId || !partnerClientId || !partnerClientSecret) {
      return NextResponse.json(
        { error: 'Partner credentials not configured' },
        { status: 500 }
      )
    }

    const discoveryService = new TenantDiscoveryService({
      tenantId: partnerTenantId,
      clientId: partnerClientId,
      clientSecret: partnerClientSecret,
    })

    // Discover tenants and find the specific one
    const tenants = await discoveryService.discoverTenants()
    const tenant = tenants.find(t => t.tenantId === tenantId)

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found or no GDAP relationship' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      demoMode: false,
      tenantId,
      tenantName: tenant.displayName,
      environments: tenant.environments,
      defaultEnvironment: tenant.defaultEnvironment,
      gdapStatus: tenant.gdapStatus,
      hasPowerPlatformAdmin: tenant.hasPowerPlatformAdmin,
    })
  } catch (error) {
    console.error('Environments error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch environments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
