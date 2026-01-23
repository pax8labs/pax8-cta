import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { resolve } from 'path'
import { loadConfig } from '@agentcrate/core'
import { DeploymentQueueManager } from '@agentcrate/worker'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Retry failed tenant deployments for a specific deployment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const queueManager = new DeploymentQueueManager(REDIS_URL)

    // Get current deployment status
    const deployment = await queueManager.getDeploymentStatus(params.id)

    if (!deployment) {
      await queueManager.close()
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      )
    }

    // Find failed tenants
    const failedTenants = deployment.tenantResults.filter(
      (r) => r.status === 'failed'
    )

    if (failedTenants.length === 0) {
      await queueManager.close()
      return NextResponse.json(
        { error: 'No failed tenants to retry' },
        { status: 400 }
      )
    }

    // Load config to get full tenant details
    const config = await loadConfig(resolve(CONFIG_PATH))

    const tenantsToRetry = config.tenants.filter((t) =>
      failedTenants.some((f) => f.tenantId === t.tenantId)
    )

    // Create new jobs for failed tenants
    await queueManager.addTenantDeploymentsBulk(
      params.id, // Use same deployment ID
      deployment.solutionPath,
      tenantsToRetry,
      config.partner.tenantId,
      config.partner.clientId
    )

    await queueManager.close()

    return NextResponse.json({
      message: `Retrying ${tenantsToRetry.length} failed tenant(s)`,
      retriedTenants: tenantsToRetry.map((t) => t.name),
    })
  } catch (error) {
    console.error('Retry deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to retry deployment' },
      { status: 500 }
    )
  }
}
