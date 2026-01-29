import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, TenantDiscoveryService, DataverseClient, TokenManager, DEMO_TENANTS, DEMO_SOLUTIONS } from '@agentsync/core'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { id: string }
}

/**
 * Get solutions installed in a tenant's environment
 * In demo mode, returns mock solution data
 * In real mode, queries Dataverse API
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const tenantId = params.id
  const { searchParams } = new URL(request.url)
  const environmentUrl = searchParams.get('environmentUrl')

  try {
    if (isDemoMode()) {
      // Return mock solution data for demo tenants
      const tenant = DEMO_TENANTS.find(t => t.tenantId === tenantId)

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      // Return a subset of demo solutions based on tenant
      const tenantSolutions = DEMO_SOLUTIONS.slice(0, Math.floor(Math.random() * 3) + 1).map(sol => ({
        solutionId: `${tenantId}-${sol.uniqueName}`,
        uniqueName: sol.uniqueName,
        friendlyName: sol.friendlyName,
        version: sol.version,
        isManaged: sol.isManaged,
        publisherName: sol.publisherName,
        description: sol.description,
        installedOn: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      }))

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tenantName: tenant.name,
        environmentUrl: environmentUrl || tenant.environmentUrl,
        solutions: tenantSolutions,
      })
    }

    // Real mode - query Dataverse for solutions
    const partnerTenantId = process.env.PARTNER_TENANT_ID
    const partnerClientId = process.env.PARTNER_CLIENT_ID
    const partnerClientSecret = process.env.PARTNER_CLIENT_SECRET

    if (!partnerTenantId || !partnerClientId || !partnerClientSecret) {
      return NextResponse.json(
        { error: 'Partner credentials not configured' },
        { status: 500 }
      )
    }

    // If no environment URL provided, discover it
    let targetEnvironmentUrl = environmentUrl

    if (!targetEnvironmentUrl) {
      const discoveryService = new TenantDiscoveryService({
        tenantId: partnerTenantId,
        clientId: partnerClientId,
        clientSecret: partnerClientSecret,
      })

      const tenants = await discoveryService.discoverTenants()
      const tenant = tenants.find(t => t.tenantId === tenantId)

      if (!tenant || !tenant.defaultEnvironment) {
        return NextResponse.json(
          { error: 'Tenant not found or no default environment' },
          { status: 404 }
        )
      }

      targetEnvironmentUrl = tenant.defaultEnvironment.instanceUrl
    }

    // Create token manager for customer tenant (GDAP delegation)
    const customerTokenManager = new TokenManager({
      tenantId: tenantId, // Target customer tenant
      clientId: partnerClientId,
      clientSecret: partnerClientSecret,
    })

    const dataverseClient = new DataverseClient({
      environmentUrl: targetEnvironmentUrl,
      tokenManager: customerTokenManager,
    })

    const solutions = await dataverseClient.querySolutions()

    return NextResponse.json({
      demoMode: false,
      tenantId,
      environmentUrl: targetEnvironmentUrl,
      solutions: solutions.map(sol => ({
        solutionId: sol.solutionid,
        uniqueName: sol.uniquename,
        friendlyName: sol.friendlyname,
        version: sol.version,
        isManaged: sol.ismanaged,
        publisherName: sol.publisherid?.friendlyname,
      })),
    })
  } catch (error) {
    console.error('Solutions error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch solutions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
