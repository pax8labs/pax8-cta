import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { resolve, join } from 'path'
import { mkdir } from 'fs/promises'
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  isDemoMode,
  DEMO_SOLUTIONS,
} from '@agentsync/core'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'
const SOLUTIONS_DIR = process.env.SOLUTIONS_DIR || './solutions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { solutionName, managed = true } = body

    if (!solutionName) {
      return NextResponse.json(
        { error: 'Solution name is required' },
        { status: 400 }
      )
    }

    // In demo mode, return a mock export result
    if (isDemoMode()) {
      const demoSolution = DEMO_SOLUTIONS.find(s => s.uniqueName === solutionName)
      if (!demoSolution) {
        return NextResponse.json(
          { error: `Solution "${solutionName}" not found` },
          { status: 404 }
        )
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const suffix = managed ? 'managed' : 'unmanaged'
      const mockPath = `./solutions/${solutionName}_${timestamp}_${suffix}.zip`

      return NextResponse.json({
        success: true,
        demoMode: true,
        outputPath: mockPath,
        message: 'Demo mode: Solution would be exported to ' + mockPath,
        solution: {
          uniqueName: demoSolution.uniqueName,
          friendlyName: demoSolution.friendlyName,
          version: demoSolution.version,
          isManaged: managed,
        },
      })
    }

    // Load config
    const config = await loadConfig(resolve(CONFIG_PATH))

    // Get client secret
    let clientSecret: string
    try {
      clientSecret = getClientSecret()
    } catch {
      return NextResponse.json(
        { error: 'Client secret not configured' },
        { status: 500 }
      )
    }

    // Create token manager
    const tokenManager = new TokenManager({
      tenantId: config.source.tenantId,
      clientId: config.partner.clientId,
      clientSecret,
    })

    // Create Dataverse client
    const dataverseClient = new DataverseClient({
      environmentUrl: config.source.environmentUrl,
      tokenManager,
    })

    const solutionOps = new SolutionOperations(dataverseClient)

    // Ensure solutions directory exists
    const solutionsDir = resolve(SOLUTIONS_DIR)
    await mkdir(solutionsDir, { recursive: true })

    // Build output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const suffix = managed ? 'managed' : 'unmanaged'
    const outputPath = join(solutionsDir, `${solutionName}_${timestamp}_${suffix}.zip`)

    // Export solution
    const metadata = await solutionOps.exportSolution(solutionName, {
      managed,
      outputPath,
    })

    return NextResponse.json({
      success: true,
      outputPath,
      solution: {
        uniqueName: metadata.uniqueName,
        friendlyName: metadata.friendlyName,
        version: metadata.version,
        isManaged: metadata.isManaged,
      },
    })
  } catch (error) {
    console.error('Export solution error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    )
  }
}
