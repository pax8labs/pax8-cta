import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, DEMO_TENANTS } from '@agentsync/core'
import { demoTenantStatus } from '@/lib/demo-store'

/**
 * PUT /api/tenants/[id]/status
 * Update enabled/disabled status for a specific tenant
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tenantId } = await params
    const body = await request.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Enabled must be a boolean' },
        { status: 400 }
      )
    }

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
      demoTenantStatus.set(tenantId, enabled)

      // Also update the in-memory demo tenant (for this session)
      tenant.enabled = enabled

      return NextResponse.json({
        demoMode: true,
        tenantId,
        enabled,
        message: `Tenant ${enabled ? 'enabled' : 'disabled'} successfully`,
      })
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: 'Status updates in non-demo mode require config file modification' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Tenant status update error:', error)
    return NextResponse.json(
      { error: 'Failed to update tenant status' },
      { status: 500 }
    )
  }
}
