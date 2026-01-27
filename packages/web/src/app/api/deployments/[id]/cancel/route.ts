import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentsync/worker'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Cancel pending tenant deployments for a specific deployment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
