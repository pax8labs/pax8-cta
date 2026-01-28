import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { resolve } from 'path'
import { loadConfig, isDemoMode, generateMockDeployment } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments } from '@/lib/demo-store'

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
      // Check if deployment exists in store, or generate mock for legacy IDs
      let deployment = demoDeployments.get(params.id)

      if (!deployment) {
        // Generate mock deployment for historical/sample deployment IDs
        const isInProgress = params.id.includes('progress')
        const isFailed = params.id.includes('fail')
        deployment = generateMockDeployment({
          id: params.id,
          status: isInProgress ? 'in_progress' : isFailed ? 'failed' : 'completed',
        })
        // Store it so progress endpoint can find it
        demoDeployments.set(params.id, deployment)
      }

      // Find failed tenants
      const failedTenants = deployment.tenantResults.filter(
        (r) => r.status === 'failed'
      )

      if (failedTenants.length === 0) {
        return NextResponse.json(
          { error: 'No failed tenants to retry' },
          { status: 400 }
        )
      }

      // Reset failed tenants to pending and update deployment status
      for (const result of deployment.tenantResults) {
        if (result.status === 'failed') {
          result.status = 'pending'
          result.error = undefined
          result.startedAt = undefined
          result.completedAt = undefined
          result.attemptNumber = (result.attemptNumber || 1) + 1
        }
      }

      // Reset deployment status to in_progress
      deployment.status = 'in_progress'
      deployment.failedTenants = 0
      deployment.updatedAt = new Date().toISOString()

      // Update the stored deployment
      demoDeployments.set(params.id, deployment)

      return NextResponse.json({
        demoMode: true,
        message: `Retrying ${failedTenants.length} failed tenant(s)`,
        retriedTenants: failedTenants.map((t) => t.tenantName),
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
