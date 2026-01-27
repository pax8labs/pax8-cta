import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentsync/worker'
import { DeploymentJob, isDemoMode, generateMockDeploymentHistory } from '@agentsync/core'
import { demoDeployments } from '@/lib/demo-store'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      // Get any real-time demo deployments first
      const liveDeployments = Array.from(demoDeployments.values())

      // Generate mock history for the rest
      const historyCount = Math.max(0, limit - liveDeployments.length)
      const mockHistory = generateMockDeploymentHistory(historyCount)

      // Combine live + history, sort by date
      const allDeployments = [...liveDeployments, ...mockHistory]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)

      return NextResponse.json({
        demoMode: true,
        deployments: allDeployments,
      })
    }

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

    return NextResponse.json({
      demoMode: false,
      deployments: deployments.slice(0, limit),
    })
  } catch (error) {
    console.error('Deployments error:', error)
    return NextResponse.json(
      { error: 'Failed to load deployments' },
      { status: 500 }
    )
  }
}
