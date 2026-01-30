/**
 * GitHub Issue Reporter
 *
 * Automatically creates GitHub issues for app errors and crashes.
 * Uses a rate-limited, deduplicated approach to avoid issue spam.
 */

// Configuration from environment variables
const GITHUB_TOKEN = process.env.GITHUB_ISSUE_TOKEN || process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_ISSUE_REPO || 'anthropics/agentsync'
const GITHUB_LABELS = (process.env.GITHUB_ISSUE_LABELS || 'bug,auto-reported').split(',')

// Dedupe settings
const DEDUPE_WINDOW_MS = 60 * 60 * 1000 // 1 hour - don't report same error twice in this window
const MAX_ISSUES_PER_HOUR = 10 // Rate limit

// In-memory tracking (resets on server restart)
const reportedErrors = new Map<string, number>() // errorHash -> timestamp
let issueCount = 0
let issueCountResetTime = Date.now()

export interface ErrorReport {
  error: Error | string
  errorStack?: string
  componentStack?: string
  source: 'error_boundary' | 'api_error' | 'unhandled_rejection' | 'global_error'
  context?: Record<string, unknown>
  userAgent?: string
  url?: string
  timestamp?: string
}

export interface GitHubIssueResponse {
  success: boolean
  issueUrl?: string
  issueNumber?: number
  error?: string
  deduplicated?: boolean
  rateLimited?: boolean
}

/**
 * Check if GitHub issue reporting is configured
 */
export function isGitHubReportingEnabled(): boolean {
  return Boolean(GITHUB_TOKEN && GITHUB_REPO)
}

/**
 * Generate a hash for error deduplication
 */
function generateErrorHash(report: ErrorReport): string {
  const errorMessage = typeof report.error === 'string' ? report.error : report.error.message
  const errorName = typeof report.error === 'string' ? 'Error' : report.error.name
  const firstStackLine = report.errorStack?.split('\n')[1]?.trim() || ''

  // Hash based on error type, message, and first stack frame
  return `${errorName}:${errorMessage.slice(0, 100)}:${firstStackLine.slice(0, 50)}`
}

/**
 * Check if we should report this error (deduplication + rate limiting)
 */
function shouldReportError(errorHash: string): { shouldReport: boolean; reason?: string } {
  // Reset hourly counter
  if (Date.now() - issueCountResetTime > 60 * 60 * 1000) {
    issueCount = 0
    issueCountResetTime = Date.now()
  }

  // Rate limit check
  if (issueCount >= MAX_ISSUES_PER_HOUR) {
    return { shouldReport: false, reason: 'rate_limited' }
  }

  // Deduplication check
  const lastReported = reportedErrors.get(errorHash)
  if (lastReported && Date.now() - lastReported < DEDUPE_WINDOW_MS) {
    return { shouldReport: false, reason: 'deduplicated' }
  }

  return { shouldReport: true }
}

/**
 * Format the error report as a GitHub issue body
 */
function formatIssueBody(report: ErrorReport): string {
  const errorMessage = typeof report.error === 'string' ? report.error : report.error.message
  const errorName = typeof report.error === 'string' ? 'Error' : report.error.name

  const sections: string[] = []

  // Header
  sections.push(`## Auto-Reported Error\n`)
  sections.push(`**Source:** \`${report.source}\``)
  sections.push(`**Time:** ${report.timestamp || new Date().toISOString()}`)
  if (report.url) {
    sections.push(`**URL:** ${report.url}`)
  }
  sections.push('')

  // Error details
  sections.push(`### Error Details\n`)
  sections.push(`**Type:** \`${errorName}\``)
  sections.push(`**Message:** ${errorMessage}`)
  sections.push('')

  // Stack trace
  if (report.errorStack) {
    sections.push(`### Stack Trace\n`)
    sections.push('```')
    sections.push(report.errorStack.slice(0, 2000)) // Limit stack trace size
    sections.push('```')
    sections.push('')
  }

  // Component stack (React errors)
  if (report.componentStack) {
    sections.push(`### Component Stack\n`)
    sections.push('```')
    sections.push(report.componentStack.slice(0, 1500))
    sections.push('```')
    sections.push('')
  }

  // Additional context
  if (report.context && Object.keys(report.context).length > 0) {
    sections.push(`### Additional Context\n`)
    sections.push('```json')
    try {
      sections.push(JSON.stringify(report.context, null, 2).slice(0, 1000))
    } catch {
      sections.push('(Unable to serialize context)')
    }
    sections.push('```')
    sections.push('')
  }

  // Environment info
  sections.push(`### Environment\n`)
  if (report.userAgent) {
    sections.push(`**User Agent:** ${report.userAgent}`)
  }
  sections.push(`**Node Env:** \`${process.env.NODE_ENV || 'unknown'}\``)
  sections.push('')

  // Footer
  sections.push('---')
  sections.push('*This issue was automatically created by the AgentSync error reporter.*')

  return sections.join('\n')
}

/**
 * Generate a title for the GitHub issue
 */
function generateIssueTitle(report: ErrorReport): string {
  const errorMessage = typeof report.error === 'string' ? report.error : report.error.message
  const errorName = typeof report.error === 'string' ? 'Error' : report.error.name

  // Create a concise title
  const shortMessage = errorMessage.length > 60
    ? errorMessage.slice(0, 60) + '...'
    : errorMessage

  const sourceLabel = {
    error_boundary: 'React',
    api_error: 'API',
    unhandled_rejection: 'Promise',
    global_error: 'Global',
  }[report.source] || report.source

  return `[${sourceLabel}] ${errorName}: ${shortMessage}`
}

/**
 * Report an error to GitHub Issues
 * This is the main function to call from your error handlers
 */
export async function reportErrorToGitHub(report: ErrorReport): Promise<GitHubIssueResponse> {
  if (!isGitHubReportingEnabled()) {
    return {
      success: false,
      error: 'GitHub issue reporting not configured. Set GITHUB_ISSUE_TOKEN and GITHUB_ISSUE_REPO.'
    }
  }

  const errorHash = generateErrorHash(report)
  const { shouldReport, reason } = shouldReportError(errorHash)

  if (!shouldReport) {
    return {
      success: false,
      deduplicated: reason === 'deduplicated',
      rateLimited: reason === 'rate_limited',
      error: `Issue not reported: ${reason}`
    }
  }

  try {
    const [owner, repo] = GITHUB_REPO.split('/')
    if (!owner || !repo) {
      throw new Error(`Invalid GITHUB_ISSUE_REPO format: ${GITHUB_REPO}. Expected: owner/repo`)
    }

    const title = generateIssueTitle(report)
    const body = formatIssueBody(report)

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'AgentSync-Error-Reporter',
      },
      body: JSON.stringify({
        title,
        body,
        labels: GITHUB_LABELS,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message || 'Unknown error'}`)
    }

    const data = await response.json()

    // Track successful report
    reportedErrors.set(errorHash, Date.now())
    issueCount++

    return {
      success: true,
      issueUrl: data.html_url,
      issueNumber: data.number,
    }
  } catch (error) {
    console.error('[GitHub Issue Reporter] Failed to create issue:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating GitHub issue',
    }
  }
}

/**
 * Clean up old entries from the dedupe map (call periodically)
 */
export function cleanupDedupeCache(): void {
  const now = Date.now()
  for (const [hash, timestamp] of reportedErrors.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      reportedErrors.delete(hash)
    }
  }
}

// Clean up every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupDedupeCache, 10 * 60 * 1000)
}
