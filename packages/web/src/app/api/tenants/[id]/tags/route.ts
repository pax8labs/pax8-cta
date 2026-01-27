import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, DEMO_TENANTS } from '@agentsync/core'
import { demoTenantTags } from '@/lib/demo-store'

/**
 * PUT /api/tenants/[id]/tags
 * Update tags for a specific tenant
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params
    const body = await request.json()
    const { tags } = body

    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { error: 'Tags must be an array' },
        { status: 400 }
      )
    }

    // Validate each tag
    for (const tag of tags) {
      if (typeof tag !== 'string') {
        return NextResponse.json(
          { error: 'Each tag must be a string' },
          { status: 400 }
        )
      }
    }

    // Normalize tags
    const normalizedTags = tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)

    if (isDemoMode()) {
      // Check if tenant exists
      const tenant = DEMO_TENANTS.find(t => t.tenantId === tenantId)
      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      // Store the override
      demoTenantTags.set(tenantId, normalizedTags)

      // Also update the in-memory demo tenant (for this session)
      tenant.tags = normalizedTags

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tags: normalizedTags,
        message: 'Tags updated successfully',
      })
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: 'Tag updates in non-demo mode require config file modification' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Tenant tags update error:', error)
    return NextResponse.json(
      { error: 'Failed to update tenant tags' },
      { status: 500 }
    )
  }
}
