import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { loadConfig, isDemoMode, DEMO_CONFIG } from '@agentsync/core'
import { resolve } from 'path'
import { demoTags } from '@/lib/demo-store'

const CONFIG_PATH = process.env.CONFIG_PATH || './config/tenants.yaml'

/**
 * GET /api/tenants/tags
 * Returns all unique tags across all tenants plus any custom-created tags
 */
export async function GET() {
  try {
    const config = isDemoMode()
      ? DEMO_CONFIG
      : await loadConfig(resolve(CONFIG_PATH))

    // Collect all unique tags from tenants
    const tagsSet = new Set<string>()

    for (const tenant of config.tenants) {
      if (tenant.tags) {
        for (const tag of tenant.tags) {
          tagsSet.add(tag)
        }
      }
    }

    // Add any custom tags created in demo mode
    if (isDemoMode()) {
      for (const tag of demoTags) {
        tagsSet.add(tag)
      }
    }

    // Sort alphabetically
    const tags = Array.from(tagsSet).sort()

    return NextResponse.json({
      demoMode: isDemoMode(),
      tags,
    })
  } catch (error) {
    console.error('Tags list error:', error)
    return NextResponse.json(
      { error: 'Failed to load tags' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/tenants/tags
 * Create a new tag (demo mode only - real mode would modify config file)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tag } = body

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      )
    }

    const normalizedTag = tag.trim().toLowerCase()

    if (normalizedTag.length === 0) {
      return NextResponse.json(
        { error: 'Tag name cannot be empty' },
        { status: 400 }
      )
    }

    if (normalizedTag.length > 50) {
      return NextResponse.json(
        { error: 'Tag name must be 50 characters or less' },
        { status: 400 }
      )
    }

    // Check if tag contains invalid characters
    if (!/^[a-z0-9-_]+$/.test(normalizedTag)) {
      return NextResponse.json(
        { error: 'Tag can only contain lowercase letters, numbers, hyphens, and underscores' },
        { status: 400 }
      )
    }

    if (isDemoMode()) {
      demoTags.add(normalizedTag)
      return NextResponse.json({
        demoMode: true,
        tag: normalizedTag,
        message: 'Tag created successfully',
      })
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: 'Tag creation in non-demo mode requires config file modification' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Tag creation error:', error)
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/tenants/tags
 * Delete a tag (demo mode only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      )
    }

    if (isDemoMode()) {
      demoTags.delete(tag)
      return NextResponse.json({
        demoMode: true,
        tag,
        message: 'Tag deleted successfully',
      })
    }

    return NextResponse.json(
      { error: 'Tag deletion in non-demo mode requires config file modification' },
      { status: 501 }
    )
  } catch (error) {
    console.error('Tag deletion error:', error)
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    )
  }
}
