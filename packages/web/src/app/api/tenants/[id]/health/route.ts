import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { isDemoMode, HealthCheckService, TokenManager, DataverseClient } from '@agentsync/core'
import { getDatabase } from '@/lib/db'

// Demo tenants for health check simulation
const DEMO_TENANTS: Record<string, { name: string; environmentUrl: string }> = {
  '11111111-1111-1111-1111-111111111111': {
    name: 'Contoso Corp',
    environmentUrl: 'https://contoso.crm.dynamics.com',
  },
  '22222222-2222-2222-2222-222222222222': {
    name: 'Fabrikam Industries',
    environmentUrl: 'https://fabrikam.crm.dynamics.com',
  },
  '33333333-3333-3333-3333-333333333333': {
    name: 'Adventure Works',
    environmentUrl: 'https://adventureworks.crm.dynamics.com',
  },
  '44444444-4444-4444-4444-444444444444': {
    name: 'Northwind Traders',
    environmentUrl: 'https://northwind.crm.dynamics.com',
  },
  '55555555-5555-5555-5555-555555555555': {
    name: 'Woodgrove Bank',
    environmentUrl: 'https://woodgrove.crm.dynamics.com',
  },
}

// Load tenant config for authentication
async function loadTenantConfig() {
  try {
    const configPath = process.env.AGENTSYNC_CONFIG || './config/tenants.yaml'
    const { loadConfig } = await import('@agentsync/core')
    return await loadConfig(configPath)
  } catch {
    return null
  }
}

// Save health check result to database
function saveHealthCheckResult(result: {
  tenantId: string
  tenantName: string
  healthy: boolean
  checks: unknown[]
  totalDurationMs: number
}) {
  try {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO health_check_results (
        tenant_id, tenant_name, healthy, checks, total_duration_ms, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      result.tenantId,
      result.tenantName,
      result.healthy ? 1 : 0,
      JSON.stringify(result.checks),
      result.totalDurationMs,
      new Date().toISOString()
    )
  } catch {
    // Ignore if database isn't set up
  }
}

// Get last health check result from database
function getLastHealthCheckResult(tenantId: string): {
  healthy: boolean
  checks: unknown[]
  totalDurationMs: number
  checkedAt: string
} | null {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT healthy, checks, total_duration_ms, checked_at
      FROM health_check_results
      WHERE tenant_id = ?
      ORDER BY checked_at DESC
      LIMIT 1
    `).get(tenantId) as {
      healthy: number
      checks: string
      total_duration_ms: number
      checked_at: string
    } | undefined

    if (!row) return null

    return {
      healthy: row.healthy === 1,
      checks: JSON.parse(row.checks),
      totalDurationMs: row.total_duration_ms,
      checkedAt: row.checked_at,
    }
  } catch {
    return null
  }
}

/**
 * GET /api/tenants/[id]/health - Get health check status for a tenant
 * POST /api/tenants/[id]/health - Run a health check for a tenant
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Get last health check result
    const lastResult = getLastHealthCheckResult(id)

    if (!lastResult) {
      return NextResponse.json({
        tenantId: id,
        status: 'unknown',
        message: 'No health check has been run for this tenant',
        lastCheck: null,
      })
    }

    return NextResponse.json({
      tenantId: id,
      status: lastResult.healthy ? 'healthy' : 'unhealthy',
      healthy: lastResult.healthy,
      checks: lastResult.checks,
      totalDurationMs: lastResult.totalDurationMs,
      lastCheck: lastResult.checkedAt,
    })
  } catch (error) {
    console.error('Get health check error:', error)
    return NextResponse.json(
      { error: 'Failed to get health check status' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Demo mode - simulate health check
    if (isDemoMode()) {
      const tenant = DEMO_TENANTS[id]
      if (!tenant) {
        return NextResponse.json(
          { error: 'Tenant not found' },
          { status: 404 }
        )
      }

      // Simulate health check with random results
      const healthy = Math.random() > 0.05 // 95% healthy rate

      const checks = [
        {
          name: 'dataverse_connectivity',
          passed: healthy || Math.random() > 0.5,
          message: healthy ? `Connected successfully (Org: ${id})` : 'Connection timeout',
          durationMs: Math.floor(Math.random() * 500) + 100,
        },
        {
          name: 'solution_import_capability',
          passed: healthy || Math.random() > 0.3,
          message: healthy ? 'Import job access verified' : 'Insufficient permissions',
          durationMs: Math.floor(Math.random() * 300) + 50,
        },
      ]

      const totalDurationMs = checks.reduce((sum, c) => sum + c.durationMs, 0)

      const result = {
        healthy: checks.every(c => c.passed),
        tenantId: id,
        tenantName: tenant.name,
        checks,
        totalDurationMs,
      }

      // Save to database
      saveHealthCheckResult(result)

      return NextResponse.json({
        demoMode: true,
        ...result,
        checkedAt: new Date().toISOString(),
      })
    }

    // Production mode - use HealthCheckService
    const config = await loadTenantConfig()
    if (!config) {
      return NextResponse.json(
        { error: 'Configuration not found. Please ensure tenants.yaml is configured.' },
        { status: 500 }
      )
    }

    // Find tenant in config
    const tenantConfig = config.tenants.find(t => t.tenantId === id)
    if (!tenantConfig) {
      return NextResponse.json(
        { error: 'Tenant not found in configuration' },
        { status: 404 }
      )
    }

    // Get client secret from environment variable
    const clientSecret = process.env.AZURE_CLIENT_SECRET
    if (!clientSecret) {
      return NextResponse.json(
        { error: 'AZURE_CLIENT_SECRET environment variable is required' },
        { status: 500 }
      )
    }

    // Create token manager and DataverseClient
    const tokenManager = new TokenManager({
      clientId: config.partner.clientId,
      clientSecret,
      tenantId: config.partner.tenantId,
    })

    const client = new DataverseClient({
      environmentUrl: tenantConfig.environmentUrl,
      tokenManager,
    })

    // Run health check
    const healthCheckService = new HealthCheckService()
    const result = await healthCheckService.checkTenantHealth(
      tenantConfig,
      client,
      config.settings?.healthCheck
    )

    // Save to database
    saveHealthCheckResult(result)

    return NextResponse.json({
      demoMode: false,
      ...result,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json(
      { error: 'Failed to run health check' },
      { status: 500 }
    )
  }
}
