import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentsync/worker'
import { isDemoMode, generateMockDeployment } from '@agentsync/core'
import { demoDeployments } from '@/lib/demo-store'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      // First check if we have a real demo deployment in our store
      const storedDeployment = demoDeployments.get(params.id)
      if (storedDeployment) {
        return NextResponse.json({
          demoMode: true,
          ...storedDeployment,
        })
      }

      // Fallback to mock data for legacy/sample deployments
      const isInProgress = params.id.includes('progress')
      const isFailed = params.id.includes('fail')

      const deployment = generateMockDeployment({
        id: params.id,
        status: isInProgress ? 'in_progress' : isFailed ? 'failed' : 'completed',
      })

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
