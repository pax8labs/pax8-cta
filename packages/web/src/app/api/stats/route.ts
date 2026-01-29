import { NextResponse } from 'next/server'
import { loadConfig, isDemoMode, DEMO_CONFIG, generateMockDeploymentHistory, DEPLOYMENT_STATUS_CATEGORIES } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { resolve } from 'path'
import { demoDeployments } from '@/lib/demo-store'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET() {
  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      const totalTenants = DEMO_CONFIG.tenants.length
      const enabledTenants = DEMO_CONFIG.tenants.filter(t => t.enabled !== false).length

      // Get live deployments from the store
      const liveDeployments = Array.from(demoDeployments.values())
      const liveIds = new Set(liveDeployments.map(d => d.id))

      // Generate mock history to include in stats (same logic as /api/deployments)
      // Use 100 to match the limit used on the deployments page
      const mockHistory = generateMockDeploymentHistory(100)
        .filter(h => !liveIds.has(h.id))

      // Combine all deployments for stat calculation
      const allDeployments = [...liveDeployments, ...mockHistory]

      // Extract unique tenant-agent records (same logic as deployments page)
      // This ensures dashboard stats match the deployments page counts
      const seen = new Set<string>()
      const records: Array<{ status: string; updatedAt: string }> = []

      // Sort newest first to keep most recent record per tenant-agent pair
      const sorted = [...allDeployments].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      for (const deployment of sorted) {
        for (const result of deployment.tenantResults || []) {
          const key = `${result.tenantId}-${deployment.solutionName}`
          if (!seen.has(key)) {
            seen.add(key)
            records.push({
              status: result.status,
              updatedAt: result.completedAt || result.startedAt || deployment.createdAt,
            })
          }
        }
      }

      // Calculate today's date at midnight
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayTimestamp = today.getTime()

      // Calculate stats using centralized status categories from @agentsync/core
      let activeDeployments = 0
      let completedToday = 0
      let failedToday = 0

      for (const record of records) {
        // Active = completed or in_progress (uses DEPLOYMENT_STATUS_CATEGORIES.ACTIVE)
        if ((DEPLOYMENT_STATUS_CATEGORIES.ACTIVE as readonly string[]).includes(record.status)) {
          activeDeployments++
        }

        // Completed today
        if (record.status === 'completed') {
          const updatedAt = new Date(record.updatedAt).getTime()
          if (updatedAt >= todayTimestamp) {
            completedToday++
          }
        }

        // Failed today (uses DEPLOYMENT_STATUS_CATEGORIES.FAILED)
        if ((DEPLOYMENT_STATUS_CATEGORIES.FAILED as readonly string[]).includes(record.status)) {
          const updatedAt = new Date(record.updatedAt).getTime()
          if (updatedAt >= todayTimestamp) {
            failedToday++
          }
        }
      }

      return NextResponse.json({
        demoMode: true,
        totalTenants,
        enabledTenants,
        activeDeployments,
        completedToday,
        failedToday,
        scheduledDeployments: 0,
        pendingApprovals: 0,
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
