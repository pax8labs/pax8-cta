import { NextResponse } from 'next/server'
import {
  getSettingsService,
  TokenManager,
  DataverseClient,
  PowerPlatformAdminClient,
  isDemoMode,
  formatRedisError,
} from '@agentsync/core'
import Redis from 'ioredis'

export const dynamic = 'force-dynamic'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

interface TestResult {
  step: string
  success: boolean
  message: string
  details?: string
}

/**
 * Test the Power Platform connection with current settings
 */
export async function POST() {
  const results: TestResult[] = []
  let overallSuccess = true

  try {
    // Step 0: Test Redis connectivity (required for non-demo deployments)
    if (!isDemoMode()) {
      try {
        const redis = new Redis(REDIS_URL, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          connectTimeout: 5000,
          lazyConnect: true,
        })

        await redis.connect()
        await redis.ping()
        await redis.quit()

        results.push({
          step: 'redis',
          success: true,
          message: 'Redis connected successfully',
          details: `Connected to ${new URL(REDIS_URL).hostname}:${new URL(REDIS_URL).port || 6379}`,
        })
      } catch (error) {
        results.push({
          step: 'redis',
          success: false,
          message: 'Redis not available',
          details: error instanceof Error
            ? formatRedisError(error, REDIS_URL)
            : 'Redis is required for deployment job processing. See error details for setup instructions.',
        })
        // Don't fail overall - deployments can still work via /api/deployments/process
      }
    } else {
      results.push({
        step: 'redis',
        success: true,
        message: 'Redis check skipped (demo mode)',
        details: 'Demo mode uses in-memory simulation instead of Redis queues',
      })
    }

    const settingsService = getSettingsService()
    const settings = await settingsService.getDecryptedIntegrationSettings()

    // Step 1: Validate credentials are configured
    results.push({
      step: 'credentials',
      success: !!(settings.partnerTenantId && settings.partnerClientId && settings.partnerClientSecret),
      message: settings.partnerTenantId
        ? 'Partner credentials configured'
        : 'Partner credentials not configured',
    })

    if (!settings.partnerTenantId || !settings.partnerClientId || !settings.partnerClientSecret) {
      overallSuccess = false
      await settingsService.recordTestResult(false, 'Credentials not configured')
      return NextResponse.json({
        success: false,
        results,
        error: 'Partner credentials are not fully configured',
      })
    }

    // Step 2: Test authentication
    try {
      const tokenManager = new TokenManager({
        tenantId: settings.partnerTenantId,
        clientId: settings.partnerClientId,
        clientSecret: settings.partnerClientSecret,
      })

      // Try to get a Graph token (for Partner Center / GDAP)
      await tokenManager.getGraphToken()

      results.push({
        step: 'authentication',
        success: true,
        message: 'Successfully authenticated with Azure AD',
      })
    } catch (error) {
      overallSuccess = false
      results.push({
        step: 'authentication',
        success: false,
        message: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
      await settingsService.recordTestResult(false, `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return NextResponse.json({
        success: false,
        results,
        error: 'Authentication failed - check your credentials',
      })
    }

    // Step 3: Test Power Platform Admin API access
    try {
      const tokenManager = new TokenManager({
        tenantId: settings.partnerTenantId,
        clientId: settings.partnerClientId,
        clientSecret: settings.partnerClientSecret,
      })

      const adminClient = new PowerPlatformAdminClient({ tokenManager })
      const environments = await adminClient.listEnvironments()

      results.push({
        step: 'powerplatform_admin',
        success: true,
        message: `Connected to Power Platform Admin API`,
        details: `Found ${environments.length} environment(s)`,
      })
    } catch (error) {
      // This might fail if they don't have admin API access - warn but continue
      results.push({
        step: 'powerplatform_admin',
        success: false,
        message: 'Power Platform Admin API not accessible',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
      // Don't fail overall - this is optional
    }

    // Step 4: Test source environment access (if configured)
    if (settings.sourceEnvironmentUrl) {
      try {
        const tokenManager = new TokenManager({
          tenantId: settings.sourceTenantId || settings.partnerTenantId,
          clientId: settings.partnerClientId,
          clientSecret: settings.partnerClientSecret,
        })

        const dataverseClient = new DataverseClient({
          environmentUrl: settings.sourceEnvironmentUrl,
          tokenManager,
        })

        const solutions = await dataverseClient.querySolutions()

        results.push({
          step: 'source_environment',
          success: true,
          message: 'Connected to source environment',
          details: `Found ${solutions.length} solution(s)`,
        })
      } catch (error) {
        overallSuccess = false
        results.push({
          step: 'source_environment',
          success: false,
          message: 'Source environment not accessible',
          details: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    } else {
      results.push({
        step: 'source_environment',
        success: true,
        message: 'Source environment not configured (optional)',
      })
    }

    // Record the test result
    await settingsService.recordTestResult(
      overallSuccess,
      overallSuccess ? undefined : 'One or more tests failed'
    )

    return NextResponse.json({
      success: overallSuccess,
      results,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Connection test error:', error)
    return NextResponse.json(
      {
        success: false,
        results,
        error: 'Connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
