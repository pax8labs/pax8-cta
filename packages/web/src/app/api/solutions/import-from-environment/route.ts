import { NextRequest, NextResponse } from 'next/server'
import {
  isDemoMode,
  DataverseClient,
  TokenManager,
  SolutionOperations,
  getEffectiveIntegrationSettings,
} from '@agentsync/core'
import { demoCustomAgents, CustomAgent } from '@/lib/demo-store'
import { invalidRequest, notFound, internalError } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/**
 * Import a solution from a Power Platform environment
 * This exports the solution from the source environment and stores it as an agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      solutionUniqueName,
      environmentUrl,
      tenantId,
      displayName,
      description,
    } = body as {
      solutionUniqueName: string
      environmentUrl: string
      tenantId?: string
      displayName?: string
      description?: string
    }

    if (!solutionUniqueName || !environmentUrl) {
      return invalidRequest('solutionUniqueName and environmentUrl are required')
    }

    if (isDemoMode()) {
      // Demo mode - create a mock agent
      const agentId = `agent-${Date.now()}`
      const agent = {
        id: agentId,
        name: displayName || solutionUniqueName,
        displayName: displayName || solutionUniqueName,
        solutionName: solutionUniqueName,
        uniqueName: solutionUniqueName,
        version: '1.0.0.0',
        status: 'active' as const,
        description: description || `Imported from ${environmentUrl}`,
        isCustom: true,
        importedFrom: {
          type: 'power-platform' as const,
          environmentUrl,
          importedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Mock solution content (would be real base64 in production)
        solutionBase64: Buffer.from(JSON.stringify({
          mock: true,
          solutionName: solutionUniqueName,
          importedFrom: environmentUrl,
        })).toString('base64'),
      }

      // Store in demo store
      const customAgent: CustomAgent = {
        id: agent.id,
        uniqueName: solutionUniqueName,
        friendlyName: agent.displayName,
        version: agent.version,
        description: agent.description,
        publisherName: 'Demo Publisher',
        isManaged: true,
        status: 'active',
        createdAt: agent.createdAt,
        solutionBase64: agent.solutionBase64,
      }
      demoCustomAgents.set(solutionUniqueName, customAgent)

      return NextResponse.json({
        demoMode: true,
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          solutionName: agent.solutionName,
          version: agent.version,
          importedFrom: agent.importedFrom,
        },
      })
    }

    // Real mode - export solution from source environment
    const settings = await getEffectiveIntegrationSettings()

    if (!settings.partnerClientId || !settings.partnerClientSecret) {
      return internalError('Partner credentials not configured')
    }

    // Determine which tenant to authenticate to
    const targetTenantId = tenantId || settings.sourceTenantId || settings.partnerTenantId
    if (!targetTenantId) {
      return invalidRequest('Unable to determine tenant ID')
    }

    const tokenManager = new TokenManager({
      tenantId: targetTenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    })

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager,
    })

    const solutionOps = new SolutionOperations(dataverseClient)

    // Get solution metadata first
    const solutions = await dataverseClient.querySolutions()
    const solution = solutions.find(s => s.uniquename === solutionUniqueName)

    if (!solution) {
      return notFound('Solution', solutionUniqueName)
    }

    // Export the solution as managed to a temp file
    const os = await import('os')
    const path = await import('path')
    const fs = await import('fs/promises')

    const tempDir = os.tmpdir()
    const outputPath = path.join(tempDir, `${solutionUniqueName}_${Date.now()}.zip`)

    await solutionOps.exportSolution(solutionUniqueName, {
      managed: true,
      outputPath,
    })

    // Read the exported file
    const exportResult = await fs.readFile(outputPath)

    // Clean up temp file
    try {
      await fs.unlink(outputPath)
    } catch {
      // Ignore cleanup errors
    }

    // Store the agent in our system
    // For now, we'll return the data - in production this would persist to a database
    const agentId = `agent-${Date.now()}`
    const agent = {
      id: agentId,
      name: displayName || solution.friendlyname || solutionUniqueName,
      displayName: displayName || solution.friendlyname || solutionUniqueName,
      solutionName: solutionUniqueName,
      uniqueName: solution.uniquename,
      version: solution.version,
      status: 'active',
      description: description || `Imported from ${environmentUrl}`,
      publisher: solution.publisherid?.friendlyname,
      isCustom: true,
      importedFrom: {
        type: 'power-platform',
        environmentUrl,
        tenantId: targetTenantId,
        solutionId: solution.solutionid,
        importedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Note: In production, this would be stored in blob storage or similar
      // and we'd just store a reference here
      solutionSize: exportResult.length,
    }

    // Store the imported agent
    const customAgent: CustomAgent = {
      id: agent.id,
      uniqueName: solution.uniquename,
      friendlyName: agent.displayName,
      version: agent.version,
      description: agent.description,
      publisherName: agent.publisher || 'Unknown',
      isManaged: true,
      status: 'active',
      createdAt: agent.createdAt,
      solutionBase64: exportResult.toString('base64'),
    }
    demoCustomAgents.set(solutionUniqueName, customAgent)

    return NextResponse.json({
      demoMode: false,
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        solutionName: agent.solutionName,
        version: agent.version,
        publisher: agent.publisher,
        solutionSize: agent.solutionSize,
        importedFrom: agent.importedFrom,
      },
    })
  } catch (error) {
    console.error('Import from environment error:', error)
    return internalError(
      'Failed to import solution from environment',
      process.env.NODE_ENV === 'development' && error instanceof Error ? { error: error.message } : undefined
    )
  }
}
