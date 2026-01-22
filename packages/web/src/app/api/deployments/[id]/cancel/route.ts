import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments, demoBatches, demoDeploymentsV2 } from '@/lib/demo-store'
import { requireRoles, logAuthFailure } from '@/lib/api-middleware'
import { AppRoles } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { deploymentRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { notFound, invalidRequest, internalError } from '@/lib/errors'
import { isRedisConnectionError, createQueueUnavailableResponse, safelyCloseQueueManager } from '@/lib/queue-error-handler'

const logger = createLogger('deployment-cancel')
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * Cancel pending tenant deployments for a specific deployment
 * Requires Admin or Deployer role
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Require Admin or Deployer role
  const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER])
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}/cancel`, 'forbidden', { action: 'cancel_deployment' })
    return session
  }

  // Apply rate limiting
  const rateLimitResult = await deploymentRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    // Demo mode handling
    if (isDemoMode()) {
      const deployment = demoDeployments.get(params.id)

      if (!deployment) {
        return notFound('deployment', params.id)
      }

      if (deployment.status !== 'in_progress' && deployment.status !== 'pending') {
        return invalidRequest('Can only cancel in-progress or pending deployments')
      }

      // Count pending tenants
      const pendingCount = deployment.tenantResults.filter(
        t => t.status === 'pending' || t.status === 'in_progress'
      ).length

      const now = new Date().toISOString()

      // Update deployment status to cancelled
      deployment.status = 'cancelled'
      deployment.updatedAt = now

      // Mark pending/in_progress tenants as cancelled
      deployment.tenantResults.forEach(t => {
        if (t.status === 'pending' || t.status === 'in_progress') {
          t.status = 'cancelled'
          t.error = 'Deployment cancelled by user'
        }
      })

      // Recalculate counts
      deployment.failedTenants = deployment.tenantResults.filter(t => t.status === 'failed' || t.status === 'cancelled').length

      demoDeployments.set(params.id, deployment)

      // Also update v2 stores (batch and individual deployments)
      const batch = demoBatches.get(params.id)
      if (batch) {
        batch.status = 'cancelled'
        batch.updatedAt = now
        demoBatches.set(params.id, batch)
      }

      // Update v2 deployments
      const v2Deployments = demoDeploymentsV2.getByBatchId(params.id)
      for (const v2Deploy of v2Deployments) {
        if (v2Deploy.status === 'pending' || v2Deploy.status === 'in_progress') {
          demoDeploymentsV2.set(v2Deploy.id, {
            ...v2Deploy,
            status: 'cancelled',
            error: 'Deployment cancelled by user',
            updatedAt: now,
          })
        }
      }

      return NextResponse.json({
        demoMode: true,
        message: `Deployment cancelled. ${pendingCount} pending deployment(s) stopped.`,
        cancelledCount: pendingCount,
        status: 'cancelled',
      })
    }

    // Handle Redis connection failures gracefully
    let queueManager: DeploymentQueueManager | null = null
    try {
      queueManager = new DeploymentQueueManager(REDIS_URL)
      const queue = queueManager.getTenantDeploymentQueue()

      // Get waiting, delayed, AND active jobs for this deployment
      const allJobs = await queue.getJobs(['waiting', 'delayed', 'active'])
      const jobsToCancel = allJobs.filter(
        (job) => job.data.deploymentId === params.id
      )

      if (jobsToCancel.length === 0) {
        await queueManager.close()
        return invalidRequest('No jobs to cancel')
      }

      // Cancel jobs: remove waiting/delayed, fail active
      let cancelledCount = 0
      for (const job of jobsToCancel) {
        try {
          const state = await job.getState()

          if (state === 'waiting' || state === 'delayed') {
            // Remove jobs that haven't started yet
            await job.remove()
            cancelledCount++
            logger.info('Removed pending job', { jobId: job.id, deploymentId: params.id })
          } else if (state === 'active') {
            // Move active jobs to failed state with cancellation message
            await job.moveToFailed(
              new Error('DEPLOYMENT_CANCELLED: Deployment cancelled by user'),
              '', // token - not used
              true // Skip attempt counter
            )
            cancelledCount++
            logger.info('Cancelled active job', { jobId: job.id, deploymentId: params.id })
          }
        } catch (err) {
          logger.warn('Could not cancel job', { jobId: job.id, error: err })
        }
      }

      await queueManager.close()

      return NextResponse.json({
        message: `Cancelled ${cancelledCount} deployment(s)`,
        cancelledCount,
      })
    } catch (error) {
      // Ensure queue manager is closed even on error
      await safelyCloseQueueManager(queueManager)

      // Check if this is a Redis connection error
      if (isRedisConnectionError(error)) {
        logger.error('Redis connection failed during cancel', { error, deploymentId: params.id })
        return createQueueUnavailableResponse(error)
      }

      // Re-throw non-Redis errors to outer catch
      throw error
    }
  } catch (error) {
    logger.error('Cancel deployment error', error as Error)
    return internalError('Failed to cancel deployment')
  }
}
