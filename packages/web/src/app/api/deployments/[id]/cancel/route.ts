import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments, demoBatches, demoDeploymentsV2 } from '@/lib/demo-store'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Cancel pending tenant deployments for a specific deployment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Demo mode handling
    if (isDemoMode()) {
      const deployment = demoDeployments.get(params.id)

      if (!deployment) {
        return NextResponse.json(
          { error: 'Deployment not found' },
          { status: 404 }
        )
      }

      if (deployment.status !== 'in_progress' && deployment.status !== 'pending') {
        return NextResponse.json(
          { error: 'Can only cancel in-progress or pending deployments' },
          { status: 400 }
        )
      }

      // Count pending tenants
      const pendingCount = deployment.tenantResults.filter(
        t => t.status === 'pending' || t.status === 'in_progress'
      ).length

      const now = new Date().toISOString()

      // Update deployment status to cancelled
      deployment.status = 'cancelled'
      deployment.updatedAt = now

      // Mark pending/in_progress tenants as cancelled
      deployment.tenantResults.forEach(t => {
        if (t.status === 'pending' || t.status === 'in_progress') {
          t.status = 'cancelled'
          t.error = 'Deployment cancelled by user'
        }
      })

      // Recalculate counts
      deployment.failedTenants = deployment.tenantResults.filter(t => t.status === 'failed' || t.status === 'cancelled').length

      demoDeployments.set(params.id, deployment)

      // Also update v2 stores (batch and individual deployments)
      const batch = demoBatches.get(params.id)
      if (batch) {
        batch.status = 'cancelled'
        batch.updatedAt = now
        demoBatches.set(params.id, batch)
      }

      // Update v2 deployments
      const v2Deployments = demoDeploymentsV2.getByBatchId(params.id)
      for (const v2Deploy of v2Deployments) {
        if (v2Deploy.status === 'pending' || v2Deploy.status === 'in_progress') {
          demoDeploymentsV2.set(v2Deploy.id, {
            ...v2Deploy,
            status: 'cancelled',
            error: 'Deployment cancelled by user',
            updatedAt: now,
          })
        }
      }

      return NextResponse.json({
        demoMode: true,
        message: `Deployment cancelled. ${pendingCount} pending deployment(s) stopped.`,
        cancelledCount: pendingCount,
        status: 'cancelled',
      })
    }

    const queueManager = new DeploymentQueueManager(REDIS_URL)
    const queue = queueManager.getTenantDeploymentQueue()

    // Get waiting and delayed jobs for this deployment
    const waitingJobs = await queue.getJobs(['waiting', 'delayed'])
    const jobsToCancel = waitingJobs.filter(
      (job) => job.data.deploymentId === params.id
    )

    if (jobsToCancel.length === 0) {
      await queueManager.close()
      return NextResponse.json(
        { error: 'No pending jobs to cancel' },
        { status: 400 }
      )
    }

    // Remove jobs from queue
    let cancelledCount = 0
    for (const job of jobsToCancel) {
      try {
        await job.remove()
        cancelledCount++
      } catch (err) {
        // Job might have started processing, skip it
        console.warn(`Could not cancel job ${job.id}:`, err)
      }
    }

    await queueManager.close()

    return NextResponse.json({
      message: `Cancelled ${cancelledCount} pending deployment(s)`,
      cancelledCount,
    })
  } catch (error) {
    console.error('Cancel deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to cancel deployment' },
      { status: 500 }
    )
  }
}
