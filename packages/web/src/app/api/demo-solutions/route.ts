import { NextResponse } from 'next/server'
import { isDemoMode, DEMO_SOLUTIONS } from '@agentsync/core'

export const dynamic = 'force-dynamic'

/**
 * List available demo solutions for testing
 * These are pre-built solution packages that users can use to test deployments
 */
export async function GET() {
  // Demo solutions available for download/use
  const demoSolutions = DEMO_SOLUTIONS.map((solution, index) => ({
    id: `demo-${index}`,
    uniqueName: solution.uniqueName,
    friendlyName: solution.friendlyName,
    version: solution.version,
    description: solution.description,
    publisherName: solution.publisherName,
    isManaged: solution.isManaged,
    // Generate a fake file size for display
    fileSizeBytes: 1024 * 1024 * (1 + Math.random() * 4), // 1-5 MB
    downloadUrl: `/api/demo-solutions/${solution.uniqueName}`,
    createdAt: new Date(Date.now() - (index + 1) * 7 * 24 * 60 * 60 * 1000).toISOString(), // Staggered dates
  }))

  return NextResponse.json({
    demoMode: isDemoMode(),
    solutions: demoSolutions,
    message: 'These are sample Copilot Studio solutions for testing the deployment workflow.',
  })
}
