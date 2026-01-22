/**
 * Tenant Health API
 * GET /api/tenants/health - Get health status for all tenants
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-middleware'
import { apiRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { internalError } from '@/lib/errors'
import { healthChecker, loadConfig, isDemoMode, DEMO_CONFIG, type HealthCheckContext } from '@agentsync/core'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

export const dynamic = 'force-dynamic'

/**
 * GET - Get health status for all configured tenants
 */
export async function GET(request: NextRequest) {
  const session = await requireAuth()
  if (session instanceof NextResponse) {
    return session
  }

  // Rate limiting
  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined)
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset)
  }

  try {
    // Get all tenants from config
    const config = isDemoMode() ? DEMO_CONFIG : await loadConfig(CONFIG_PATH)
    const tenants = config.tenants

    if (tenants.length === 0) {
      return NextResponse.json({
        tenants: [],
        total: 0,
        timestamp: new Date().toISOString(),
      })
    }

    // Build health check contexts
    const contexts: HealthCheckContext[] = tenants.map(tenant => {
      // Get deployment history for this tenant
      const deployments = deploymentRepo.getDeploymentsByTenant(tenant.tenantId)
      const deploymentHistory = deployments.slice(0, 10).map(d => ({
        tenantId: tenant.tenantId,
        status: d.status === 'completed' ? 'success' as const : 'failure' as const,
        error: d.error || undefined,
        completedAt: d.completedAt || d.updatedAt,
        durationMinutes: d.completedAt && d.startedAt
          ? Math.round((new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime()) / 60000)
          : undefined,
      }))

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        environmentUrl: tenant.environmentUrl,
        tags: tenant.tags,
        deploymentHistory,
      }
    })

    // Check health for all tenants (uses cache)
    const healthResults = await healthChecker.checkMultipleTenants(contexts)

    // Calculate summary stats
    const summary = {
      total: healthResults.length,
      healthy: healthResults.filter(h => h.status === 'healthy').length,
      warning: healthResults.filter(h => h.status === 'warning').length,
      critical: healthResults.filter(h => h.status === 'critical').length,
      averageHealthScore: Math.round(
        healthResults.reduce((sum, h) => sum + h.healthScore, 0) / healthResults.length
      ),
    }

    return NextResponse.json({
      tenants: healthResults,
      summary,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Health check error:', error)
    return internalError(
      'Failed to check tenant health',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message, stack: error.stack }
        : undefined
    )
  }
}
