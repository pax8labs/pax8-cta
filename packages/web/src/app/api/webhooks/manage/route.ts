import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { randomUUID } from 'crypto'
import { requireRole, logAuthFailure } from '@/lib/api-middleware'
import { AppRoles } from '@/lib/auth'
import { apiRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createLogger } from '@/lib/logger'
import { parseAndValidate, createWebhookSchema, updateWebhookSchema } from '@/lib/validation'
import { validationError } from '@/lib/errors'
import * as webhookRepo from '@/lib/repositories/webhook-repository'
import { writeAuditLog } from '@/lib/repositories/audit-repository'

const logger = createLogger('webhook-manage')

/**
 * GET - List all webhook configurations
 * Requires Admin role
 */
export async function GET(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/webhooks/manage', 'forbidden', { action: 'list_webhooks' })
    return session
  }

  try {
    const webhooks = webhookRepo.listWebhooks()

    // Get recent invocations for each webhook
    const webhooksWithStats = webhooks.map(webhook => {
      const invocations = webhookRepo.getWebhookInvocations(webhook.id, 10)
      const successCount = invocations.filter(i => i.status === 'success').length
      const failedCount = invocations.filter(i => i.status === 'failed' || i.status === 'invalid_signature').length

      return {
        ...webhook,
        recentInvocations: invocations.length,
        successRate: invocations.length > 0
          ? Math.round((successCount / invocations.length) * 100)
          : null,
      }
    })

    return NextResponse.json({ webhooks: webhooksWithStats })
  } catch (error) {
    logger.error('Failed to list webhooks', error as Error)
    return NextResponse.json(
      { error: 'Failed to list webhooks' },
      { status: 500 }
    )
  }
}

/**
 * POST - Create a new webhook configuration
 * Requires Admin role
 */
export async function POST(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/webhooks/manage', 'forbidden', { action: 'create_webhook' })
    return session
  }

  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    const validation = await parseAndValidate(request, createWebhookSchema)

    if (!validation.success) {
      return validationError(
        'Invalid request',
        validation.errors?.map(e => `${e.path}: ${e.message}`)
      )
    }

    const data = validation.data!

    const webhookId = randomUUID()
    const secret = webhookRepo.generateWebhookSecret()
    const now = new Date().toISOString()

    const webhook: webhookRepo.Webhook = {
      id: webhookId,
      name: data.name,
      secret,
      enabled: true,
      createdAt: now,
      createdBy: session.user.email || 'unknown',
      updatedAt: now,
      lastUsedAt: null,
    }

    webhookRepo.createWebhook(webhook)

    logger.info('Webhook created', {
      webhookId,
      name: data.name,
      createdBy: session.user.email,
    })

    // Audit log webhook creation
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: 'webhook.created',
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
      resourceType: 'webhook',
      resourceId: webhookId,
      resourceName: data.name,
      details: {
        createdBy: session.user.email,
      },
      success: true,
    })

    return NextResponse.json({
      webhook: {
        ...webhook,
        // Return the secret only on creation
        secret,
      },
      message: 'Webhook created successfully. Save the secret - it will not be shown again.',
    })
  } catch (error) {
    logger.error('Failed to create webhook', error as Error)
    return NextResponse.json(
      {
        error: 'Failed to create webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update webhook configuration
 * Requires Admin role
 */
export async function PATCH(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/webhooks/manage', 'forbidden', { action: 'update_webhook' })
    return session
  }

  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const webhookId = searchParams.get('id')

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      )
    }

    const webhook = webhookRepo.getWebhookById(webhookId)
    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      )
    }

    const validation = await parseAndValidate(request, updateWebhookSchema)

    if (!validation.success) {
      return validationError(
        'Invalid request',
        validation.errors?.map(e => `${e.path}: ${e.message}`)
      )
    }

    const data = validation.data!

    const updates: Partial<webhookRepo.Webhook> = {}

    if (data.name !== undefined) {
      updates.name = data.name
    }

    if (data.enabled !== undefined) {
      updates.enabled = data.enabled
    }

    let newSecret: string | undefined

    if (data.regenerateSecret) {
      newSecret = webhookRepo.generateWebhookSecret()
      updates.secret = newSecret
    }

    webhookRepo.updateWebhook(webhookId, updates)

    logger.info('Webhook updated', {
      webhookId,
      updates: Object.keys(updates),
      updatedBy: session.user.email,
    })

    // Audit log webhook update
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: 'webhook.updated',
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
      resourceType: 'webhook',
      resourceId: webhookId,
      resourceName: webhook.name,
      details: {
        updates: Object.keys(updates),
        secretRegenerated: data.regenerateSecret || false,
        updatedBy: session.user.email,
      },
      success: true,
    })

    return NextResponse.json({
      message: 'Webhook updated successfully',
      // Return the new secret if it was regenerated
      ...(newSecret ? { newSecret } : {}),
    })
  } catch (error) {
    logger.error('Failed to update webhook', error as Error)
    return NextResponse.json(
      {
        error: 'Failed to update webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete a webhook configuration
 * Requires Admin role
 */
export async function DELETE(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/webhooks/manage', 'forbidden', { action: 'delete_webhook' })
    return session
  }

  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const webhookId = searchParams.get('id')

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      )
    }

    const webhook = webhookRepo.getWebhookById(webhookId)
    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      )
    }

    webhookRepo.deleteWebhook(webhookId)

    logger.info('Webhook deleted', {
      webhookId,
      name: webhook.name,
      deletedBy: session.user.email,
    })

    // Audit log webhook deletion
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: 'webhook.deleted',
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
      resourceType: 'webhook',
      resourceId: webhookId,
      resourceName: webhook.name,
      details: {
        deletedBy: session.user.email,
      },
      success: true,
    })

    return NextResponse.json({
      message: 'Webhook deleted successfully',
    })
  } catch (error) {
    logger.error('Failed to delete webhook', error as Error)
    return NextResponse.json(
      {
        error: 'Failed to delete webhook',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
