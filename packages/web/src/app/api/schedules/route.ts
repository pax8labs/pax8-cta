import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, SchedulerService } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * GET /api/schedules - Get scheduled deployment info
 */
export async function GET() {
  try {
    const config = await loadConfig(resolve(CONFIG_PATH))
    const scheduler = new SchedulerService()

    // Get registered schedules from Redis if available
    let registeredSchedules: Array<{
      id: string
      name: string
      cron: string
      timezone: string
      nextRun: string | null
    }> = []

    try {
      const queueManager = new DeploymentQueueManager(REDIS_URL)
      const schedules = await queueManager.listScheduledDeployments()
      registeredSchedules = schedules.map(s => ({
        id: s.id,
        name: s.name,
        cron: s.cron,
        timezone: s.timezone,
        nextRun: s.nextRun?.toISOString() || null,
      }))
      await queueManager.close()
    } catch {
      // Redis may not be available (e.g., in Vercel)
    }

    if (!config.settings?.schedule) {
      return NextResponse.json({
        enabled: false,
        message: 'No schedule configured',
        registeredSchedules,
      })
    }

    const schedule = config.settings.schedule
    const nextRuns = scheduler.getNextRuns(schedule, 5)
    const isInWindow = scheduler.isWithinMaintenanceWindow(schedule)
    const cronDescription = schedule.cron
      ? scheduler.describeCron(schedule.cron)
      : null

    return NextResponse.json({
      enabled: true,
      cron: schedule.cron,
      cronDescription,
      timezone: schedule.timezone || 'UTC',
      maintenanceWindow: schedule.maintenanceWindow,
      isCurrentlyInWindow: isInWindow,
      nextRuns: nextRuns.map(d => d.toISOString()),
      registeredSchedules,
    })
  } catch (error) {
    console.error('Schedules error:', error)
    return NextResponse.json(
      { error: 'Failed to load schedule configuration' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/schedules - Register schedules with the worker queue
 * Body: { solutionPath: string, solutionName: string }
 *
 * This endpoint syncs schedules from config to BullMQ repeatable jobs.
 * Should be called after config changes or on worker startup.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { solutionPath, solutionName } = body

    if (!solutionPath || !solutionName) {
      return NextResponse.json(
        { error: 'solutionPath and solutionName are required' },
        { status: 400 }
      )
    }

    const config = await loadConfig(resolve(CONFIG_PATH))

    // Connect to Redis and register schedules
    const queueManager = new DeploymentQueueManager(REDIS_URL)

    try {
      const result = await queueManager.registerScheduledDeploymentsFromConfig(
        config,
        resolve(solutionPath),
        solutionName
      )

      // Get the list of registered schedules
      const registeredSchedules = await queueManager.listScheduledDeployments()

      return NextResponse.json({
        success: true,
        registered: result.registered,
        errors: result.errors,
        schedules: registeredSchedules.map(s => ({
          id: s.id,
          name: s.name,
          cron: s.cron,
          timezone: s.timezone,
          nextRun: s.nextRun?.toISOString() || null,
        })),
      })
    } finally {
      await queueManager.close()
    }
  } catch (error) {
    console.error('Register schedules error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register schedules' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/schedules - Remove all registered schedules
 */
export async function DELETE() {
  try {
    const queueManager = new DeploymentQueueManager(REDIS_URL)

    try {
      const removed = await queueManager.removeAllScheduledDeployments()

      return NextResponse.json({
        success: true,
        removed,
      })
    } finally {
      await queueManager.close()
    }
  } catch (error) {
    console.error('Remove schedules error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove schedules' },
      { status: 500 }
    )
  }
}
