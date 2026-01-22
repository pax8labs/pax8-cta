import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { requireRole, logAuthFailure } from '@/lib/api-middleware'
import { AppRoles } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import * as webhookRepo from '@/lib/repositories/webhook-repository'
import { internalError } from '@/lib/errors'

const logger = createLogger('webhook-invocations')

/**
 * GET - Get webhook invocation history
 * Requires Admin role
 *
 * Query params:
 * - webhookId: Optional - filter by webhook ID
 * - limit: Optional - limit number of results (default 100)
 */
export async function GET(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/webhooks/invocations', 'forbidden', { action: 'list_invocations' })
    return session
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const webhookId = searchParams.get('webhookId')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    let invocations: webhookRepo.WebhookInvocation[]

    if (webhookId) {
      invocations = webhookRepo.getWebhookInvocations(webhookId, limit)
    } else {
      invocations = webhookRepo.getRecentInvocations(limit)
    }

    // Parse payload JSON for display (but truncate if too large)
    const invocationsWithParsedPayload = invocations.map(inv => {
      let parsedPayload
      try {
        parsedPayload = JSON.parse(inv.payload)
      } catch {
        parsedPayload = inv.payload
      }

      return {
        ...inv,
        payload: parsedPayload,
        // Truncate payload if too large for response
        payloadSize: inv.payload.length,
      }
    })

    return NextResponse.json({ invocations: invocationsWithParsedPayload })
  } catch (error) {
    logger.error('Failed to get webhook invocations', error as Error)
    return internalError(
      'Failed to get webhook invocations',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}
