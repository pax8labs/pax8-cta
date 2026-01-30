import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, RollbackService, TokenManager, DataverseClient } from '@agentsync/core'
import { demoDeployments, demoBatches, demoDeploymentsV2 } from '@/lib/demo-store'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import * as snapshotRepo from '@/lib/repositories/snapshot-repository'
import * as auditRepo from '@/lib/repositories/audit-repository'

// Load tenant config for authentication
async function loadTenantConfig() {
  try {
    const configPath = process.env.AGENTSYNC_CONFIG || './config/tenants.yaml'
    const { loadConfig } = await import('@agentsync/core')
    return await loadConfig(configPath)
  } catch {
    return null
  }
}

/**
 * Rollback a deployment (undo deployed solutions)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Demo mode handling
    if (isDemoMode()) {
      // Try the legacy store (DeploymentJob)
      const deployment = demoDeployments.get(id)

      if (!deployment) {
        return NextResponse.json(
          { error: 'Deployment not found' },
          { status: 404 }
        )
      }

      if (deployment.status !== 'completed' && deployment.status !== 'failed') {
        return NextResponse.json(
          { error: 'Can only rollback completed or failed deployments' },
          { status: 400 }
        )
      }

      // Update deployment status to rolling_back
      deployment.status = 'rolling_back'
      deployment.updatedAt = new Date().toISOString()

      // Update in the store
      demoDeployments.set(id, deployment)

      // Also update database if we have a record
      try {
        deploymentRepo.updateBatchStatus(id, 'rolling_back')
      } catch {
        // Ignore if not in database
      }

      // Simulate rollback completion after a delay
      setTimeout(() => {
        const dep = demoDeployments.get(id)

        if (dep && dep.status === 'rolling_back') {
          dep.status = 'rolled_back'
          dep.updatedAt = new Date().toISOString()
          // Reset tenant statuses
          if (dep.tenantResults) {
            dep.tenantResults.forEach((t: { status: string }) => {
              if (t.status === 'completed') {
                t.status = 'rolled_back'
              }
            })
          }
          const rolledBackCount = dep.completedTenants || 0
          dep.completedTenants = 0

          demoDeployments.set(id, dep)

          // Update database
          try {
            deploymentRepo.updateBatchStatus(id, 'rolled_back', { completed: 0 })
          } catch {
            // Ignore if not in database
          }

          // Log rollback completion
          auditRepo.logRollbackAction('rollback.completed', id)
        }
      }, 3000) // 3 second simulated rollback

      // Log rollback initiation
      auditRepo.logRollbackAction('rollback.initiated', id)

      return NextResponse.json({
        demoMode: true,
        message: `Rolling back deployment from ${deployment.completedTenants || 0} tenant(s)`,
        deploymentId: id,
      })
    }

    // Production mode - use RollbackService
    const config = await loadTenantConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration not found. Please ensure tenants.yaml is configured.' },
        { status: 500 }
      )
    }

    // Get deployment from database
    const batch = deploymentRepo.getBatch(id)
    if (!batch) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      )
    }

    if (batch.status !== 'completed' && batch.status !== 'failed') {
      return NextResponse.json(
        { error: 'Can only rollback completed or failed deployments' },
        { status: 400 }
      )
    }

    // Get individual deployments for this batch
    const deployments = deploymentRepo.getDeploymentsByBatch(id)
    const completedDeployments = deployments.filter(d => d.status === 'completed')

    if (completedDeployments.length === 0) {
      return NextResponse.json(
        { error: 'No completed deployments to rollback' },
        { status: 400 }
      )
    }

    // Update batch status to rolling_back
    deploymentRepo.updateBatchStatus(id, 'rolling_back')

    // Log rollback start
    auditRepo.logRollbackAction('rollback.initiated', id)

    // Initialize services
    const rollbackService = new RollbackService(process.env.SNAPSHOTS_DIR || './snapshots')

    // Get client secret from environment variable
    const clientSecret = process.env.AZURE_CLIENT_SECRET
    if (!clientSecret) {
      return NextResponse.json(
        { error: 'AZURE_CLIENT_SECRET environment variable is required for production rollback' },
        { status: 500 }
      )
    }

    const tokenManager = new TokenManager({
      clientId: config.partner.clientId,
      clientSecret,
      tenantId: config.partner.tenantId,
    })

    const results: Array<{
      tenantId: string
      tenantName: string
      success: boolean
      error?: string
      restoredVersion?: string
    }> = []

    // Rollback each completed tenant
    for (const deployment of completedDeployments) {
      try {
        // Find snapshot for this tenant/solution
        const snapshot = snapshotRepo.getLatestSnapshot(deployment.tenantId, deployment.solutionName)

        if (!snapshot) {
          results.push({
            tenantId: deployment.tenantId,
            tenantName: deployment.tenantName,
            success: false,
            error: 'No snapshot available for rollback',
          })
          deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', 'No snapshot available for rollback')
          continue
        }

        // Check that deployment has environment URL
        if (!deployment.environmentUrl) {
          results.push({
            tenantId: deployment.tenantId,
            tenantName: deployment.tenantName,
            success: false,
            error: 'Deployment missing environment URL',
          })
          deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', 'Deployment missing environment URL')
          continue
        }

        // Get tenant config to authenticate
        const tenantConfig = config.tenants.find(t => t.tenantId === deployment.tenantId)
        if (!tenantConfig) {
          results.push({
            tenantId: deployment.tenantId,
            tenantName: deployment.tenantName,
            success: false,
            error: 'Tenant not found in configuration',
          })
          deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', 'Tenant not found in configuration')
          continue
        }

        // Create DataverseClient with the token manager
        const client = new DataverseClient({
          environmentUrl: deployment.environmentUrl,
          tokenManager,
        })

        // Perform rollback
        const result = await rollbackService.rollback(snapshot.id, client, {
          timeout: config.settings?.rollback?.rollbackTimeout || '10m',
        })

        if (result.success) {
          results.push({
            tenantId: deployment.tenantId,
            tenantName: deployment.tenantName,
            success: true,
            restoredVersion: result.restoredVersion,
          })
          deploymentRepo.updateDeploymentStatus(deployment.id, 'rolled_back')
        } else {
          results.push({
            tenantId: deployment.tenantId,
            tenantName: deployment.tenantName,
            success: false,
            error: result.error,
          })
          deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', result.error)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during rollback'
        results.push({
          tenantId: deployment.tenantId,
          tenantName: deployment.tenantName,
          success: false,
          error: errorMessage,
        })
        deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', errorMessage)
      }
    }

    // Update batch status based on results
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    if (failCount === 0) {
      deploymentRepo.updateBatchStatus(id, 'rolled_back', { completed: 0 })
    } else if (successCount === 0) {
      deploymentRepo.updateBatchStatus(id, 'failed', { failed: failCount })
    } else {
      // Partial rollback - mark as rolled_back but note failures
      deploymentRepo.updateBatchStatus(id, 'rolled_back', { completed: 0, failed: failCount })
    }

    // Log rollback completion
    auditRepo.logRollbackAction(
      failCount === 0 ? 'rollback.completed' : 'rollback.failed',
      id,
      failCount > 0 ? { error: `${failCount} tenant(s) failed to rollback` } : undefined
    )

    return NextResponse.json({
      demoMode: false,
      message: `Rolled back ${successCount} tenant(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
      deploymentId: id,
      results,
    })
  } catch (error) {
    console.error('Rollback deployment error:', error)

    // Log error
    auditRepo.logRollbackAction('rollback.failed', id, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: 'Failed to rollback deployment' },
      { status: 500 }
    )
  }
}
