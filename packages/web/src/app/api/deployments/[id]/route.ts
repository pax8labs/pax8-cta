import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { DeploymentQueueManager } from '@agentcrate/worker'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const queueManager = new DeploymentQueueManager(REDIS_URL)

    const deployment = await queueManager.getDeploymentStatus(params.id)

    await queueManager.close()

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(deployment)
  } catch (error) {
    console.error('Deployment detail error:', error)
    return NextResponse.json(
      { error: 'Failed to load deployment' },
      { status: 500 }
    )
  }
}
