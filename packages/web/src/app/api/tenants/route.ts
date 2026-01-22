import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { loadConfig } from '@csd/core'
import { resolve } from 'path'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

export async function GET() {
  try {
    const config = await loadConfig(resolve(CONFIG_PATH))

    return NextResponse.json({
      partner: {
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
      },
      source: config.source,
      tenants: config.tenants.map((t) => ({
        name: t.name,
        tenantId: t.tenantId,
        environmentUrl: t.environmentUrl,
        tags: t.tags,
        enabled: t.enabled,
      })),
    })
  } catch (error) {
    console.error('Tenants error:', error)
    return NextResponse.json(
      { error: 'Failed to load tenants configuration' },
      { status: 500 }
    )
  }
}
