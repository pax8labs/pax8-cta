import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { resolve } from 'path'
import { loadConfig, isDemoMode } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments, resolveDeployment } from '@/lib/demo-store'
import { serverTrackDeployment, serverTrackError } from '@/lib/posthog-server'

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
    // Demo mode handling
    if (isDemoMode()) {
      // Resolve deployment from store or generate for historical demo IDs
      const deployment = resolveDeployment(params.id)

      if (!deployment) {
        return NextResponse.json(
          { error: 'Deployment not found' },
          { status: 404 }
        )
      }

      // Find failed or cancelled tenants
      const retryableTenants = deployment.tenantResults.filter(
        (r) => r.status === 'failed' || r.status === 'cancelled'
      )

      if (retryableTenants.length === 0) {
        return NextResponse.json(
          { error: 'No failed or cancelled tenants to retry' },
          { status: 400 }
        )
      }

      // Reset failed/cancelled tenants to pending and update deployment status
      for (const result of deployment.tenantResults) {
        if (result.status === 'failed' || result.status === 'cancelled') {
          result.status = 'pending'
          result.error = undefined
          result.startedAt = undefined
          result.completedAt = undefined
          result.attemptNumber = (result.attemptNumber || 1) + 1
        }
      }

      // Reset deployment status to in_progress
      deployment.status = 'in_progress'
      // Recalculate counts after resetting failed tenants to pending
      deployment.completedTenants = deployment.tenantResults.filter(t => t.status === 'completed').length
      deployment.failedTenants = deployment.tenantResults.filter(t => t.status === 'failed').length
      deployment.completedAt = undefined // Clear completion time so SSE knows to process
      deployment.updatedAt = new Date().toISOString()

      // Update the stored deployment
      demoDeployments.set(params.id, deployment)

      // Track retry event
      serverTrackDeployment('deployment_retried', {
        deploymentId: params.id,
        solutionName: deployment.solutionName,
        tenantCount: retryableTenants.length,
        status: 'in_progress',
      })

      return NextResponse.json({
        demoMode: true,
        message: `Retrying ${retryableTenants.length} tenant(s)`,
        retriedTenants: retryableTenants.map((t) => t.tenantName),
        deploymentId: params.id,
      })
    }

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

    // Find failed or cancelled tenants
    const retryableTenants = deployment.tenantResults.filter(
      (r) => r.status === 'failed' || r.status === 'cancelled'
    )

    if (retryableTenants.length === 0) {
      await queueManager.close()
      return NextResponse.json(
        { error: 'No failed or cancelled tenants to retry' },
        { status: 400 }
      )
    }

    // Load config to get full tenant details
    const config = await loadConfig(resolve(CONFIG_PATH))

    const tenantsToRetry = config.tenants.filter((t) =>
      retryableTenants.some((f) => f.tenantId === t.tenantId)
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

    // Track retry event
    serverTrackDeployment('deployment_retried', {
      deploymentId: params.id,
      tenantCount: tenantsToRetry.length,
      status: 'in_progress',
    })

    return NextResponse.json({
      message: `Retrying ${tenantsToRetry.length} failed tenant(s)`,
      retriedTenants: tenantsToRetry.map((t) => t.name),
    })
  } catch (error) {
    console.error('Retry deployment error:', error)

    // Track the error
    serverTrackError(error instanceof Error ? error : String(error), {
      endpoint: `/api/deployments/${params.id}/retry`,
      method: 'POST',
    })

    return NextResponse.json(
      { error: 'Failed to retry deployment' },
      { status: 500 }
    )
  }
}
