import { NextRequest, NextResponse } from 'next/server'
import {
  isDemoMode,
  DataverseClient,
  TokenManager,
  ConnectionOperations,
  DEMO_TENANTS,
  getEffectiveIntegrationSettings,
} from '@agentsync/core'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { id: string }
}

/**
 * Mock connectors for demo mode
 */
const DEMO_CONNECTORS = [
  { id: 'shared_commondataserviceforapps', name: 'Microsoft Dataverse', tier: 'Standard' },
  { id: 'shared_office365', name: 'Office 365 Outlook', tier: 'Standard' },
  { id: 'shared_sharepointonline', name: 'SharePoint', tier: 'Standard' },
  { id: 'shared_teams', name: 'Microsoft Teams', tier: 'Standard' },
  { id: 'shared_azuread', name: 'Azure AD', tier: 'Premium' },
  { id: 'shared_office365users', name: 'Office 365 Users', tier: 'Standard' },
  { id: 'shared_servicenow', name: 'ServiceNow', tier: 'Premium' },
]

/**
 * Get connection references and available connections for a tenant
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
      const tenant = DEMO_TENANTS.find(t => t.tenantId === tenantId)

      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      // Generate mock connection references
      const mockConnectionRefs = [
        {
          id: `${tenantId}-connref-1`,
          logicalName: 'cr_dataverse_connection',
          displayName: 'Dataverse Connection',
          connectorId: 'shared_commondataserviceforapps',
          connectorName: 'Microsoft Dataverse',
          connectionId: `${tenantId}-conn-1`,
          connectionName: `${tenant.name} Dataverse`,
          status: 'Connected',
        },
        {
          id: `${tenantId}-connref-2`,
          logicalName: 'cr_sharepoint_connection',
          displayName: 'SharePoint Connection',
          connectorId: 'shared_sharepointonline',
          connectorName: 'SharePoint',
          connectionId: `${tenantId}-conn-2`,
          connectionName: `${tenant.name} SharePoint`,
          status: 'Connected',
        },
        {
          id: `${tenantId}-connref-3`,
          logicalName: 'cr_teams_connection',
          displayName: 'Teams Connection',
          connectorId: 'shared_teams',
          connectorName: 'Microsoft Teams',
          connectionId: null,
          connectionName: null,
          status: 'Not Connected',
        },
      ]

      // Generate mock available connections
      const mockConnections = DEMO_CONNECTORS.slice(0, 4).map((connector, i) => ({
        id: `${tenantId}-conn-${i + 1}`,
        displayName: `${tenant.name} ${connector.name}`,
        connectorId: connector.id,
        connectorName: connector.name,
        tier: connector.tier,
        status: 'Active',
        createdTime: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000).toISOString(),
      }))

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tenantName: tenant.name,
        environmentUrl: environmentUrl || tenant.environmentUrl,
        connectionReferences: mockConnectionRefs,
        connections: mockConnections,
        connectors: DEMO_CONNECTORS,
      })
    }

    // Real mode - query Dataverse for connections
    const settings = await getEffectiveIntegrationSettings()

    if (!settings.partnerTenantId || !settings.partnerClientId || !settings.partnerClientSecret) {
      return NextResponse.json(
        { error: 'Partner credentials not configured' },
        { status: 500 }
      )
    }

    if (!environmentUrl) {
      return NextResponse.json(
        { error: 'environmentUrl query parameter is required' },
        { status: 400 }
      )
    }

    // Create token manager for customer tenant (GDAP delegation)
    const customerTokenManager = new TokenManager({
      tenantId: tenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    })

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager: customerTokenManager,
    })

    const connectionOps = new ConnectionOperations(dataverseClient)

    // Fetch connection references
    const connectionRefs = await connectionOps.listConnectionReferences()

    // Fetch connections (this requires additional query)
    // For now, we return connection references with available connection info
    const connections = await dataverseClient.get<{ value: Array<{
      connectionid: string
      name: string
      connectorid: string
      statecode: number
    }> }>('/connections', {
      $select: 'connectionid,name,connectorid,statecode',
      $filter: 'statecode eq 0', // Active connections only
    })

    return NextResponse.json({
      demoMode: false,
      tenantId,
      environmentUrl,
      connectionReferences: connectionRefs.map(ref => ({
        id: ref.connectionreferenceid,
        logicalName: ref.connectionreferencelogicalname,
        displayName: ref.connectionreferencedisplayname,
        connectorId: ref.connectorid,
        connectionId: ref.connectionid,
        status: ref.connectionid ? 'Connected' : 'Not Connected',
        stateCode: ref.statecode,
      })),
      connections: connections.value.map(conn => ({
        id: conn.connectionid,
        displayName: conn.name,
        connectorId: conn.connectorid,
        status: 'Active',
      })),
    })
  } catch (error) {
    console.error('Connections error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch connections', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Update connection mappings for a tenant
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const tenantId = params.id

  try {
    const body = await request.json()
    const { environmentUrl, mappings } = body as {
      environmentUrl: string
      mappings: Array<{ connectionReferenceId: string; connectionId: string }>
    }

    if (!environmentUrl || !mappings) {
      return NextResponse.json(
        { error: 'environmentUrl and mappings are required' },
        { status: 400 }
      )
    }

    if (isDemoMode()) {
      // In demo mode, just acknowledge the update
      return NextResponse.json({
        demoMode: true,
        success: true,
        message: 'Connection mappings updated (demo mode)',
        applied: mappings.length,
      })
    }

    // Real mode - apply connection mappings
    const settings = await getEffectiveIntegrationSettings()

    if (!settings.partnerClientId || !settings.partnerClientSecret) {
      return NextResponse.json(
        { error: 'Partner credentials not configured' },
        { status: 500 }
      )
    }

    const customerTokenManager = new TokenManager({
      tenantId: tenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    })

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager: customerTokenManager,
    })

    const connectionOps = new ConnectionOperations(dataverseClient)

    // Apply each mapping
    const results = {
      success: true,
      applied: 0,
      errors: [] as string[],
    }

    for (const mapping of mappings) {
      try {
        await connectionOps.updateConnectionReference(
          mapping.connectionReferenceId,
          mapping.connectionId
        )
        results.applied++
      } catch (error) {
        results.success = false
        results.errors.push(
          `Failed to map ${mapping.connectionReferenceId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    return NextResponse.json({
      demoMode: false,
      ...results,
    })
  } catch (error) {
    console.error('Update connections error:', error)
    return NextResponse.json(
      { error: 'Failed to update connections', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
