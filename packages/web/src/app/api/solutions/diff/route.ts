import { NextRequest, NextResponse } from 'next/server'
import {
  loadConfig,
  getClientSecret,
  GdapClient,
  DataverseClient,
  SolutionDiffService
} from '@agentsync/core'
import { resolve } from 'path'
import { invalidRequest, notFound, internalError } from '@/lib/errors'

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
      return invalidRequest('solutionPath is required')
    }

    if (!tenantId) {
      return invalidRequest('tenantId is required')
    }

    const config = await loadConfig(resolve(CONFIG_PATH))
    const tenant = config.tenants.find(t => t.tenantId === tenantId)

    if (!tenant) {
      return notFound('Tenant', tenantId)
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
      return invalidRequest('Failed to parse solution file')
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
    return internalError(
      'Failed to generate diff',
      process.env.NODE_ENV === 'development' && error instanceof Error ? { error: error.message } : undefined
    )
  }
}
