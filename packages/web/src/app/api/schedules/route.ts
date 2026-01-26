import { NextRequest, NextResponse } from 'next/server'
import { loadConfig, SchedulerService } from '@agentcrate/core'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * GET /api/schedules - Get scheduled deployment info
 */
export async function GET() {
  try {
    const config = await loadConfig(resolve(CONFIG_PATH))
    const scheduler = new SchedulerService()

    if (!config.settings?.schedule) {
      return NextResponse.json({
        enabled: false,
        message: 'No schedule configured',
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
    })
  } catch (error) {
    console.error('Schedules error:', error)
    return NextResponse.json(
      { error: 'Failed to load schedule configuration' },
      { status: 500 }
    )
  }
}
