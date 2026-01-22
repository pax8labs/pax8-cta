/**
 * 404 Telemetry API
 * POST /api/telemetry/404 - Log 404 errors and auto-create GitHub issues
 */

import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

// Paths to ignore (don't create issues for these)
const IGNORE_PATTERNS = [
  /^\/api\//,           // API routes (expected 404s)
  /^\/_next\//,         // Next.js internal routes
  /^\/favicon\.ico$/,   // Favicon
  /^\/robots\.txt$/,    // Robots
  /\/test\//,           // Test routes
  /\/.*\.(jpg|jpeg|png|gif|svg|css|js|map)$/i, // Static assets
]

// Don't create issues too frequently (rate limiting)
const recentIssues = new Map<string, number>()
const ISSUE_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

function shouldIgnorePath(path: string): boolean {
  return IGNORE_PATTERNS.some(pattern => pattern.test(path))
}

async function findExistingIssue(path: string): Promise<{ number: number; state: string } | null> {
  try {
    // Get all issues with "bug" label and filter client-side
    const { stdout } = await execAsync(
      `gh issue list --limit 100 --json number,title,state --label bug`
    )
    const issues = JSON.parse(stdout)

    // Find exact match for "404: {path}"
    const exactMatch = issues.find((issue: any) =>
      issue.title === `404 Error: ${path}`
    )

    return exactMatch ? { number: exactMatch.number, state: exactMatch.state } : null
  } catch (error) {
    console.error('Error searching for existing issue:', error)
    return null
  }
}

async function createGitHubIssue(path: string, referrer: string, userAgent: string) {
  const title = `404 Error: ${path}`

  const body = `## 404 Error Report

**Path:** \`${path}\`
**Referrer:** ${referrer || 'Direct access'}
**User Agent:** ${userAgent}
**First seen:** ${new Date().toISOString()}

## Possible Causes
- Broken internal link${referrer ? ` from referrer page` : ''}
- Missing route/page that should exist
- Typo in navigation
- Outdated bookmark or external link

## Recommended Actions
1. Check if referrer page has broken links
2. Verify if this route should exist
3. Add redirect if page was moved
4. Update navigation if link is incorrect

---
*This issue was automatically created by the 404 monitoring system.*
*To disable auto-creation, remove the telemetry endpoint.*`

  try {
    // Write body to temp file to avoid shell escaping issues
    const { writeFile, unlink } = await import('fs/promises')
    const { join } = await import('path')
    const { tmpdir } = await import('os')

    const tmpFile = join(tmpdir(), `gh-issue-body-${Date.now()}.md`)
    await writeFile(tmpFile, body, 'utf-8')

    try {
      const { stdout } = await execAsync(
        `gh issue create --title "${title.replace(/"/g, '\\"')}" --label "bug" --body-file "${tmpFile}"`
      )
      const issueUrl = stdout.trim()
      console.log(`Created GitHub issue for 404: ${issueUrl}`)
      await unlink(tmpFile)
      return issueUrl
    } catch (error) {
      await unlink(tmpFile).catch(() => {})
      throw error
    }
  } catch (error) {
    console.error('Error creating GitHub issue:', error)
    throw error
  }
}

async function addCommentToIssue(issueNumber: number, path: string) {
  const comment = `🔍 **Additional occurrence detected**

**Timestamp:** ${new Date().toISOString()}

This 404 is still occurring. Consider prioritizing a fix.`

  try {
    await execAsync(
      `gh issue comment ${issueNumber} --body "${comment.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
    )
    console.log(`Added comment to issue #${issueNumber} for path: ${path}`)
  } catch (error) {
    console.error('Error adding comment to issue:', error)
  }
}

/**
 * POST - Log 404 error and potentially create GitHub issue
 */
export async function POST(request: NextRequest) {
  try {
    const { path, referrer, userAgent, timestamp } = await request.json()

    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 })
    }

    // Log to console for debugging
    console.log(`404 detected: ${path} (from: ${referrer || 'direct'})`)

    // Check if we should ignore this path
    if (shouldIgnorePath(path)) {
      return NextResponse.json({
        logged: true,
        ignored: true,
        reason: 'Path matches ignore pattern'
      })
    }

    // Check cooldown (don't create issues too frequently for same path)
    const lastIssueTime = recentIssues.get(path)
    if (lastIssueTime && Date.now() - lastIssueTime < ISSUE_COOLDOWN_MS) {
      return NextResponse.json({
        logged: true,
        issueCreated: false,
        reason: 'Cooldown period active'
      })
    }

    // Check if issue already exists
    const existingIssue = await findExistingIssue(path)

    if (existingIssue) {
      if (existingIssue.state === 'OPEN') {
        // Add comment to existing open issue
        await addCommentToIssue(existingIssue.number, path)
        return NextResponse.json({
          logged: true,
          issueNumber: existingIssue.number,
          commentAdded: true
        })
      } else {
        // Issue was closed, could reopen but for now just log
        console.log(`Issue #${existingIssue.number} exists but is closed. Not creating new issue.`)
        return NextResponse.json({
          logged: true,
          issueCreated: false,
          reason: 'Issue exists but is closed'
        })
      }
    }

    // Create new issue
    const issueUrl = await createGitHubIssue(path, referrer, userAgent)

    // Update cooldown
    recentIssues.set(path, Date.now())

    return NextResponse.json({
      logged: true,
      issueCreated: true,
      issueUrl
    })
  } catch (error) {
    console.error('404 telemetry error:', error)
    // Don't fail the request - silently log error
    return NextResponse.json({
      logged: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 200 }) // Return 200 even on error so 404 page doesn't break
  }
}
