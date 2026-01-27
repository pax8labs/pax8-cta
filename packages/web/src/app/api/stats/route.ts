import { NextResponse } from 'next/server'
import { loadConfig, isDemoMode, DEMO_CONFIG } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET() {
  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      const totalTenants = DEMO_CONFIG.tenants.length
      const enabledTenants = DEMO_CONFIG.tenants.filter(t => t.enabled !== false).length

      return NextResponse.json({
        demoMode: true,
        totalTenants,
        enabledTenants,
        activeDeployments: 1,
        completedToday: 3,
        failedToday: 0,
        scheduledDeployments: 2,
        pendingApprovals: 1,
      })
    }

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

    // Get scheduled deployments count
    const scheduledDeployments = (await queueManager.listScheduledDeployments()).length

    await queueManager.close()

    return NextResponse.json({
      demoMode: false,
      totalTenants,
      activeDeployments,
      completedToday,
      failedToday,
      scheduledDeployments,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json(
      { error: 'Failed to load stats' },
      { status: 500 }
    )
  }
}
