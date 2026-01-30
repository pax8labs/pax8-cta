import { NextRequest } from 'next/server'
import {
  isDemoMode,
  DEMO_TENANTS,
  DEPLOYMENT_STEPS,
  DeploymentStepId,
  MIN_STEP_DISPLAY_MS,
  DeploymentStatus,
  TENANT_START_STAGGER_MS,
  MAX_CONCURRENT_DEMO_TENANTS,
  CANCELLATION_CHECK_INTERVAL_MS,
  SSE_HEARTBEAT_INTERVAL_MS,
  SSE_TIMEOUT_MS,
  formatRedisError,
} from '@agentsync/core'
import { demoDeployments, demoDeploymentsV2, demoBatches, resolveDeployment, demoDeployedAgents, DeployedAgent } from '@/lib/demo-store'
import { DeploymentQueueManager } from '@agentsync/worker'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

/**
 * SSE endpoint for real-time deployment progress updates
 *
 * Streams deployment step events with minimum display times
 * to ensure each step is visible and legible
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const deploymentId = params.id

  // Set up SSE response
  const encoder = new TextEncoder()
  let streamClosed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (streamClosed) return // Don't send if stream is closed
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (err) {
          // Stream may have been closed, ignore the error
          streamClosed = true
        }
      }

      try {
        if (isDemoMode()) {
          // Resolve deployment from store or generate for historical demo IDs
          const deployment = resolveDeployment(deploymentId)

          if (!deployment) {
            send({
              type: 'error',
              message: `Deployment ${deploymentId} not found`,
              deploymentId,
              timestamp: new Date().toISOString(),
            })
            return
          }

          if (!deployment.tenantResults || deployment.tenantResults.length === 0) {
            send({
              type: 'error',
              message: `Deployment ${deploymentId} has no tenant results`,
              deploymentId,
              timestamp: new Date().toISOString(),
            })
            return
          }

          // Check if deployment was cancelled
          if (deployment.status === 'cancelled') {
            send({
              type: 'info',
              message: `Deployment ${deploymentId} was cancelled`,
              deploymentId,
              timestamp: new Date().toISOString(),
            })
            return
          }

          // Only process tenants that haven't completed yet (pending or in_progress)
          // This handles cases where a previous SSE connection was interrupted
          const pendingTenants = deployment.tenantResults.filter(
            t => t.status === 'pending' || t.status === 'in_progress'
          )

          if (pendingTenants.length === 0) {
            send({
              type: 'info',
              message: `No pending tenants to deploy for ${deploymentId}`,
              deploymentId,
              timestamp: new Date().toISOString(),
            })
            return
          }

          // Map pending tenants to include environment URLs and URL overrides
          const tenants = pendingTenants.map(t => {
            const demoTenant = DEMO_TENANTS.find(dt => dt.tenantId === t.tenantId)
            return {
              tenantId: t.tenantId,
              tenantName: t.tenantName,
              environmentUrl: demoTenant?.environmentUrl,
              // Include URL override if available (for showing dependency URLs in logs)
              urlOverride: (t as { urlOverride?: { sharepoint: string; dynamicsCrm: string; onmicrosoft: string } }).urlOverride,
            }
          })

          // Simulate deployment progress for demo mode
          await simulateDemoDeployment(deploymentId, tenants, send)

          // Update overall deployment status when complete
          const finalDeployment = demoDeployments.get(deploymentId)
          if (finalDeployment) {
            const allDone = finalDeployment.tenantResults.every(
              t => t.status === 'completed' || t.status === 'failed'
            )
            if (allDone) {
              // Recalculate counts from actual tenant statuses to ensure consistency
              finalDeployment.completedTenants = finalDeployment.tenantResults.filter(t => t.status === 'completed').length
              finalDeployment.failedTenants = finalDeployment.tenantResults.filter(t => t.status === 'failed').length
              finalDeployment.status = finalDeployment.failedTenants > 0 ? 'failed' : 'completed'
              finalDeployment.completedAt = new Date().toISOString()
              finalDeployment.updatedAt = new Date().toISOString()
              demoDeployments.set(deploymentId, finalDeployment)
            }
          }
        } else {
          // Real mode: Connect to Redis queue and stream job events
          await streamRealDeploymentProgress(deploymentId, send)
        }

        // Send completion event
        send({
          type: 'deployment_completed',
          deploymentId,
          timestamp: new Date().toISOString(),
        })
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          deploymentId,
          timestamp: new Date().toISOString(),
        })
      } finally {
        streamClosed = true
        try {
          controller.close()
        } catch {
          // Controller may already be closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

interface UrlOverride {
  sharepoint: string
  dynamicsCrm: string
  onmicrosoft: string
  tenant?: string
}

interface TenantInfo {
  tenantId: string
  tenantName: string
  environmentUrl?: string
  urlOverride?: UrlOverride
}

/**
 * Simulate deployment progress for demo mode
 * Processes tenants with staggered starts and minimum display times
 */
