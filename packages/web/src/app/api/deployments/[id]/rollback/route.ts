import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode } from '@agentsync/core'
import { demoDeployments } from '@/lib/demo-store'

/**
 * Rollback a deployment (undo deployed solutions)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Demo mode handling
    if (isDemoMode()) {
      const deployment = demoDeployments.get(params.id)

      if (!deployment) {
        return NextResponse.json(
          { error: 'Deployment not found' },
          { status: 404 }
        )
      }

      if (deployment.status !== 'completed' && deployment.status !== 'failed') {
        return NextResponse.json(
          { error: 'Can only rollback completed or failed deployments' },
          { status: 400 }
        )
      }

      // Update deployment status to rolling_back
      deployment.status = 'rolling_back'
      deployment.updatedAt = new Date().toISOString()
      demoDeployments.set(params.id, deployment)

      // Simulate rollback completion after a delay
      setTimeout(() => {
        const dep = demoDeployments.get(params.id)
        if (dep && dep.status === 'rolling_back') {
          dep.status = 'rolled_back'
          dep.updatedAt = new Date().toISOString()
          // Reset tenant statuses
          dep.tenantResults.forEach(t => {
            if (t.status === 'completed') {
              t.status = 'rolled_back'
            }
          })
          dep.completedTenants = 0
          demoDeployments.set(params.id, dep)
        }
      }, 3000) // 3 second simulated rollback

      return NextResponse.json({
        demoMode: true,
        message: `Rolling back deployment from ${deployment.completedTenants} tenant(s)`,
        deploymentId: params.id,
      })
    }

    // Real mode - not implemented yet
    return NextResponse.json(
      { error: 'Rollback not implemented for production mode' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Rollback deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to rollback deployment' },
      { status: 500 }
    )
  }
}
