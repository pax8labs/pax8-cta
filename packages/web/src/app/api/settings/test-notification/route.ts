import { NextRequest, NextResponse } from 'next/server'
import { getNotificationService } from '@agentsync/core'
import { requireAuth, logAuthFailure } from '@/lib/api-middleware'
import { createLogger } from '@/lib/logger'
import { apiRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { invalidRequest, internalError } from '@/lib/errors'

const logger = createLogger('test-notification')

export const dynamic = 'force-dynamic'

/**
 * Test a notification channel
 * Requires authentication
 */
export async function POST(request: NextRequest) {
  const session = await requireAuth()
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/settings/test-notification', 'unauthorized')
    return session
  }

  // Apply rate limiting - prevent spam of webhook calls
  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    const body = await request.json()
    const { channel, webhookUrl, recipients } = body as {
      channel: 'slack' | 'teams' | 'email'
      webhookUrl?: string
      recipients?: string
    }

    if (!channel) {
      return invalidRequest('Channel is required')
    }

    const notificationService = getNotificationService()
    const result = await notificationService.testNotification(channel, webhookUrl, recipients)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test notification sent successfully to ${channel}`,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send test notification',
        },
        { status: 400 }
      )
    }
  } catch (error) {
    logger.error('Test notification error', error as Error)
    return internalError(
      'Failed to send test notification',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}