async function simulateDemoDeployment(
  deploymentId: string,
  tenants: TenantInfo[],
  send: (data: object) => void
) {
  const stepOrder: DeploymentStepId[] = [
    'authenticating',
    'validating',
    'exporting',
    'uploading',
    'importing',
    'configuring',
    'verifying',
    'completing',
  ]

  const stepDurations: Record<DeploymentStepId, number> = {
    authenticating: 700,
    validating: 500,
    exporting: 1000,
    uploading: 1200,
    importing: 1800,
    configuring: 800,
    verifying: 600,
    completing: 400,
  }

  // Track all promises for final await, and active promises for concurrency control
  const allPromises: Promise<void>[] = []
  const activePromises: Promise<void>[] = []
  const maxConcurrent = MAX_CONCURRENT_DEMO_TENANTS

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i]

    // Check if deployment was cancelled before starting next tenant
    const currentDeployment = demoDeployments.get(deploymentId)
    if (currentDeployment?.status === 'cancelled') {
      send({
        type: 'deployment_cancelled',
        deploymentId,
        message: 'Deployment was cancelled',
        timestamp: new Date().toISOString(),
      })
      break
    }

    // Wait if we're at max concurrency
    while (activePromises.length >= maxConcurrent) {
      await Promise.race(activePromises)
    }

    // Stagger tenant starts
    if (i > 0) {
      await delay(TENANT_START_STAGGER_MS)
    }

    // Start processing tenant
    const promise = processTenant(deploymentId, tenant, stepOrder, stepDurations, send)
    allPromises.push(promise)
    activePromises.push(promise)

    // Remove from active array when done (but keep in allPromises)
    promise.finally(() => {
      const idx = activePromises.indexOf(promise)
      if (idx > -1) activePromises.splice(idx, 1)
    })
  }

  // Wait for ALL tenants to complete using the stable array
  await Promise.all(allPromises)
}

