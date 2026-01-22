import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { extractWebhookHeaders, validateWebhookSignature } from '@/lib/webhook-security'
import { webhookRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createLogger } from '@/lib/logger'
import * as webhookRepo from '@/lib/repositories/webhook-repository'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import { invalidRequest, unauthorized, notFound, internalError } from '@/lib/errors'

const logger = createLogger('webhook-status')

/**
 * Webhook endpoint for checking deployment status
 *
 * Security:
 * - Same HMAC-SHA256 signature validation as /deploy
 * - Rate limiting (100 requests/hour per webhook)
 *
 * Query params:
 * - batchId: The deployment batch ID returned from /deploy
 */
export async function GET(request: NextRequest) {
  try {
    // Get batchId from query params
    const searchParams = request.nextUrl.searchParams
    const batchId = searchParams.get('batchId')

    if (!batchId) {
      return invalidRequest('batchId query parameter is required')
    }

    // Validate webhook authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header')
      return unauthorized('Missing or invalid authorization header')
    }

    const webhookSecret = authHeader.substring(7)
    const webhook = webhookRepo.getWebhookBySecret(webhookSecret)

    if (!webhook) {
      logger.warn('Invalid webhook secret')
      return unauthorized('Invalid webhook secret')
    }

    // Validate signature (for GET requests, the body is empty)
    const { signature, timestamp } = extractWebhookHeaders(request.headers)
    const validationResult = validateWebhookSignature('', signature, timestamp, webhookSecret)

    if (!validationResult.valid) {
      logger.warn('Invalid webhook signature', {
        webhookId: webhook.id,
        error: validationResult.error
      })

      return unauthorized(`Signature validation failed: ${validationResult.error}`)
    }

    // Apply rate limiting
    const rateLimitResult = await webhookRateLimit(request, webhook.id)
    if (rateLimitResult && !rateLimitResult.success) {
      logger.warn('Webhook rate limited', { webhookId: webhook.id })
      return createRateLimitResponse(rateLimitResult.reset)
    }

    // Get batch status
    const batch = deploymentRepo.getBatch(batchId)
    if (!batch) {
      return notFound('Deployment batch', batchId)
    }

    // Get individual deployment statuses
    const deployments = deploymentRepo.getDeploymentsByBatch(batchId)

    // Calculate progress
    const progress = batch.totalDeployments > 0
      ? Math.round((batch.completedDeployments / batch.totalDeployments) * 100)
      : 0

    const response = {
      batchId: batch.id,
      status: batch.status,
      solutionName: batch.solutionName,
      solutionVersion: batch.solutionVersion,
      progress,
      total: batch.totalDeployments,
      completed: batch.completedDeployments,
      failed: batch.failedDeployments,
      inProgress: batch.totalDeployments - batch.completedDeployments - batch.failedDeployments,
      createdAt: batch.createdAt,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      deployments: deployments.map(d => ({
        id: d.id,
        tenantId: d.tenantId,
        tenantName: d.tenantName,
        status: d.status,
        error: d.error,
        startedAt: d.startedAt,
        completedAt: d.completedAt,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Webhook status error', error as Error)
    return internalError(
      'Failed to get status',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}
