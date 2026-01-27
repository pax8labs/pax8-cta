import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { resolve } from 'path'
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  isDemoMode,
  DEMO_SOLUTIONS,
  DEMO_CONFIG,
} from '@agentsync/core'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * List solutions from the source environment
 */
export async function GET() {
  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      return NextResponse.json({
        demoMode: true,
        sourceEnvironment: DEMO_CONFIG.source.environmentUrl,
        solutions: DEMO_SOLUTIONS.map((s, i) => ({
          id: `demo-solution-${i}`,
          uniqueName: s.uniqueName,
          friendlyName: s.friendlyName,
          version: s.version,
          isManaged: s.isManaged,
          publisherName: s.publisherName,
          description: s.description,
        })),
      })
    }

    // Load config
    const config = await loadConfig(resolve(CONFIG_PATH))

    // Check if client secret is available
    let clientSecret: string
    try {
      clientSecret = getClientSecret()
    } catch {
      return NextResponse.json(
        { error: 'Client secret not configured. Set PARTNER_CLIENT_SECRET environment variable.' },
        { status: 500 }
      )
    }

    // Create token manager for source environment
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

    // Get solutions
    const solutions = await solutionOps.listSolutions()

    // Filter to show only relevant solutions (exclude system solutions)
    const filteredSolutions = solutions.filter(
      (s) =>
        !s.uniquename.startsWith('msdyn') &&
        !s.uniquename.startsWith('Microsoft') &&
        s.uniquename !== 'Active' &&
        s.uniquename !== 'Basic' &&
        s.uniquename !== 'Default'
    )

    return NextResponse.json({
      demoMode: false,
      sourceEnvironment: config.source.environmentUrl,
      solutions: filteredSolutions.map((s) => ({
        id: s.solutionid,
        uniqueName: s.uniquename,
        friendlyName: s.friendlyname,
        version: s.version,
        isManaged: s.ismanaged,
      })),
    })
  } catch (error) {
    console.error('List solutions error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list solutions' },
      { status: 500 }
    )
  }
}
