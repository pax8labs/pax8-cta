/**
 * Deployment Risk Analysis API
 * POST /api/deployments/analyze - Analyze deployment risk before execution
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-middleware'
import { apiRateLimit, createRateLimitResponse } from '@/lib/rate-limit'
import { parseAndValidate } from '@/lib/validation'
import { validationError, internalError } from '@/lib/errors'
import { riskAnalyzer, loadConfig, isDemoMode, DEMO_CONFIG, type DeploymentContext } from '@agentsync/core'
import { z } from 'zod'
import * as deploymentRepo from '@/lib/repositories/deployment-repository'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

export const dynamic = 'force-dynamic'

// Request schema
const analyzeRequestSchema = z.object({
  tenantIds: z.array(z.string()).min(1, 'At least one tenant is required'),
  solutionFile: z.string().optional(),
  solutionSize: z.number().optional(),
  isProduction: z.boolean().default(false),
  scheduledTime: z.string().optional().transform(val => val ? new Date(val) : undefined),
})

/**
 * POST - Analyze deployment risk
 * Returns risk assessment with recommendations
 */
export async function POST(request: NextRequest) {
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
    // Parse and validate request
    const body = await request.json()
    const parseResult = analyzeRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return validationError(
        'Invalid request',
        parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      )
    }

    const { tenantIds, solutionFile, solutionSize, isProduction, scheduledTime } = parseResult.data

    // Load tenant configurations
    const config = isDemoMode() ? DEMO_CONFIG : await loadConfig(CONFIG_PATH)
    const tenants = config.tenants.filter(t => tenantIds.includes(t.tenantId))

    if (tenants.length === 0) {
      return validationError('No valid tenants found')
    }

    // Get deployment history for these tenants
    const deploymentHistory = tenants.flatMap(tenant => {
      const deployments = deploymentRepo.getDeploymentsByTenant(tenant.tenantId)

      return deployments.slice(0, 10).map(d => ({
        tenantId: tenant.tenantId,
        status: d.status === 'completed' ? 'success' as const : 'failure' as const,
        error: d.error || undefined,
        completedAt: d.completedAt || d.updatedAt,
        durationMinutes: d.completedAt && d.startedAt
          ? Math.round((new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime()) / 60000)
          : undefined,
      }))
    })

    // Build analysis context
    const context: DeploymentContext = {
      tenants: tenants.map(t => ({
        id: t.tenantId,
        name: t.name,
        environmentUrl: t.environmentUrl,
        tags: t.tags,
      })),
      solutionFile,
      solutionSize,
      isProduction,
      scheduledTime,
      deploymentHistory,
    }

    // Run risk analysis
    const analysis = await riskAnalyzer.analyze(context)

    return NextResponse.json({
      analysis,
      timestamp: new Date().toISOString(),
      analyzedTenants: tenants.length,
    })
  } catch (error) {
    console.error('Risk analysis error:', error)
    return internalError(
      'Failed to analyze deployment risk',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message, stack: error.stack }
        : undefined
    )
  }
}
