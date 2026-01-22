/**
 * GitHub Issue Reporter
 *
 * Automatically creates GitHub issues for app errors and crashes.
 * Uses a rate-limited, deduplicated approach to avoid issue spam.
 */

import { createLogger } from './logger'

const logger = createLogger('GitHubIssueReporter')

// Configuration from environment variables
const GITHUB_TOKEN = process.env.GITHUB_ISSUE_TOKEN || process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_ISSUE_REPO || 'anthropics/agentsync'
const GITHUB_LABELS = (process.env.GITHUB_ISSUE_LABELS || 'bug,auto-reported').split(',')

// Dedupe settings
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours - don't report same error twice in this window
const MAX_ISSUES_PER_HOUR = 10 // Rate limit
const CHECK_EXISTING_ISSUES = true // Check GitHub for existing open issues before creating

// In-memory tracking (resets on server restart)
// Use bounded Map to prevent memory leaks
const MAX_CACHED_ERRORS = 1000
const reportedErrors = new Map<string, number>() // errorHash -> timestamp
let issueCount = 0
let issueCountResetTime = Date.now()

// Helper to maintain map size bounds
function addToErrorCache(hash: string, timestamp: number): void {
  // If at capacity, remove oldest entries
  if (reportedErrors.size >= MAX_CACHED_ERRORS) {
    const entriesToRemove = Math.floor(MAX_CACHED_ERRORS * 0.2) // Remove 20%
    const sortedByTime = [...reportedErrors.entries()].sort((a, b) => a[1] - b[1])
    for (let i = 0; i < entriesToRemove && i < sortedByTime.length; i++) {
      reportedErrors.delete(sortedByTime[i][0])
    }
  }
  reportedErrors.set(hash, timestamp)
}

// Sanitize error message for logging (remove potential secrets)
function sanitizeErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    // Only log message and name, not full stack or cause which might contain request details
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

export interface ErrorReport {
  error: Error | string
  errorStack?: string
  componentStack?: string
  source: 'error_boundary' | 'api_error' | 'unhandled_rejection' | 'global_error' | 'manual_report'
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
 * Normalize error message by removing variable parts that differ between occurrences
 */
function normalizeErrorMessage(message: string): string {
  return message
    // Remove UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    .replace(/\d{13}/g, '<TIMESTAMP_MS>')
    // Remove file paths with line numbers
    .replace(/\([^)]*:\d+:\d+\)/g, '(<FILE>)')
    // Remove URLs
    .replace(/https?:\/\/[^\s)]+/g, '<URL>')
    // Remove tenant/deployment IDs (8+ char alphanumeric strings)
    .replace(/\b[a-z0-9]{8,}\b/gi, '<ID>')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Generate a hash for error deduplication
 * Uses normalized message to group similar errors together
 */
function generateErrorHash(report: ErrorReport): string {
  const errorMessage = typeof report.error === 'string' ? report.error : report.error.message
  const errorName = typeof report.error === 'string' ? 'Error' : report.error.name

  // Normalize the message to remove variable parts
  const normalizedMessage = normalizeErrorMessage(errorMessage)

  // Extract function name from first stack line (more stable than full line)
  const firstStackLine = report.errorStack?.split('\n')[1]?.trim() || ''
  const functionName = firstStackLine.match(/at\s+(\S+)/)?.[1] || ''

  // Hash based on error type, normalized message, and function name
  return `${errorName}:${normalizedMessage.slice(0, 100)}:${functionName.slice(0, 30)}`
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
 * Uses normalized message for better deduplication
 */
function generateIssueTitle(report: ErrorReport): string {
  const errorMessage = typeof report.error === 'string' ? report.error : report.error.message
  const errorName = typeof report.error === 'string' ? 'Error' : report.error.name

  // Normalize the message
  const normalizedMessage = normalizeErrorMessage(errorMessage)

  // Create a concise title
  const shortMessage = normalizedMessage.length > 60
    ? normalizedMessage.slice(0, 60) + '...'
    : normalizedMessage

  const sourceLabel = {
    error_boundary: 'React',
    api_error: 'API',
    unhandled_rejection: 'Promise',
    global_error: 'Global',
    manual_report: 'Manual',
  }[report.source] || report.source

  return `[${sourceLabel}] ${errorName}: ${shortMessage}`
}

/**
 * Search for existing open GitHub issues with similar title
 * Returns the issue URL if found
 */
async function findExistingIssue(title: string): Promise<string | null> {
  if (!CHECK_EXISTING_ISSUES) {
    return null
  }

  try {
    const [owner, repo] = GITHUB_REPO.split('/')
    if (!owner || !repo) {
      return null
    }

    // Extract the core error pattern from title: "[Source] ErrorName: message"
    const errorPattern = title.match(/\[.*?\]\s+(\w+):\s+(.+)/)?.[0]
    if (!errorPattern) {
      return null
    }

    // Search for open issues with auto-reported label and similar title
    const searchQuery = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open label:auto-reported "${errorPattern}"`)
    const response = await fetch(
      `https://api.github.com/search/issues?q=${searchQuery}&per_page=1`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AgentSync-Error-Reporter',
        },
      }
    )

    if (!response.ok) {
      console.error('[GitHub Issue Reporter] Failed to search for existing issues:', response.status)
      return null
    }

    const data = await response.json()
    if (data.total_count > 0 && data.items?.[0]) {
      return data.items[0].html_url
    }

    return null
  } catch (error) {
    console.error('[GitHub Issue Reporter] Error checking for existing issues:', sanitizeErrorForLogging(error))
    return null
  }
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

    // Check if an open issue already exists
    const existingIssueUrl = await findExistingIssue(title)
    if (existingIssueUrl) {
      logger.debug('Found existing open issue', { issueUrl: existingIssueUrl })
      // Track that we found existing issue
      addToErrorCache(errorHash, Date.now())
      return {
        success: true,
        issueUrl: existingIssueUrl,
        deduplicated: true,
        error: 'Found existing open issue'
      }
    }

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

    // Track successful report using bounded cache
    addToErrorCache(errorHash, Date.now())
    issueCount++

    return {
      success: true,
      issueUrl: data.html_url,
      issueNumber: data.number,
    }
  } catch (error) {
    // Sanitize error before logging to avoid credential exposure
    console.error('[GitHub Issue Reporter] Failed to create issue:', sanitizeErrorForLogging(error))
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
