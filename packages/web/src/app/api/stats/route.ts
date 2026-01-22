import { NextResponse } from 'next/server'
import { loadConfig } from '@csd/core'
import { DeploymentQueueManager } from '@csd/worker'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET() {
  try {
    // Load tenant count from config
    let totalTenants = 0
    try {
      const config = await loadConfig(resolve(CONFIG_PATH))
      totalTenants = config.tenants.filter((t) => t.enabled).length
    } catch {
      // Config might not exist yet
    }

    // Get deployment stats from queue
    const queueManager = new DeploymentQueueManager(REDIS_URL)

    // Get all jobs to calculate stats
    const jobs = await queueManager
      .getTenantDeploymentQueue()
      .getJobs(['completed', 'failed', 'active', 'waiting'])

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTimestamp = today.getTime()

    // Group jobs by deployment ID
    const deploymentIds = new Set(jobs.map((j) => j.data.deploymentId))

    let activeDeployments = 0
    let completedToday = 0
    let failedToday = 0

    for (const deploymentId of deploymentIds) {
      const deployment = await queueManager.getDeploymentStatus(deploymentId)
      if (!deployment) continue

      if (
        deployment.status === 'in_progress' ||
        deployment.status === 'pending'
      ) {
        activeDeployments++
      }

      if (
        deployment.status === 'completed' &&
        new Date(deployment.updatedAt).getTime() >= todayTimestamp
      ) {
        completedToday++
      }

      if (
        deployment.status === 'failed' &&
        new Date(deployment.updatedAt).getTime() >= todayTimestamp
      ) {
        failedToday++
      }
    }

    await queueManager.close()

    return NextResponse.json({
      totalTenants,
      activeDeployments,
      completedToday,
      failedToday,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load stats' },
      { status: 500 }
    )
  }
}