async function processTenant(
  deploymentId: string,
  tenant: TenantInfo,
  stepOrder: DeploymentStepId[],
  stepDurations: Record<DeploymentStepId, number>,
  send: (data: object) => void
) {
  // Determine if this tenant should fail (10% chance for demo)
  const shouldFail = Math.random() < 0.1
  const failStep = shouldFail ? stepOrder[Math.floor(Math.random() * 5) + 2] : null

  const startTime = new Date().toISOString()

  // Update tenant status to in_progress in the store (v1 legacy)
  const deployment = demoDeployments.get(deploymentId)
  if (deployment) {
    const tenantResult = deployment.tenantResults.find(t => t.tenantId === tenant.tenantId)
    if (tenantResult) {
      tenantResult.status = 'in_progress'
      tenantResult.startedAt = startTime
    }
    demoDeployments.set(deploymentId, deployment)
  }

  // Update v2 store
  updateV2DeploymentStatus(deploymentId, tenant.tenantId, 'in_progress')

  // Send tenant started event with URL override info for log display
  send({
    type: 'tenant_started',
    deploymentId,
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    environmentUrl: tenant.environmentUrl,
    urlOverride: tenant.urlOverride,
    timestamp: startTime,
  })

  for (const stepId of stepOrder) {
    // Check if deployment or tenant was cancelled mid-processing
    const currentDeployment = demoDeployments.get(deploymentId)
    if (currentDeployment?.status === 'cancelled') {
      send({
        type: 'tenant_cancelled',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        message: 'Deployment was cancelled',
        timestamp: new Date().toISOString(),
      })
      return
    }
    const currentTenant = currentDeployment?.tenantResults.find(t => t.tenantId === tenant.tenantId)
    if (currentTenant?.status === 'cancelled') {
      send({
        type: 'tenant_cancelled',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        message: 'Tenant deployment was cancelled',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Send step started event
    send({
      type: 'step_started',
      deploymentId,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      stepId,
      stepLabel: DEPLOYMENT_STEPS[stepId].label,
      stepDescription: DEPLOYMENT_STEPS[stepId].description,
      timestamp: new Date().toISOString(),
    })

    // Simulate step processing with minimum display time
    // Use cancellation-aware delay that checks every 200ms
    const baseDuration = stepDurations[stepId]
    const variation = Math.random() * 400 - 200 // +/- 200ms
    const duration = Math.max(MIN_STEP_DISPLAY_MS, baseDuration + variation)
    const wasCancelled = await delayWithCancellationCheck(duration, deploymentId, tenant.tenantId)

    if (wasCancelled) {
      send({
        type: 'tenant_cancelled',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        message: 'Deployment was cancelled',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Check if this step should fail
    if (stepId === failStep) {
      const failTime = new Date().toISOString()
      const stepError = getRandomStepError(stepId)
      const errorMsg = `Deployment failed at ${DEPLOYMENT_STEPS[stepId].label.toLowerCase()}: ${stepError}`

      send({
        type: 'step_failed',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        stepId,
        error: stepError,
        timestamp: failTime,
      })

      send({
        type: 'tenant_failed',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        error: errorMsg,
        timestamp: failTime,
      })

      // Update tenant status to failed in the store (v1 legacy)
      // But only if not cancelled - don't overwrite cancelled status
      const deployment = demoDeployments.get(deploymentId)
      if (deployment && deployment.status !== 'cancelled') {
        const tenantResult = deployment.tenantResults.find(t => t.tenantId === tenant.tenantId)
        if (tenantResult && tenantResult.status !== 'cancelled') {
          tenantResult.status = 'failed'
          tenantResult.error = errorMsg
          tenantResult.completedAt = failTime
        }
        deployment.failedTenants = deployment.tenantResults.filter(t => t.status === 'failed').length
        demoDeployments.set(deploymentId, deployment)

        // Update v2 store only if not cancelled
        updateV2DeploymentStatus(deploymentId, tenant.tenantId, 'failed', errorMsg)
      }

      return
    }

    // Send step completed event
    send({
      type: 'step_completed',
      deploymentId,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      stepId,
      timestamp: new Date().toISOString(),
    })
  }

  // Send tenant completed event
  const completeTime = new Date().toISOString()
  send({
    type: 'tenant_completed',
    deploymentId,
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    timestamp: completeTime,
  })

  // Update tenant status to completed in the store (v1 legacy)
  // But only if not cancelled - don't overwrite cancelled status
  const deploymentFinal = demoDeployments.get(deploymentId)
  if (deploymentFinal && deploymentFinal.status !== 'cancelled') {
    const tenantResult = deploymentFinal.tenantResults.find(t => t.tenantId === tenant.tenantId)
    if (tenantResult && tenantResult.status !== 'cancelled') {
      tenantResult.status = 'completed'
      tenantResult.completedAt = completeTime
    }
    deploymentFinal.completedTenants = deploymentFinal.tenantResults.filter(t => t.status === 'completed').length
    demoDeployments.set(deploymentId, deploymentFinal)

    // Update v2 store only if not cancelled
    updateV2DeploymentStatus(deploymentId, tenant.tenantId, 'completed')

    // Update demoDeployedAgents to track which agents are on which tenants
    // This is what the /api/agents endpoint reads to show deployment counts
    const solutionName = deploymentFinal.solutionName
    const solutionVersion = deploymentFinal.solutionVersion || '1.0.0'
    const existingAgents = demoDeployedAgents.get(tenant.tenantId) || []

    // Check if this agent is already deployed (update version) or add new
    const existingIndex = existingAgents.findIndex(a => a.solutionName === solutionName)
    const deployedAgent: DeployedAgent = {
      solutionName,
      version: solutionVersion,
      deployedAt: completeTime,
      deploymentId,
      status: 'active',
    }

    if (existingIndex >= 0) {
      // Update existing deployment
      existingAgents[existingIndex] = deployedAgent
    } else {
      // Add new deployment
      existingAgents.push(deployedAgent)
    }

    demoDeployedAgents.set(tenant.tenantId, existingAgents)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Delay that checks for cancellation periodically
 * Returns true if cancelled, false if completed normally
 */
async function delayWithCancellationCheck(
  ms: number,
  deploymentId: string,
  tenantId: string,
  checkInterval: number = CANCELLATION_CHECK_INTERVAL_MS
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    await delay(Math.min(checkInterval, ms - (Date.now() - start)))

    // Check for cancellation
    const deployment = demoDeployments.get(deploymentId)
    if (deployment?.status === 'cancelled') {
      return true // cancelled
    }
    const tenant = deployment?.tenantResults.find(t => t.tenantId === tenantId)
    if (tenant?.status === 'cancelled') {
      return true // cancelled
    }
  }
  return false // not cancelled
}

/**
 * Update v2 deployment status for a tenant
 */
function updateV2DeploymentStatus(
  batchId: string,
  tenantId: string,
  status: DeploymentStatus,
  error?: string
) {
  // Find the v2 deployment for this tenant in this batch
  const deployments = demoDeploymentsV2.getByBatchId(batchId)
  const deployment = deployments.find(d => d.tenantId === tenantId)

  if (deployment) {
    const now = new Date().toISOString()
    const updated = {
      ...deployment,
      status,
      updatedAt: now,
      ...(status === 'in_progress' && !deployment.startedAt ? { startedAt: now } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedAt: now } : {}),
      ...(error ? { error } : {}),
    }
    demoDeploymentsV2.set(deployment.id, updated)
  }

  // Update batch aggregates
  const batch = demoBatches.get(batchId)
  if (batch) {
    const allDeployments = demoDeploymentsV2.getByBatchId(batchId)
    const completed = allDeployments.filter(d => d.status === 'completed').length
    const failed = allDeployments.filter(d => d.status === 'failed').length
    const allDone = completed + failed === allDeployments.length

    demoBatches.set(batchId, {
      ...batch,
      completedDeployments: completed,
      failedDeployments: failed,
      status: allDone ? (failed > 0 ? 'failed' : 'completed') : 'in_progress',
      updatedAt: new Date().toISOString(),
      ...(allDone ? { completedAt: new Date().toISOString() } : {}),
    })
  }
}

/**
 * Generate realistic error messages based on the deployment step
 */
function getRandomStepError(stepId: DeploymentStepId): string {
  const errorsByStep: Record<DeploymentStepId, string[]> = {
    authenticating: [
      'GDAP authentication token expired',
      'Insufficient permissions for delegated admin access',
      'Multi-factor authentication challenge required',
      'Azure AD app registration credentials invalid',
      'Tenant admin consent not granted',
    ],
    validating: [
      'Environment does not have required Power Platform license',
      'Insufficient Dataverse capacity',
      'Environment is in admin mode',
      'SharePoint site not found or access denied',
      'Dynamics 365 environment unreachable',
      'Microsoft 365 tenant authentication failed',
      'Version conflict detected with existing solution',
    ],
    exporting: [
      'Solution export timeout after 120 seconds',
      'Source environment is undergoing maintenance',
      'Solution contains unsupported components',
      'Export failed: Dataverse connection lost',
      'Solution too large for single export operation',
    ],
    uploading: [
      'Network timeout during file transfer',
      'Target environment rejected upload',
      'File integrity check failed',
      'Storage quota exceeded in target environment',
      'Upload interrupted: connection reset by peer',
    ],
    importing: [
      'Import failed: missing connection reference',
      'Dependency resolution failed for msdyn_SchedulingCore',
      'Import timeout: operation took longer than 300 seconds',
      'Solution import blocked by organization policy',
      'Component already exists with different publisher',
    ],
    configuring: [
      'Connection reference setup failed: OAuth consent required',
      'Environment variable value not provided',
      'Flow activation failed: trigger not available',
      'Table permission configuration failed',
      'SharePoint connection failed: site collection not accessible',
      'Dynamics 365 binding failed: insufficient privileges',
      'Microsoft Graph API connection refused',
      'Custom connector authentication not configured',
    ],
    verifying: [
      'Post-deployment health check failed',
      'Copilot agent not responding to test query',
      'Required flows are in suspended state',
      'Knowledge base indexing incomplete',
      'Verification timeout: agent initialization took too long',
      'SharePoint integration test failed: document library not found',
      'Dynamics 365 connection test failed: API returned 403',
      'Microsoft 365 authentication loop detected',
    ],
    completing: [
      'Failed to update deployment manifest',
      'Cleanup of temporary resources failed',
      'Could not record deployment in audit log',
      'Final status sync failed',
      'Unexpected error during completion',
    ],
  }

  const errors = errorsByStep[stepId]
  return errors[Math.floor(Math.random() * errors.length)]
}

/**
 * Stream real deployment progress from BullMQ queue events
 *
 * Connects to the Redis-backed deployment queue and listens for:
 * - Job progress updates (percentage complete)
 * - Job completion events (success)
 * - Job failure events (with error details)
 *
 * Uses heartbeat to keep connection alive and timeout to prevent
 * hanging connections.
 */
async function streamRealDeploymentProgress(
  deploymentId: string,
  send: (data: object) => void
): Promise<void> {
  let queueManager: DeploymentQueueManager | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  try {
    // Initialize queue manager
    queueManager = new DeploymentQueueManager(REDIS_URL)
    const queueEvents = queueManager.getQueueEvents()

    send({
      type: 'info',
      message: 'Connected to deployment queue',
      deploymentId,
      timestamp: new Date().toISOString(),
    })

    // Set up heartbeat to keep SSE connection alive
    heartbeatInterval = setInterval(() => {
      send({
        type: 'heartbeat',
        deploymentId,
        timestamp: new Date().toISOString(),
      })
    }, SSE_HEARTBEAT_INTERVAL_MS)

    // Track completion state
    let allJobsCompleted = false
    const jobStatuses = new Map<string, 'pending' | 'active' | 'completed' | 'failed'>()

    // Get current deployment status to initialize tracking
    const currentStatus = await queueManager.getDeploymentStatus(deploymentId)
    if (!currentStatus) {
      send({
        type: 'error',
        message: `Deployment ${deploymentId} not found in queue`,
        deploymentId,
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Initialize job tracking from current status
    for (const tenant of currentStatus.tenantResults) {
      const jobId = `${deploymentId}-${tenant.tenantId}`
      jobStatuses.set(jobId, tenant.status === 'completed' ? 'completed' :
                             tenant.status === 'failed' ? 'failed' :
                             tenant.status === 'in_progress' ? 'active' : 'pending')

      // Send initial status for each tenant
      send({
        type: 'tenant_status',
        deploymentId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        status: tenant.status,
        error: tenant.error,
        timestamp: new Date().toISOString(),
      })
    }

    // Check if already complete
    if (currentStatus.status === 'completed' || currentStatus.status === 'failed') {
      send({
        type: 'deployment_status',
        deploymentId,
        status: currentStatus.status,
        completedTenants: currentStatus.completedTenants,
        failedTenants: currentStatus.failedTenants,
        totalTenants: currentStatus.totalTenants,
        timestamp: new Date().toISOString(),
      })
      return
    }

    // Create a promise that resolves when all jobs complete or timeout
    await new Promise<void>((resolve, reject) => {
      // Set up timeout
      timeoutTimer = setTimeout(() => {
        send({
          type: 'timeout',
          message: 'SSE connection timed out',
          deploymentId,
          timestamp: new Date().toISOString(),
        })
        resolve()
      }, SSE_TIMEOUT_MS)

      // Helper to check if all jobs are done
      const checkAllJobsCompleted = () => {
        const statuses = Array.from(jobStatuses.values())
        const allDone = statuses.every(s => s === 'completed' || s === 'failed')
        if (allDone && !allJobsCompleted) {
          allJobsCompleted = true
          resolve()
        }
      }

      // Listen for job progress
      queueEvents.on('progress', ({ jobId, data }) => {
        // Only process jobs for this deployment
        if (!jobId.startsWith(deploymentId)) return

        const tenantId = jobId.replace(`${deploymentId}-`, '')
        send({
          type: 'job_progress',
          deploymentId,
          tenantId,
          jobId,
          progress: data,
          timestamp: new Date().toISOString(),
        })
      })

      // Listen for job completion
      queueEvents.on('completed', async ({ jobId, returnvalue }) => {
        if (!jobId.startsWith(deploymentId)) return

        const tenantId = jobId.replace(`${deploymentId}-`, '')
        jobStatuses.set(jobId, 'completed')

        // Parse the return value - BullMQ returns it as a JSON string
        let result: { success: boolean; tenantName?: string; error?: string; durationMs?: number } | undefined
        try {
          result = returnvalue ? JSON.parse(returnvalue) : undefined
        } catch {
          // If parsing fails, treat as simple success
          result = { success: true }
        }

        send({
          type: result?.success ? 'tenant_completed' : 'tenant_failed',
          deploymentId,
          tenantId,
          tenantName: result?.tenantName,
          success: result?.success,
          error: result?.error,
          durationMs: result?.durationMs,
          timestamp: new Date().toISOString(),
        })

        checkAllJobsCompleted()
      })

      // Listen for job failure
      queueEvents.on('failed', ({ jobId, failedReason }) => {
        if (!jobId.startsWith(deploymentId)) return

        const tenantId = jobId.replace(`${deploymentId}-`, '')
        jobStatuses.set(jobId, 'failed')

        send({
          type: 'tenant_failed',
          deploymentId,
          tenantId,
          error: failedReason,
          timestamp: new Date().toISOString(),
        })

        checkAllJobsCompleted()
      })

      // Listen for job becoming active
      queueEvents.on('active', ({ jobId }) => {
        if (!jobId.startsWith(deploymentId)) return

        const tenantId = jobId.replace(`${deploymentId}-`, '')
        jobStatuses.set(jobId, 'active')

        send({
          type: 'tenant_started',
          deploymentId,
          tenantId,
          timestamp: new Date().toISOString(),
        })
      })

      // Initial check in case all jobs already completed
      checkAllJobsCompleted()
    })

    // Final status update
    const finalStatus = await queueManager.getDeploymentStatus(deploymentId)
    if (finalStatus) {
      send({
        type: 'deployment_status',
        deploymentId,
        status: finalStatus.status,
        completedTenants: finalStatus.completedTenants,
        failedTenants: finalStatus.failedTenants,
        totalTenants: finalStatus.totalTenants,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error) {
    // Provide helpful error message for Redis connection issues
    const errorMessage = error instanceof Error
      ? formatRedisError(error, REDIS_URL)
      : 'Unknown error connecting to deployment queue'

    send({
      type: 'error',
      message: errorMessage,
      deploymentId,
      timestamp: new Date().toISOString(),
    })
  } finally {
    // Cleanup
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
    }
    if (queueManager) {
      await queueManager.close()
    }
  }
}
