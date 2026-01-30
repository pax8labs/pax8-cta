import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentsync/worker'
import { isDemoMode } from '@agentsync/core'
import { resolveDeployment } from '@/lib/demo-store'
import { requireAuth, logAuthFailure } from '@/lib/api-middleware'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Require authentication to view deployment details
  const session = await requireAuth()
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, `/api/deployments/${params.id}`, 'unauthorized')
    return session
  }

  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      // Resolve deployment from store or generate for historical demo IDs
      const deployment = resolveDeployment(params.id)

      if (!deployment) {
        return NextResponse.json(
          { error: 'Deployment not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        demoMode: true,
        ...deployment,
      })
    }

    const queueManager = new DeploymentQueueManager(REDIS_URL)

    const deployment = await queueManager.getDeploymentStatus(params.id)

    await queueManager.close()

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      demoMode: false,
      ...deployment,
    })
  } catch (error) {
    console.error('Deployment detail error:', error)
    return NextResponse.json(
      { error: 'Failed to load deployment' },
      { status: 500 }
    )
  }
}
