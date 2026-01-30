import { NextRequest, NextResponse } from 'next/server'
import { reportErrorToGitHub, isGitHubReportingEnabled, ErrorReport } from '@/lib/github-issue-reporter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/errors/report
 *
 * Report an error to GitHub Issues.
 * This endpoint is called from the client-side error boundary.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.error && !body.errorMessage) {
      return NextResponse.json(
        { error: 'Missing required field: error or errorMessage' },
        { status: 400 }
      )
    }

    // Construct the error report
    const report: ErrorReport = {
      error: body.errorMessage || body.error || 'Unknown error',
      errorStack: body.errorStack || body.stack,
      componentStack: body.componentStack,
      source: body.source || 'global_error',
      context: body.context || {},
      userAgent: request.headers.get('user-agent') || undefined,
      url: body.url || request.headers.get('referer') || undefined,
      timestamp: body.timestamp || new Date().toISOString(),
    }

    // Check if reporting is enabled
    if (!isGitHubReportingEnabled()) {
      console.log('[Error Reporter] GitHub not configured, logging error locally:', report)
      return NextResponse.json({
        success: false,
        reported: false,
        message: 'Error logged locally. GitHub reporting not configured.',
      })
    }

    // Report to GitHub
    const result = await reportErrorToGitHub(report)

    if (result.success) {
      console.log(`[Error Reporter] Created GitHub issue #${result.issueNumber}: ${result.issueUrl}`)
    } else if (result.deduplicated) {
      console.log('[Error Reporter] Error deduplicated - already reported recently')
    } else if (result.rateLimited) {
      console.log('[Error Reporter] Rate limited - too many issues this hour')
    } else {
      console.error('[Error Reporter] Failed to create issue:', result.error)
    }

    return NextResponse.json({
      success: result.success,
      reported: result.success,
      issueUrl: result.issueUrl,
      issueNumber: result.issueNumber,
      deduplicated: result.deduplicated,
      rateLimited: result.rateLimited,
      message: result.error,
    })
  } catch (error) {
    console.error('[Error Reporter] Request processing failed:', error)
    return NextResponse.json(
      { error: 'Failed to process error report' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/errors/report
 *
 * Check if GitHub issue reporting is configured
 */
export async function GET() {
  return NextResponse.json({
    enabled: isGitHubReportingEnabled(),
    message: isGitHubReportingEnabled()
      ? 'GitHub issue reporting is configured'
      : 'Set GITHUB_ISSUE_TOKEN and GITHUB_ISSUE_REPO environment variables to enable automatic issue reporting',
  })
}
