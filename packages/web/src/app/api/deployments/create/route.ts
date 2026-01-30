import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, join } from 'path'
import { loadConfig, TenantConfig, isDemoMode, DEMO_TENANTS, Deployment, DeploymentBatch, DeploymentStatus, formatRedisError } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments, demoDeploymentsV2, demoBatches } from '@/lib/demo-store'
import { serverTrackDeployment, serverTrackError } from '@/lib/posthog-server'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import * as approvalRepo from '@/lib/repositories/approval-repository'
import { logDeploymentAction, logApprovalAction } from '@/lib/repositories/audit-repository'
import { requireRoles, logAuthFailure } from '@/lib/api-middleware'
import { AppRoles } from '@/lib/auth'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const SOLUTIONS_DIR = process.env.SOLUTIONS_DIR || './solutions'

export async function POST(request: NextRequest) {
  // Require Admin or Deployer role
  const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER])
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/deployments/create', 'forbidden', { action: 'create_deployment' })
    return session
  }

  try {
    const formData = await request.formData()
    const solutionFile = formData.get('solution') as File | null
    const tenantIdsJson = formData.get('tenantIds') as string | null
    const urlOverridesJson = formData.get('urlOverrides') as string | null

    // Parse URL overrides if provided (for agents with URL templates)
    let urlOverrides: Record<string, { tenant: string; sharepoint: string; dynamicsCrm: string; onmicrosoft: string }> | undefined
    if (urlOverridesJson) {
      try {
        urlOverrides = JSON.parse(urlOverridesJson)
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Validate inputs
    if (!solutionFile) {
      return NextResponse.json(
        { error: 'Solution file is required' },
        { status: 400 }
      )
    }

    if (!tenantIdsJson) {
      return NextResponse.json(
        { error: 'Tenant IDs are required' },
        { status: 400 }
      )
    }

    let tenantIds: string[]
    try {
      tenantIds = JSON.parse(tenantIdsJson)
      if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
        throw new Error('Invalid tenant IDs')
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid tenant IDs format' },
        { status: 400 }
      )
    }

    // Demo mode: create deployments using the new v2 model
    if (isDemoMode()) {
      const batchId = `batch-${Date.now().toString(36)}`

      // Filter to requested tenants
      const targetTenants = DEMO_TENANTS.filter(
        t => t.enabled && tenantIds.includes(t.tenantId)
      )

      // Extract solution name from filename
      // Remove _managed.zip or _unmanaged.zip suffix, then version suffix like _1_0_0_0
      const solutionName = solutionFile.name
        .replace(/_(managed|unmanaged)\.zip$/i, '')  // Remove _managed.zip or _unmanaged.zip
        .replace(/\.zip$/i, '')                       // Remove plain .zip if present
        .replace(/_\d+(_\d+)*$/i, '')                 // Remove version suffix (e.g., _1_0_0_0)

      const now = new Date().toISOString()
      const solutionPath = `./solutions/${solutionFile.name}`

      // Create atomic deployments (one per tenant)
      const deployments: Deployment[] = targetTenants.map((t, index) => ({
        id: `${batchId}-${index}`,
        batchId,
        solutionName: solutionName || 'DemoAgent',
        solutionVersion: '1.0.0',
        solutionPath,
        tenantId: t.tenantId,
        tenantName: t.name,
        environmentUrl: t.environmentUrl,
        status: 'pending' as const,
        createdAt: now,
        updatedAt: now,
        attemptNumber: 1,
        triggeredBy: 'manual' as const,
        // Include URL overrides if provided for this tenant
        ...(urlOverrides?.[t.tenantId] ? { urlOverride: urlOverrides[t.tenantId] } : {}),
      }))

      // Load config to check approval requirements
      let approvalRequired = false
      let approvalConfig: { minApprovals?: number; timeout?: string } | undefined
      try {
        const config = await loadConfig(resolve(CONFIG_PATH))
        approvalRequired = config.settings?.approval?.required || false
        approvalConfig = config.settings?.approval
      } catch {
        // Config not available, proceed without approval
      }

      // Determine initial status based on approval requirements
      const initialStatus: DeploymentStatus = approvalRequired ? 'awaiting_approval' : 'in_progress'

      // Create the batch
      const batch: DeploymentBatch = {
        id: batchId,
        solutionName: solutionName || 'DemoAgent',
        solutionVersion: '1.0.0',
        solutionPath,
        status: initialStatus,
        totalDeployments: deployments.length,
        completedDeployments: 0,
        failedDeployments: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: approvalRequired ? undefined : now,
        triggeredBy: 'manual',
      }

      // Update deployment statuses if awaiting approval
      if (approvalRequired) {
        deployments.forEach(d => {
          d.status = 'pending'
        })
      }

      // Store v2 data in demo stores
      for (const deployment of deployments) {
        demoDeploymentsV2.set(deployment.id, deployment)
      }
      demoBatches.set(batchId, batch)

      // Also persist to database
      try {
        deploymentRepo.createBatch(batch)
        for (const deployment of deployments) {
          deploymentRepo.createDeployment(deployment)
        }

        // Create approval record if required
        if (approvalRequired) {
          const timeout = approvalConfig?.timeout || '24h'
          const timeoutMs = parseTimeout(timeout)
          const expiresAt = new Date(Date.now() + timeoutMs).toISOString()

          approvalRepo.createApproval({
            deploymentId: batchId,
            status: 'pending',
            requiredApprovals: approvalConfig?.minApprovals || 1,
            createdAt: now,
            expiresAt,
          })

          logApprovalAction('approval.requested', batchId)
        }

        logDeploymentAction('deployment.created', batchId, solutionName || 'DemoAgent', {
          details: { tenantCount: targetTenants.length, approvalRequired },
        })
      } catch (dbError) {
        console.warn('Failed to persist to database:', dbError)
        // Continue - demo stores are primary for demo mode
      }

      // Also create legacy DeploymentJob for backward compatibility with existing UI
      const legacyDeployment = {
        id: batchId,
        solutionName: solutionName || 'DemoAgent',
        solutionPath,
        solutionVersion: '1.0.0',
        status: initialStatus,
        totalTenants: targetTenants.length,
        completedTenants: 0,
        failedTenants: 0,
        createdAt: now,
        updatedAt: now,
        startedAt: approvalRequired ? undefined : now,
        triggeredBy: 'manual' as const,
        tenantResults: targetTenants.map(t => ({
          tenantId: t.tenantId,
          tenantName: t.name,
          status: 'pending' as const,
          attemptNumber: 1,
          // Include URL override for dependency display in logs
          ...(urlOverrides?.[t.tenantId] ? { urlOverride: urlOverrides[t.tenantId] } : {}),
        })),
      }
      demoDeployments.set(batchId, legacyDeployment)

      // Track deployment creation
      serverTrackDeployment('deployment_created', {
        deploymentId: batchId,
        solutionName: solutionName || 'DemoAgent',
        tenantCount: targetTenants.length,
        status: initialStatus,
      })

      return NextResponse.json({
        deploymentId: batchId, // Return batchId as deploymentId for backward compatibility
        batchId, // Also return batchId explicitly for v2 clients
        demoMode: true,
        solutionPath,
        tenantCount: targetTenants.length,
        approvalRequired,
        message: approvalRequired
          ? 'Demo deployment created - awaiting approval'
          : 'Demo deployment created - watch the progress!',
      })
    }

    // Load config to get tenant details and partner info
    const config = await loadConfig(resolve(CONFIG_PATH))

    // Filter to only requested tenants that exist and are enabled
    const targetTenants: TenantConfig[] = config.tenants.filter(
      (t) => t.enabled && tenantIds.includes(t.tenantId)
    )

    if (targetTenants.length === 0) {
      return NextResponse.json(
        { error: 'No valid tenants found for the provided IDs' },
        { status: 400 }
      )
    }

    // Save the solution file
    const solutionsDir = resolve(SOLUTIONS_DIR)
    await mkdir(solutionsDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const solutionFileName = `${timestamp}_${solutionFile.name}`
    const solutionPath = join(solutionsDir, solutionFileName)

    const solutionBuffer = Buffer.from(await solutionFile.arrayBuffer())
    await writeFile(solutionPath, solutionBuffer)

    // Create deployment
    const queueManager = new DeploymentQueueManager(REDIS_URL)
    const deploymentId = crypto.randomUUID()

    await queueManager.addTenantDeploymentsBulk(
      deploymentId,
      solutionPath,
      targetTenants,
      config.partner.tenantId,
      config.partner.clientId
    )

    await queueManager.close()

    // Track deployment creation
    serverTrackDeployment('deployment_created', {
      deploymentId,
      solutionName: solutionFile.name,
      tenantCount: targetTenants.length,
      status: 'in_progress',
    })

    return NextResponse.json({
      deploymentId,
      solutionPath,
      tenantCount: targetTenants.length,
      message: 'Deployment created successfully',
    })
  } catch (error) {
    console.error('Create deployment error:', error)

    // Track the error
    serverTrackError(error instanceof Error ? error : String(error), {
      endpoint: '/api/deployments/create',
      method: 'POST',
    })

    // Provide helpful error messages for common issues
    let errorMessage = 'Failed to create deployment'
    if (error instanceof Error) {
      // Check if this is a Redis connection error
      if (error.message.includes('ECONNREFUSED') ||
          error.message.includes('Redis') ||
          error.message.includes('connect')) {
        errorMessage = formatRedisError(error, REDIS_URL)
      } else {
        errorMessage = error.message
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * Parse timeout string like "24h", "30m", "7d"
 */
function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)([mhd])$/)
  if (!match) {
    return 24 * 60 * 60 * 1000 // Default 24 hours
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    default:
      return 24 * 60 * 60 * 1000
  }
}

