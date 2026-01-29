import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, DEMO_SOLUTIONS } from '@agentsync/core'
import { demoDeployedAgents, initializeDemoAgents, demoCustomAgents, DeployedAgent, CustomAgent } from '@/lib/demo-store'

/**
 * Get all agents with their deployment information
 * Returns agents and which tenants they are deployed to
 */
export async function GET() {
  try {
    if (isDemoMode()) {
      // Initialize demo agents if not already done
      initializeDemoAgents()

      // Build a map of agent -> tenants it's deployed on
      const agentDeployments = new Map<string, Array<{
        tenantId: string
        tenantName: string
        version: string
        deployedAt: string
        status: DeployedAgent['status']
      }>>()

      // Demo tenant names for lookup
      const tenantNames: Record<string, string> = {
        '11111111-1111-1111-1111-111111111111': 'Contoso Corporation',
        '22222222-2222-2222-2222-222222222222': 'Fabrikam Inc',
        '33333333-3333-3333-3333-333333333333': 'Adventure Works',
        '44444444-4444-4444-4444-444444444444': 'Northwind Traders',
        '55555555-5555-5555-5555-555555555555': 'Woodgrove Bank',
        '66666666-6666-6666-6666-666666666666': 'Tailspin Toys',
        '77777777-7777-7777-7777-777777777777': 'Wingtip Toys',
        '88888888-8888-8888-8888-888888888888': 'Litware Inc',
        '99999999-9999-9999-9999-999999999999': 'Proseware',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa': 'Coho Vineyard',
      }

      // Iterate through all deployed agents
      demoDeployedAgents.forEach((agents, tenantId) => {
        agents.forEach(agent => {
          const existing = agentDeployments.get(agent.solutionName) || []
          existing.push({
            tenantId,
            tenantName: tenantNames[tenantId] || tenantId,
            version: agent.version,
            deployedAt: agent.deployedAt,
            status: agent.status,
          })
          agentDeployments.set(agent.solutionName, existing)
        })
      })

      // Convert DEMO_SOLUTIONS to array format with full agent details
      const builtInAgents = DEMO_SOLUTIONS.map((solution: any) => ({
        id: solution.uniqueName,
        uniqueName: solution.uniqueName,
        friendlyName: solution.friendlyName,
        version: solution.version,
        description: solution.description,
        publisherName: solution.publisherName,
        isManaged: solution.isManaged,
        isCustom: false,
        category: solution.category,
        capabilities: solution.capabilities,
        tags: solution.tags || [],
        dependencies: solution.dependencies || [],
        connectionReferences: solution.connectionReferences || [],
        environmentVariables: solution.environmentVariables || [],
        lastPublished: solution.lastPublished,
        sizeKb: solution.sizeKb,
        changelog: solution.changelog,
        deployedTenants: agentDeployments.get(solution.friendlyName) || [],
        totalDeployments: (agentDeployments.get(solution.friendlyName) || []).length,
      }))

      // Add custom agents (include urlTemplates for URL mapping at deploy time)
      const customAgents = Array.from(demoCustomAgents.values()).map(agent => ({
        id: agent.id,
        uniqueName: agent.uniqueName,
        friendlyName: agent.friendlyName,
        version: agent.version,
        description: agent.description,
        publisherName: agent.publisherName,
        isManaged: agent.isManaged,
        isCustom: true,
        urlTemplates: agent.urlTemplates,
        hasSolutionStored: !!agent.solutionBase64,
        deployedTenants: agentDeployments.get(agent.friendlyName) || [],
        totalDeployments: (agentDeployments.get(agent.friendlyName) || []).length,
      }))

      return NextResponse.json({
        demoMode: true,
        agents: [...builtInAgents, ...customAgents],
      })
    }

    // Real mode - would fetch from Dataverse
    return NextResponse.json({
      demoMode: false,
      agents: [],
      message: 'Real agent discovery not yet implemented',
    })
  } catch (error) {
    console.error('Agents error:', error)
    return NextResponse.json(
      { error: 'Failed to load agents' },
      { status: 500 }
    )
  }
}

/**
 * Create a new custom agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { friendlyName, uniqueName, version, description, publisherName } = body

    if (!friendlyName || !uniqueName || !version) {
      return NextResponse.json(
        { error: 'Missing required fields: friendlyName, uniqueName, version' },
        { status: 400 }
      )
    }

    // Check for duplicate uniqueName
    const existingBuiltIn = DEMO_SOLUTIONS.find(s => s.uniqueName === uniqueName)
    const existingCustom = demoCustomAgents.get(uniqueName)

    if (existingBuiltIn || existingCustom) {
      return NextResponse.json(
        { error: `Agent with uniqueName "${uniqueName}" already exists` },
        { status: 409 }
      )
    }

    const newAgent: CustomAgent = {
      id: uniqueName,
      uniqueName,
      friendlyName,
      version,
      description: description || undefined,
      publisherName: publisherName || 'Custom',
      isManaged: true,
      createdAt: new Date().toISOString(),
    }

    demoCustomAgents.set(uniqueName, newAgent)

    return NextResponse.json({
      success: true,
      agent: newAgent,
    })
  } catch (error) {
    console.error('Create agent error:', error)
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    )
  }
}
