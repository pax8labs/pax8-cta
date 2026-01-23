import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { writeFile, mkdir } from 'fs/promises'
import { resolve, join } from 'path'
import { loadConfig, TenantConfig } from '@agentcrate/core'
import { DeploymentQueueManager } from '@agentcrate/worker'

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
