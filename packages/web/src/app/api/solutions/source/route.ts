import { NextResponse } from 'next/server'
import {
  isDemoMode,
  DataverseClient,
  TokenManager,
  getEffectiveIntegrationSettings,
} from '@agentsync/core'

export const dynamic = 'force-dynamic'

// Demo solutions that would be available in a source environment
const DEMO_SOURCE_SOLUTIONS = [
  {
    solutionId: 'src-sol-1',
    uniqueName: 'CopilotStudioHRBot',
    displayName: 'HR Assistant Copilot',
    version: '1.2.0.5',
    publisher: 'Contoso Solutions',
    description: 'An AI-powered HR assistant for employee questions',
    isManaged: false,
    createdOn: '2024-09-15T10:00:00Z',
    modifiedOn: '2024-12-01T14:30:00Z',
    hasBot: true,
  },
  {
    solutionId: 'src-sol-2',
    uniqueName: 'CopilotStudioITHelp',
    displayName: 'IT Helpdesk Copilot',
    version: '2.0.1.0',
    publisher: 'Contoso Solutions',
    description: 'IT support and troubleshooting assistant',
    isManaged: false,
    createdOn: '2024-08-20T08:00:00Z',
    modifiedOn: '2024-11-28T09:15:00Z',
    hasBot: true,
  },
  {
    solutionId: 'src-sol-3',
    uniqueName: 'CustomerServiceAgent',
    displayName: 'Customer Service Agent',
    version: '1.0.0.0',
    publisher: 'Contoso Solutions',
    description: 'Customer-facing support agent for common inquiries',
    isManaged: false,
    createdOn: '2024-10-10T12:00:00Z',
    modifiedOn: '2024-11-15T16:45:00Z',
    hasBot: true,
  },
  {
    solutionId: 'src-sol-4',
    uniqueName: 'SalesEnablement',
    displayName: 'Sales Enablement Agent',
    version: '1.5.0.0',
    publisher: 'Contoso Solutions',
    description: 'Helps sales team with product info, pricing, and proposals',
    isManaged: false,
    createdOn: '2024-07-05T09:00:00Z',
    modifiedOn: '2024-12-10T11:20:00Z',
    hasBot: true,
  },
]

/**
 * Get solutions available in the source environment
 * These are the agents that can be imported and deployed
 */
export async function GET() {
  try {
    if (isDemoMode()) {
      return NextResponse.json({
        demoMode: true,
        sourceEnvironment: 'https://demo-source.crm.dynamics.com',
        solutions: DEMO_SOURCE_SOLUTIONS,
      })
    }

    const settings = await getEffectiveIntegrationSettings()

    // Check if source environment is configured
    if (!settings.sourceEnvironmentUrl) {
      return NextResponse.json({
        demoMode: false,
        configured: false,
        message: 'Source environment not configured. Configure it in Settings to browse available solutions.',
        solutions: [],
      })
    }

    if (!settings.partnerClientId || !settings.partnerClientSecret) {
      return NextResponse.json(
        { error: 'Partner credentials not configured' },
        { status: 500 }
      )
    }

    // Determine tenant ID for source environment
    const sourceTenantId = settings.sourceTenantId || settings.partnerTenantId
    if (!sourceTenantId) {
      return NextResponse.json(
        { error: 'Unable to determine source tenant ID' },
        { status: 500 }
      )
    }

    const tokenManager = new TokenManager({
      tenantId: sourceTenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    })

    const dataverseClient = new DataverseClient({
      environmentUrl: settings.sourceEnvironmentUrl,
      tokenManager,
    })

    // Query solutions from the source environment
    const solutions = await dataverseClient.querySolutions()

    // Filter to unmanaged solutions (these are the ones we can export)
    // and optionally filter to those containing bots/agents
    const exportableSolutions = solutions
      .filter(s => !s.ismanaged) // Unmanaged solutions only
      .filter(s => !s.uniquename.startsWith('msdyn_')) // Exclude system solutions
      .filter(s => !s.uniquename.startsWith('msft_')) // Exclude Microsoft solutions
      .map(s => ({
        solutionId: s.solutionid,
        uniqueName: s.uniquename,
        displayName: s.friendlyname,
        version: s.version,
        publisher: s.publisherid?.friendlyname || 'Unknown',
        description: '',
        isManaged: s.ismanaged,
        // Note: Detecting if solution contains a bot would require additional queries
        hasBot: true, // Assume true for now - could enhance later
      }))

    return NextResponse.json({
      demoMode: false,
      configured: true,
      sourceEnvironment: settings.sourceEnvironmentUrl,
      sourceTenantId,
      solutions: exportableSolutions,
    })
  } catch (error) {
    console.error('Source solutions error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch source solutions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
