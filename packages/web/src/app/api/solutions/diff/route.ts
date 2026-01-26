import { NextRequest, NextResponse } from 'next/server'
import {
  loadConfig,
  getClientSecret,
  GdapClient,
  DataverseClient,
  SolutionDiffService
} from '@agentcrate/core'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * POST /api/solutions/diff - Preview solution deployment to a tenant
 * Body: { solutionPath: string, tenantId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { solutionPath, tenantId } = body

    if (!solutionPath) {
      return NextResponse.json(
        { error: 'solutionPath is required' },
        { status: 400 }
      )
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      )
    }

    const config = await loadConfig(resolve(CONFIG_PATH))
    const tenant = config.tenants.find(t => t.tenantId === tenantId)

    if (!tenant) {
      return NextResponse.json(
        { error: `Tenant ${tenantId} not found in configuration` },
        { status: 404 }
      )
    }

    // Create GDAP client and token manager for customer tenant
    const clientSecret = getClientSecret()
    const partnerConfig = {
      tenantId: config.partner.tenantId,
      clientId: config.partner.clientId,
      clientSecret,
    }
    const gdapClient = new GdapClient(partnerConfig)

    // Get token manager for target tenant
    const customerTokenManager = gdapClient.getCustomerTokenManager(
      tenant.tenantId,
      partnerConfig
    )

    // Create Dataverse client for target
    const dataverseClient = new DataverseClient({
      environmentUrl: tenant.environmentUrl,
      tokenManager: customerTokenManager,
    })

    // Diff service
    const diffService = new SolutionDiffService()

    // Get solution summary
    const summary = await diffService.getSolutionSummary(resolve(solutionPath))
    if (!summary) {
      return NextResponse.json(
        { error: 'Failed to parse solution file' },
        { status: 400 }
      )
    }

    // Preview the deployment
    const preview = await diffService.previewDeployment(
      resolve(solutionPath),
      dataverseClient
    )

    return NextResponse.json({
      tenant: {
        name: tenant.name,
        tenantId: tenant.tenantId,
        environmentUrl: tenant.environmentUrl,
      },
      solution: summary,
      preview,
    })
  } catch (error) {
    console.error('Solution diff error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate diff' },
      { status: 500 }
    )
  }
}
