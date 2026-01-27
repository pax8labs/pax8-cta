import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, join } from 'path'
import { loadConfig, TenantConfig, isDemoMode, DEMO_CONFIG, DEMO_TENANTS, generateMockDeployment } from '@agentsync/core'
import { DeploymentQueueManager } from '@agentsync/worker'
import { demoDeployments } from '@/lib/demo-store'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const SOLUTIONS_DIR = process.env.SOLUTIONS_DIR || './solutions'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const solutionFile = formData.get('solution') as File | null
    const tenantIdsJson = formData.get('tenantIds') as string | null

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

    // Demo mode: create a mock deployment
    if (isDemoMode()) {
      const deploymentId = `demo-${Date.now().toString(36)}`

      // Filter to requested tenants
      const targetTenants = DEMO_TENANTS.filter(
        t => t.enabled && tenantIds.includes(t.tenantId)
      )

      // Extract solution name from filename
      const solutionName = solutionFile.name.replace(/_\d+_\d+_\d+.*\.zip$/, '').replace(/_/g, '')

      // Create mock deployment
      const deployment = generateMockDeployment({
        id: deploymentId,
        solutionName: solutionName || 'DemoAgent',
        solutionPath: `./solutions/${solutionFile.name}`,
        status: 'in_progress',
        totalTenants: targetTenants.length,
        completedTenants: 0,
        failedTenants: 0,
        createdAt: new Date().toISOString(),
        tenantResults: targetTenants.map(t => ({
          tenantId: t.tenantId,
          tenantName: t.name,
          status: 'pending' as const,
          attemptNumber: 1,
        })),
      })

      // Store for later retrieval
      demoDeployments.set(deploymentId, deployment)

      // Simulate deployment progress
      simulateDemoDeployment(deploymentId, targetTenants)

      return NextResponse.json({
        deploymentId,
        demoMode: true,
        solutionPath: `./solutions/${solutionFile.name}`,
        tenantCount: targetTenants.length,
        message: 'Demo deployment created - watch the progress!',
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

    return NextResponse.json({
      deploymentId,
      solutionPath,
      tenantCount: targetTenants.length,
      message: 'Deployment created successfully',
    })
  } catch (error) {
    console.error('Create deployment error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create deployment' },
      { status: 500 }
    )
  }
}

// Simulate deployment progress for demo mode
async function simulateDemoDeployment(deploymentId: string, tenants: TenantConfig[]) {
  const deployment = demoDeployments.get(deploymentId)
  if (!deployment) return

  // Simulate each tenant completing one by one
  for (let i = 0; i < tenants.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000)) // 2-5 second delay

    const result = deployment.tenantResults[i]
    if (result) {
      result.status = Math.random() > 0.1 ? 'completed' : 'failed' // 90% success rate
      result.startedAt = new Date(Date.now() - 2000).toISOString()
      result.completedAt = new Date().toISOString()
      if (result.status === 'failed') {
        result.error = 'Simulated failure for demo purposes'
        deployment.failedTenants++
      } else {
        deployment.completedTenants++
      }
    }

    // Update overall status - deployment is 'completed' when all tenants are processed
    // The failedTenants count indicates how many had errors
    if (deployment.completedTenants + deployment.failedTenants >= deployment.totalTenants) {
      deployment.status = 'completed'
    }

    deployment.updatedAt = new Date().toISOString()
    demoDeployments.set(deploymentId, deployment)
  }

  deployment.status = 'completed'
  deployment.updatedAt = new Date().toISOString()
  demoDeployments.set(deploymentId, deployment)
}

