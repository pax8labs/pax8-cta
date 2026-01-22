import { NextRequest, NextResponse } from 'next/server'
import { isDemoMode, DEMO_SOLUTIONS } from '@agentsync/core'
import { demoCustomAgents } from '@/lib/demo-store'
import { invalidRequest, forbidden, notFound, internalError } from '@/lib/errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Delete an agent by ID
 * Only custom agents can be deleted - built-in agents are protected
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    if (!id) {
      return invalidRequest('Agent ID is required')
    }

    if (isDemoMode()) {
      // Check if it's a built-in agent (cannot be deleted)
      const builtIn = DEMO_SOLUTIONS.find((s: { uniqueName: string }) => s.uniqueName === id)
      if (builtIn) {
        return forbidden('Built-in agents cannot be deleted')
      }

      // Check if custom agent exists
      const customAgent = demoCustomAgents.get(id)
      if (!customAgent) {
        return notFound('Agent', id)
      }

      // Delete the custom agent
      demoCustomAgents.delete(id)

      return NextResponse.json({
        success: true,
        message: `Agent "${customAgent.friendlyName}" deleted successfully`,
      })
    }

    // Real mode - would delete from Dataverse
    return NextResponse.json(
      { error: 'Real agent deletion not yet implemented' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Delete agent error:', error)
    return internalError(
      'Failed to delete agent',
      process.env.NODE_ENV === 'development' && error instanceof Error ? { error: error.message } : undefined
    )
  }
}
