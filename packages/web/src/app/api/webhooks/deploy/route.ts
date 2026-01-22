import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { randomUUID } from 'crypto'
import { loadConfig, TenantConfig, isDemoMode, DEMO_TENANTS, Deployment, DeploymentBatch, DeploymentStatus } from '@agentsync/core'
import { resolve } from 'path'
import { webhookPayloadSchema, validate } from '@/lib/validation'
import { extractWebhookHeaders, validateWebhookSignature } from '@/lib/webhook-security'
import { webhookRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { createLogger } from '@/lib/logger'
import { unauthorized, validationError, notFound, internalError, ErrorCodes, createErrorResponse } from '@/lib/errors'
import * as webhookRepo from '@/lib/repositories/webhook-repository'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import { demoBatches, demoDeploymentsV2 } from '@/lib/demo-store'

const logger = createLogger('webhook-deploy')
const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * Webhook endpoint for triggering deployments from CI/CD systems
 *
 * Security:
 * - HMAC-SHA256 signature validation (x-webhook-signature header)
 * - Timestamp validation to prevent replay attacks (x-webhook-timestamp header)
 * - Rate limiting (100 requests/hour per webhook)
 *
 * Payload:
 * {
 *   "solution": "AgentName",
 *   "version": "1.0.0",  // optional
 *   "tenants": ["tenant-id-1", "tenant-id-2"] | "all",
 *   "metadata": {  // optional
 *     "commit": "abc123",
 *     "branch": "main",
 *     "triggeredBy": "github-actions"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const invocationId = randomUUID()

  // Extract IP and User-Agent for logging
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                    request.headers.get('x-real-ip') ||
                    null
  const userAgent = request.headers.get('user-agent') || null

  try {
    // Read raw body for signature validation
    const rawBody = await request.text()
    const { signature, timestamp } = extractWebhookHeaders(request.headers)

    // Find webhook by signature (we use the secret from the Authorization header)
    // Format: Bearer <webhook-secret>
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header', { invocationId })
      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: null,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: 'Missing or invalid authorization header',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return unauthorized('Missing or invalid authorization header. Use "Bearer <webhook-secret>" format.')
    }

    const webhookSecret = authHeader.substring(7) // Remove "Bearer "
    const webhook = webhookRepo.getWebhookBySecret(webhookSecret)

    if (!webhook) {
      logger.warn('Invalid webhook secret', { invocationId })
      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: null,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: 'Invalid webhook secret',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return createErrorResponse(
        ErrorCodes.WEBHOOK_NOT_FOUND,
        'Webhook not found or disabled',
        401
      )
    }

    // Validate signature
    const validationResult = validateWebhookSignature(rawBody, signature, timestamp, webhookSecret)
    if (!validationResult.valid) {
      logger.warn('Invalid webhook signature', {
        invocationId,
        webhookId: webhook.id,
        error: validationResult.error
      })

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: webhook.id,
        payload: rawBody,
        signature,
        status: 'invalid_signature',
        batchId: null,
        errorMessage: `Signature validation failed: ${validationResult.error}`,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return createErrorResponse(
        ErrorCodes.INVALID_TOKEN,
        'Webhook signature validation failed',
        401,
        { reason: validationResult.error }
      )
    }

    // Apply rate limiting per webhook
    const rateLimitResult = await webhookRateLimit(request, webhook.id)
    if (rateLimitResult && !rateLimitResult.success) {
      logger.warn('Webhook rate limited', { invocationId, webhookId: webhook.id })

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: webhook.id,
        payload: rawBody,
        signature,
        status: 'rate_limited',
        batchId: null,
        errorMessage: 'Rate limit exceeded',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return createRateLimitResponse(rateLimitResult.reset)
    }

    // Parse and validate payload
    let payload: {
      solution: string
      version?: string
      tenants: string[] | 'all'
      metadata?: Record<string, unknown>
    }

    try {
      const parsedBody = JSON.parse(rawBody)
      const validation = validate(webhookPayloadSchema, parsedBody)

      if (!validation.success) {
        throw new Error(validation.errors?.map(e => e.message).join(', ') || 'Validation failed')
      }

      payload = validation.data!
    } catch (error) {
      logger.error('Invalid webhook payload', error as Error, { invocationId, webhookId: webhook.id })

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: webhook.id,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: `Invalid payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return validationError(
        'Invalid webhook payload',
        { details: error instanceof Error ? error.message : 'Invalid JSON or schema validation failed' }
      )
    }

    // Determine target tenants
    let targetTenants: TenantConfig[]

    if (isDemoMode()) {
      // Demo mode
      if (payload.tenants === 'all') {
        targetTenants = DEMO_TENANTS.filter(t => t.enabled)
      } else {
        targetTenants = DEMO_TENANTS.filter(
          t => t.enabled && payload.tenants.includes(t.tenantId)
        )
      }
    } else {
      // Real mode
      const config = await loadConfig(resolve(CONFIG_PATH))

      if (payload.tenants === 'all') {
        targetTenants = config.tenants.filter(t => t.enabled)
      } else {
        targetTenants = config.tenants.filter(
          t => t.enabled && payload.tenants.includes(t.tenantId)
        )
      }
    }

    if (targetTenants.length === 0) {
      logger.warn('No valid tenants found', { invocationId, webhookId: webhook.id, payload })

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: webhook.id,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: 'No valid tenants found for deployment',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return createErrorResponse(
        ErrorCodes.TENANT_NOT_FOUND,
        'No enabled tenants found for deployment',
        400,
        { requestedTenants: payload.tenants }
      )
    }

    // Create deployment batch
    const batchId = randomUUID()
    const now = new Date().toISOString()

    // Build triggered_by string from metadata
    const triggeredBy = payload.metadata?.triggeredBy
      ? `webhook:${payload.metadata.triggeredBy}`
      : `webhook:${webhook.name}`

    const batch: DeploymentBatch = {
      id: batchId,
      solutionName: payload.solution,
      solutionVersion: payload.version,
      solutionPath: '', // Webhook deployments reference solution by name, not file path
      status: 'pending' as DeploymentStatus,
      totalDeployments: targetTenants.length,
      completedDeployments: 0,
      failedDeployments: 0,
      triggeredBy: 'webhook',
      createdAt: now,
      updatedAt: now,
    }

    // Create individual deployments
    const deployments: Deployment[] = targetTenants.map((t, index) => ({
      id: `${batchId}-${index}`,
      batchId,
      solutionName: payload.solution,
      solutionVersion: payload.version,
      solutionPath: '', // Webhook deployments reference solution by name
      tenantId: t.tenantId,
      tenantName: t.name,
      environmentUrl: t.environmentUrl,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      attemptNumber: 1,
      triggeredBy: 'webhook',
    }))

    // Persist to database
    try {
      deploymentRepo.createBatch(batch)
      for (const deployment of deployments) {
        deploymentRepo.createDeployment(deployment)
      }

      // Also store in demo stores if demo mode
      if (isDemoMode()) {
        demoBatches.set(batchId, batch)
        for (const deployment of deployments) {
          demoDeploymentsV2.set(deployment.id, deployment)
        }
      }

      logger.info('Deployment batch created via webhook', {
        invocationId,
        webhookId: webhook.id,
        batchId,
        solutionName: payload.solution,
        tenantCount: targetTenants.length,
      })
    } catch (error) {
      logger.error('Failed to create deployment batch', error as Error, {
        invocationId,
        webhookId: webhook.id,
      })

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: webhook.id,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: `Failed to create deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })

      return createErrorResponse(
        ErrorCodes.DEPLOYMENT_FAILED,
        'Failed to create deployment batch',
        500,
        process.env.NODE_ENV === 'development' && error instanceof Error
          ? { error: error.message }
          : undefined
      )
    }

    // Update webhook last used timestamp
    webhookRepo.updateWebhookLastUsed(webhook.id)

    // Record successful invocation
    await webhookRepo.createWebhookInvocation({
      id: invocationId,
      webhookId: webhook.id,
      payload: rawBody,
      signature,
      status: 'success',
      batchId,
      errorMessage: null,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    })

    const processingTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      deploymentId: batchId,
      batchId,
      tenantCount: targetTenants.length,
      solutionName: payload.solution,
      solutionVersion: payload.version,
      processingTimeMs: processingTime,
      message: 'Deployment created successfully via webhook',
    })
  } catch (error) {
    logger.error('Webhook deployment error', error as Error, { invocationId })

    // Try to record the failed invocation
    try {
      const rawBody = await request.clone().text().catch(() => '')
      const { signature } = extractWebhookHeaders(request.headers)

      await webhookRepo.createWebhookInvocation({
        id: invocationId,
        webhookId: null,
        payload: rawBody,
        signature,
        status: 'failed',
        batchId: null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent,
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      })
    } catch {
      // Failed to log - continue
    }

    return internalError(
      'Failed to process webhook request',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message, invocationId }
        : { invocationId }
    )
  }
}
