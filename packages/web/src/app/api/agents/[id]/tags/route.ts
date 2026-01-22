import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, DEMO_SOLUTIONS } from '@agentsync/core'
import { invalidRequest, internalError } from '@/lib/errors'

// In-memory storage for agent tags (in real app, this would be persisted)
const agentTags = new Map<string, string[]>()

// Initialize with demo solution tags
DEMO_SOLUTIONS.forEach((solution: any) => {
  if (solution.tags) {
    agentTags.set(solution.uniqueName, [...solution.tags])
  }
})

/**
 * Update tags for an agent
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    if (!isDemoMode()) {
      return NextResponse.json(
        { error: 'Tags API only available in demo mode' },
        { status: 501 }
      )
    }

    const body = await request.json()
    const { tags } = body

    if (!Array.isArray(tags)) {
      return invalidRequest('Tags must be an array of strings')
    }

    // Validate tags are strings
    const validTags = tags.filter(t => typeof t === 'string' && t.trim().length > 0)

    // Store the tags
    agentTags.set(agentId, validTags)

    return NextResponse.json({
      success: true,
      agentId,
      tags: validTags,
    })
  } catch (error) {
    console.error('Update agent tags error:', error)
    return internalError(
      'Failed to update agent tags',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}

/**
 * Get tags for an agent
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    if (!isDemoMode()) {
      return NextResponse.json(
        { error: 'Tags API only available in demo mode' },
        { status: 501 }
      )
    }

    const tags = agentTags.get(agentId) || []

    return NextResponse.json({
      agentId,
      tags,
    })
  } catch (error) {
    console.error('Get agent tags error:', error)
    return internalError(
      'Failed to get agent tags',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
    )
  }
}
