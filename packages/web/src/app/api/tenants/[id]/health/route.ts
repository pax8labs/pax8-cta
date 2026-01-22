/**
 * Tenant Health Detail API
 * GET /api/tenants/:id/health - Get detailed health for one tenant
 * POST /api/tenants/:id/health - Force refresh health check
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
 * GET - Get detailed health for a single tenant
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: tenantId } = await params

    // Find tenant in config
    const config = isDemoMode() ? DEMO_CONFIG : await loadConfig(CONFIG_PATH)
    const tenant = config.tenants.find(t => t.tenantId === tenantId)

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Get deployment history
    const deployments = deploymentRepo.getDeploymentsByTenant(tenant.tenantId)
    const deploymentHistory = deployments.slice(0, 20).map(d => ({
      tenantId: tenant.tenantId,
      status: d.status === 'completed' ? 'success' as const : 'failure' as const,
      error: d.error || undefined,
      completedAt: d.completedAt || d.updatedAt,
      durationMinutes: d.completedAt && d.startedAt
        ? Math.round((new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime()) / 60000)
        : undefined,
    }))

    // Build health check context
    const context: HealthCheckContext = {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      tags: tenant.tags,
      deploymentHistory,
    }

    // Get detailed health (uses cache)
    const healthDetail = await healthChecker.checkTenantHealthDetail(context)

    return NextResponse.json({
      ...healthDetail,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Tenant health detail error:', error)
    return internalError(
      'Failed to get tenant health detail',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message, stack: error.stack }
        : undefined
    )
  }
}

/**
 * POST - Force refresh health check (bypass cache)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: tenantId } = await params

    // Find tenant in config
    const config = isDemoMode() ? DEMO_CONFIG : await loadConfig(CONFIG_PATH)
    const tenant = config.tenants.find(t => t.tenantId === tenantId)

    if (!tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    // Clear cache for this tenant
    healthChecker.clearCache(tenantId)

    // Get deployment history
    const deployments = deploymentRepo.getDeploymentsByTenant(tenant.tenantId)
    const deploymentHistory = deployments.slice(0, 20).map(d => ({
      tenantId: tenant.tenantId,
      status: d.status === 'completed' ? 'success' as const : 'failure' as const,
      error: d.error || undefined,
      completedAt: d.completedAt || d.updatedAt,
      durationMinutes: d.completedAt && d.startedAt
        ? Math.round((new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime()) / 60000)
        : undefined,
    }))

    // Build health check context
    const context: HealthCheckContext = {
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      tags: tenant.tags,
      deploymentHistory,
    }

    // Force refresh (skip cache)
    const healthDetail = await healthChecker.checkTenantHealthDetail(context, true)

    return NextResponse.json({
      ...healthDetail,
      refreshed: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Tenant health refresh error:', error)
    return internalError(
      'Failed to refresh tenant health',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message, stack: error.stack }
        : undefined
    )
  }
}
