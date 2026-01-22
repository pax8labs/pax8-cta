import { NextRequest, NextResponse } from 'next/server'
import { reportErrorToGitHub, isGitHubReportingEnabled, ErrorReport } from '@/lib/github-issue-reporter'
import { createLogger } from '@/lib/logger'
import { invalidRequest, internalError } from '@/lib/errors'

const logger = createLogger('error-reporter')

export const dynamic = 'force-dynamic'

// Maximum request body size (100KB)
const MAX_BODY_SIZE = 100 * 1024

// Valid source values
const VALID_SOURCES = ['error_boundary', 'global_error', 'unhandled_rejection', 'api_error', 'manual_report'] as const
type ErrorSource = (typeof VALID_SOURCES)[number]

// Sanitize string fields - limit length and remove potential sensitive data
function sanitizeString(value: unknown, maxLength: number = 10000): string | undefined {
  if (typeof value !== 'string') return undefined
  // Truncate to max length
  let sanitized = value.slice(0, maxLength)
  // Remove potential tokens/secrets (basic patterns)
  sanitized = sanitized.replace(/(?:Bearer|token|api[_-]?key|password|secret)[:\s=]+[^\s"']+/gi, '[REDACTED]')
  return sanitized
}

// Sanitize context object - limit depth and remove sensitive keys
function sanitizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object') return {}

  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie', 'session']
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    // Skip sensitive keys
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    // Limit nested object depth by stringifying
    if (typeof value === 'object' && value !== null) {
      try {
        sanitized[key] = JSON.stringify(value).slice(0, 500)
      } catch {
        sanitized[key] = '[Unable to serialize]'
      }
    } else if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 500)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * POST /api/errors/report
 *
 * Report an error to GitHub Issues.
 * This endpoint is called from the client-side error boundary.
 */
export async function POST(request: NextRequest) {
  try {
    // Check content length before parsing
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return invalidRequest(`Request body too large (max ${MAX_BODY_SIZE} bytes)`)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return invalidRequest('Invalid JSON body')
    }

    // Validate required fields
    const errorMessage = body.errorMessage || body.error
    if (!errorMessage || typeof errorMessage !== 'string') {
      return invalidRequest('Missing or invalid required field: error or errorMessage (must be a string)')
    }

    // Validate source
    const rawSource = body.source || 'global_error'
    const source: ErrorSource = VALID_SOURCES.includes(rawSource as ErrorSource)
      ? (rawSource as ErrorSource)
      : 'global_error'

    // Construct the error report with sanitized fields
    const report: ErrorReport = {
      error: sanitizeString(errorMessage, 1000) || 'Unknown error',
      errorStack: sanitizeString(body.errorStack || body.stack, 5000),
      componentStack: sanitizeString(body.componentStack, 5000),
      source,
      context: sanitizeContext(body.context),
      userAgent: request.headers.get('user-agent')?.slice(0, 500) || undefined,
      url: sanitizeString(body.url || request.headers.get('referer'), 500),
      timestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString(),
    }

    // Check if reporting is enabled
    if (!isGitHubReportingEnabled()) {
      logger.info('GitHub not configured, logging error locally', { report })
      return NextResponse.json({
        success: false,
        reported: false,
        message: 'Error logged locally. GitHub reporting not configured.',
      })
    }

    // Report to GitHub
    const result = await reportErrorToGitHub(report)

    if (result.success) {
      logger.info('Created GitHub issue', { issueNumber: result.issueNumber, issueUrl: result.issueUrl })
    } else if (result.deduplicated) {
      logger.info('Error deduplicated - already reported recently')
    } else if (result.rateLimited) {
      logger.warn('Rate limited - too many issues this hour')
    } else {
      logger.error('Failed to create issue', new Error(result.error))
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
    logger.error('Request processing failed', error as Error)
    return internalError(
      'Failed to process error report',
      process.env.NODE_ENV === 'development' && error instanceof Error
        ? { error: error.message }
        : undefined
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
