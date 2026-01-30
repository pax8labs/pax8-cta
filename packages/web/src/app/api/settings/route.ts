import { NextRequest, NextResponse } from 'next/server'
import { getSettingsService, IntegrationSettings, AppSettings } from '@agentsync/core'
import { requireAuth, requireRole, logAuthFailure } from '@/lib/api-middleware'
import { AppRoles } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Get all settings
 * Requires authentication
 */
export async function GET() {
  const session = await requireAuth()
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/settings', 'unauthorized')
    return session
  }
  try {
    const settingsService = getSettingsService()
    const settings = await settingsService.getSettings()

    // For integration settings, mask the client secret
    const maskedIntegration = {
      ...settings.integration,
      partnerClientSecret: settings.integration.partnerClientSecret
        ? '••••••••••••••••'
        : undefined,
    }

    return NextResponse.json({
      integration: maskedIntegration,
      app: settings.app,
      isConfigured: await settingsService.isIntegrationConfigured(),
    })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json(
      { error: 'Failed to load settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Update settings (integration or app)
 * Requires Admin role
 */
export async function PUT(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN)
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, '/api/settings', 'forbidden', { action: 'update_settings' })
    return session
  }

  try {
    const body = await request.json()
    const { integration, app } = body as {
      integration?: Partial<IntegrationSettings>
      app?: Partial<AppSettings>
    }

    const settingsService = getSettingsService()
    const results: {
      integration?: IntegrationSettings
      app?: AppSettings
    } = {}

    if (integration) {
      // Update integration settings
      results.integration = await settingsService.updateIntegrationSettings(
        integration,
        'web-ui' // configuredBy
      )

      // Mask the client secret in response
      if (results.integration.partnerClientSecret) {
        results.integration = {
          ...results.integration,
          partnerClientSecret: '••••••••••••••••',
        }
      }
    }

    if (app) {
      results.app = await settingsService.updateAppSettings(app)
    }

    return NextResponse.json({
      success: true,
      ...results,
      isConfigured: await settingsService.isIntegrationConfigured(),
    })
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json(
      { error: 'Failed to update settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
