/**
 * Test the Deployment Doctor standalone
 * Run with: bun run scripts/test-doctor.ts
 */

import { getDeploymentDoctor } from '../packages/core/src/index.js'
import { readFileSync } from 'fs'
import { join } from 'path'

const DEPLOYMENTS_V2_FILE = join(process.cwd(), '.demo-deployments-v2.json')

async function testDoctor() {
  console.log('🧪 Testing AI-Powered Deployment Doctor\n')
  console.log('=' .repeat(80))
  console.log()

  // Load deployments from persisted file
  const deployments = JSON.parse(readFileSync(DEPLOYMENTS_V2_FILE, 'utf-8'))

  const failedDeployments = deployments.filter((d: any) => d.status === 'failed' && d.error)

  console.log(`📊 Found ${failedDeployments.length} failed deployments to analyze\n`)

  const doctor = getDeploymentDoctor()

  // Analyze each failure
  console.log('🔍 INDIVIDUAL FAILURE ANALYSES')
  console.log('=' .repeat(80))
  console.log()

  const analyses = []
  for (const deployment of failedDeployments) {
    const analysis = doctor.analyzeFailure(
      deployment.id,
      deployment.tenantId,
      deployment.tenantName,
      deployment.error,
      failedDeployments.map((d: any) => ({
        deploymentId: d.id,
        tenantName: d.tenantName,
        error: d.error,
      }))
    )
    analyses.push(analysis)

    console.log(`\n📍 Deployment: ${deployment.tenantName}`)
    console.log(`   ID: ${deployment.id.substring(0, 20)}...`)
    console.log(`   Error Category: ${analysis.category.toUpperCase()} (${Math.round(analysis.confidence * 100)}% confidence)`)
    console.log(`   Root Cause: ${analysis.rootCause}`)
    console.log(`   Priority: ${analysis.remediationPlan.priority.toUpperCase()}`)
    console.log(`   Estimated Effort: ${analysis.remediationPlan.estimatedEffort}`)
    console.log(`   Auto-fixable: ${analysis.autoFixSuggestion ? '✅ YES' : '❌ NO'}`)

    if (analysis.autoFixSuggestion) {
      console.log(`   Auto-fix Action: ${analysis.autoFixSuggestion.action}`)
      console.log(`   Safety Note: ${analysis.autoFixSuggestion.safetyNote}`)
    }

    console.log(`\n   📋 Remediation Steps:`)
    for (const step of analysis.remediationPlan.steps) {
      const automated = step.automated ? '🤖 [AUTOMATED]' : '👤 [MANUAL]'
      console.log(`      ${step.order}. ${automated} ${step.action}`)
      console.log(`         ${step.description}`)
    }

    if (analysis.remediationPlan.preventionTips) {
      console.log(`\n   💡 Prevention Tips:`)
      for (const tip of analysis.remediationPlan.preventionTips) {
        console.log(`      • ${tip}`)
      }
    }

    console.log()
    console.log('-' .repeat(80))
  }

  // Analyze fleet patterns
  console.log('\n\n🌐 FLEET-WIDE PATTERN ANALYSIS')
  console.log('=' .repeat(80))
  console.log()

  const fleetInsights = doctor.analyzeFleetPatterns(
    failedDeployments.map((d: any) => ({
      deploymentId: d.id,
      tenantId: d.tenantId,
      tenantName: d.tenantName,
      error: d.error,
      timestamp: d.createdAt,
    }))
  )

  if (fleetInsights.length === 0) {
    console.log('✅ No fleet-wide patterns detected. Failures appear to be isolated incidents.\n')
  } else {
    for (const insight of fleetInsights) {
      const icon = insight.severity === 'critical' ? '🚨' : insight.severity === 'warning' ? '⚠️ ' : 'ℹ️ '
      console.log(`${icon} ${insight.severity.toUpperCase()}: ${insight.pattern}`)
      console.log(`   Affected Deployments: ${insight.affectedDeployments}`)
      console.log(`   Affected Tenants: ${insight.affectedTenants.join(', ')}`)
      console.log(`   📌 Recommendation: ${insight.recommendation}`)
      console.log()
    }
  }

  // Summary statistics
  console.log('\n📈 SUMMARY STATISTICS')
  console.log('=' .repeat(80))
  console.log()

  const categoryCounts: Record<string, number> = {}
  let criticalCount = 0
  let autoFixableCount = 0

  for (const analysis of analyses) {
    categoryCounts[analysis.category] = (categoryCounts[analysis.category] || 0) + 1
    if (analysis.remediationPlan.priority === 'critical') criticalCount++
    if (analysis.autoFixSuggestion) autoFixableCount++
  }

  console.log(`Total Failures: ${analyses.length}`)
  console.log(`Critical Issues: ${criticalCount}`)
  console.log(`Auto-fixable: ${autoFixableCount}`)
  console.log()
  console.log('Breakdown by Category:')
  for (const [category, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  • ${category}: ${count}`)
  }

  console.log()
  console.log('=' .repeat(80))
  console.log('✨ Analysis Complete!\n')
  console.log('Key Insights:')
  console.log(`  • ${Math.round(criticalCount / analyses.length * 100)}% of failures are CRITICAL priority`)
  console.log(`  • ${Math.round(autoFixableCount / analyses.length * 100)}% can be auto-fixed`)
  console.log(`  • ${fleetInsights.length} fleet-wide pattern${fleetInsights.length !== 1 ? 's' : ''} detected`)
  console.log()
}

testDoctor().catch(console.error)
