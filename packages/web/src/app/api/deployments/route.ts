import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentcrate/worker'
import { DeploymentJob } from '@agentcrate/core'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const queueManager = new DeploymentQueueManager(REDIS_URL)

    // Get all jobs
    const jobs = await queueManager
      .getTenantDeploymentQueue()
      .getJobs(['completed', 'failed', 'active', 'waiting', 'delayed'])

    // Group by deployment ID
    const deploymentIds = [...new Set(jobs.map((j) => j.data.deploymentId))]

    // Get status for each deployment
    const deployments: DeploymentJob[] = []
    for (const deploymentId of deploymentIds) {
      const deployment = await queueManager.getDeploymentStatus(deploymentId)
      if (deployment) {
        deployments.push(deployment)
      }
    }

    // Sort by creation date (newest first) and limit
    deployments.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    await queueManager.close()

    return NextResponse.json(deployments.slice(0, limit))
  } catch (error) {
    console.error('Deployments error:', error)
    return NextResponse.json(
      { error: 'Failed to load deployments' },
      { status: 500 }
    )
  }
}
