import { NextRequest } from 'next/server'
import {
  isDemoMode,
  DEMO_TENANTS,
  DEPLOYMENT_STEPS,
  DeploymentStepId,
  MIN_STEP_DISPLAY_MS,
  generateMockDeployment,
} from '@agentsync/core'
import { demoDeployments } from '@/lib/demo-store'

export const dynamic = 'force-dynamic'

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
          // Get deployment info - check store first, then generate mock for legacy IDs
          let deployment = demoDeployments.get(deploymentId)

          if (!deployment) {
            // For legacy/historical deployments, generate mock and store
            const isInProgress = deploymentId.includes('progress')
            const isFailed = deploymentId.includes('fail')
            deployment = generateMockDeployment({
              id: deploymentId,
              status: isInProgress ? 'in_progress' : isFailed ? 'failed' : 'completed',
            })
            demoDeployments.set(deploymentId, deployment)
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

          // Only process tenants with pending status (not already completed/failed)
          const pendingTenants = deployment.tenantResults.filter(
            t => t.status === 'pending'
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

          // Map pending tenants to include environment URLs from DEMO_TENANTS
          const tenants = pendingTenants.map(t => {
            const demoTenant = DEMO_TENANTS.find(dt => dt.tenantId === t.tenantId)
            return {
              tenantId: t.tenantId,
              tenantName: t.tenantName,
              environmentUrl: demoTenant?.environmentUrl,
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
              finalDeployment.status = finalDeployment.failedTenants > 0 ? 'failed' : 'completed'
              finalDeployment.completedAt = new Date().toISOString()
              finalDeployment.updatedAt = new Date().toISOString()
              demoDeployments.set(deploymentId, finalDeployment)
            }
          }
        } else {
          // TODO: Hook into real deployment queue events
          // For now, send a message indicating real mode
          send({
            type: 'info',
            message: 'Real-time progress requires Redis queue connection',
            deploymentId,
          })
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

interface TenantInfo {
  tenantId: string
  tenantName: string
  environmentUrl?: string
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
  const maxConcurrent = 2

  for (let i = 0; i < tenants.length; i++) {
    const tenant = tenants[i]

    // Wait if we're at max concurrency
    while (activePromises.length >= maxConcurrent) {
      await Promise.race(activePromises)
    }

    // Stagger tenant starts
    if (i > 0) {
      await delay(300)
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

  // Update tenant status to in_progress in the store
  const deployment = demoDeployments.get(deploymentId)
  if (deployment) {
    const tenantResult = deployment.tenantResults.find(t => t.tenantId === tenant.tenantId)
    if (tenantResult) {
      tenantResult.status = 'in_progress'
      tenantResult.startedAt = startTime
    }
    demoDeployments.set(deploymentId, deployment)
  }

  // Send tenant started event
  send({
    type: 'tenant_started',
    deploymentId,
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    environmentUrl: tenant.environmentUrl,
    timestamp: startTime,
  })

  for (const stepId of stepOrder) {
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
    const baseDuration = stepDurations[stepId]
    const variation = Math.random() * 400 - 200 // +/- 200ms
    const duration = Math.max(MIN_STEP_DISPLAY_MS, baseDuration + variation)
    await delay(duration)

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

      // Update tenant status to failed in the store
      const deployment = demoDeployments.get(deploymentId)
      if (deployment) {
        const tenantResult = deployment.tenantResults.find(t => t.tenantId === tenant.tenantId)
        if (tenantResult) {
          tenantResult.status = 'failed'
          tenantResult.error = errorMsg
          tenantResult.completedAt = failTime
        }
        deployment.failedTenants = deployment.tenantResults.filter(t => t.status === 'failed').length
        demoDeployments.set(deploymentId, deployment)
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

  // Update tenant status to completed in the store
  const deploymentFinal = demoDeployments.get(deploymentId)
  if (deploymentFinal) {
    const tenantResult = deploymentFinal.tenantResults.find(t => t.tenantId === tenant.tenantId)
    if (tenantResult) {
      tenantResult.status = 'completed'
      tenantResult.completedAt = completeTime
    }
    deploymentFinal.completedTenants = deploymentFinal.tenantResults.filter(t => t.status === 'completed').length
    demoDeployments.set(deploymentId, deploymentFinal)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
      'Required dependencies not installed',
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
      'Custom connector authentication not configured',
    ],
    verifying: [
      'Post-deployment health check failed',
      'Copilot agent not responding to test query',
      'Required flows are in suspended state',
      'Knowledge base indexing incomplete',
      'Verification timeout: agent initialization took too long',
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
