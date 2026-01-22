/**
 * Seed realistic deployment failures for testing the AI-Powered Deployment Doctor
 *
 * Run with: bun run scripts/seed-demo-failures.ts
 */

import { Deployment, DeploymentBatch, DEMO_TENANTS } from '../packages/core/src/index.js'
import { demoDeploymentsV2, demoBatches } from '../packages/web/src/lib/demo-store.ts'

// Realistic error messages for different categories
const REALISTIC_ERRORS = {
  authentication: [
    'AADSTS700016: Application with identifier \'12345678-1234-1234-1234-123456789abc\' was not found in the directory. This can happen if the application has not been installed by the administrator of the tenant or consented to by any user in the tenant.',
    'Invalid client secret provided. Token acquisition failed with error: invalid_client',
    'Authentication failed: The provided credentials are expired. Please renew the client secret.',
    'Token request failed: AADSTS50013: Assertion failed signature validation.',
  ],
  authorization: [
    'Failed at step 3: Import Solution\n\nRoot cause: Missing privilege \'prvWriteContact\'\n\nThe GDAP role lacks required permissions. To fix:\n1. Go to Partner Center\n2. Request \'Power Platform Admin\' role for this customer\n3. Wait for customer approval\n4. Retry deployment',
    'Error: Insufficient privileges to perform operation. Principal requires System Administrator role.',
    'Access denied: User does not have permission to import solutions. Required privilege: prvCreateSolution',
    'Authorization failed: The service principal does not have the required Dynamics 365 Admin role in this tenant.',
  ],
  network: [
    'Network error: ECONNREFUSED - Connection refused when trying to connect to environment',
    'DNS lookup failed for org12345.crm.dynamics.com: ENOTFOUND',
    'Socket hang up occurred during solution import. Connection was reset by remote host.',
    'Request failed with ETIMEDOUT: Operation timed out after 30000ms while connecting to Dataverse API.',
  ],
  timeout: [
    'Solution import exceeded maximum time limit of 600000ms (10 minutes)',
    'Operation timed out: Import job did not complete within expected timeframe. This may indicate environment performance issues.',
    'Timeout error: Solution import took longer than 10 minutes. The environment may be under heavy load.',
    'Import job timeout: The operation is still in progress but exceeded the polling timeout. Check Power Platform Admin Center.',
  ],
  conflict: [
    'Solution with name \'CustomerServiceAgent\' already exists in this environment with version 1.0.0.1. Use upgrade instead of new installation.',
    'Conflict detected: A bot with the schema name \'cr9f3_customerserviceagent\' already exists in the target environment.',
    'Duplicate component error: Agent name conflicts with existing component. Choose a unique name.',
    'Solution import failed: Component with unique name \'CustomerServiceAgent\' is already installed.',
  ],
  dependency: [
    'Missing dependency: This solution requires connector \'Microsoft Teams\' which is not installed in the target environment.',
    'Connection reference \'cr9f3_sharedsharepoint_12345\' not found. Please configure connection mapping for SharePoint connector.',
    'Environment variable \'CustomerServiceAPIKey\' is required but not configured. Add variable mapping to tenant configuration.',
    'Dependent solution \'PowerPlatformCommonLibrary\' version 2.0 or higher must be installed before importing this solution.',
  ],
  resource_limit: [
    'Rate limit exceeded: Too many API requests. Service will retry after throttling period expires.',
    'Quota exceeded: Tenant has reached storage limit. Free up space or upgrade license before deploying.',
    'Error 429: Too Many Requests. The tenant API rate limit has been exceeded. Retry after 5 minutes.',
    'Concurrent operation limit reached: Maximum of 3 solution imports allowed simultaneously per environment.',
  ],
}

async function seedFailures() {
  console.log('🌱 Seeding realistic deployment failures for Deployment Doctor testing...\n')

  console.log(`📋 Available tenants: ${DEMO_TENANTS.length}`)

  const tenantCount = DEMO_TENANTS.length
  const failedCount = Math.floor(tenantCount * 0.6) // 60% failure rate
  const successCount = tenantCount - failedCount

  const now = new Date()
  const batchId = `batch-doctor-test-${now.getTime()}`

  // Create a batch
  const batch: DeploymentBatch = {
    id: batchId,
    solutionName: 'Customer Service Agent',
    solutionVersion: '1.2.0',
    solutionPath: './solutions/CustomerServiceAgent_1_2_0_managed.zip',
    status: 'failed',
    totalDeployments: tenantCount,
    completedDeployments: successCount,
    failedDeployments: failedCount,
    triggeredBy: 'manual',
    createdAt: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
    updatedAt: now.toISOString(),
    startedAt: new Date(now.getTime() - 3500000).toISOString(),
    completedAt: now.toISOString(),
  }

  demoBatches.set(batchId, batch)
  console.log(`✅ Created batch: ${batchId}`)

  // Create failed deployments with realistic errors
  const errorCategories = ['authentication', 'authorization', 'network', 'timeout', 'conflict', 'dependency', 'resource_limit'] as const
  const deployments: Deployment[] = []

  // Create auth failures for first 2 tenants
  for (let i = 0; i < Math.min(2, DEMO_TENANTS.length); i++) {
    const tenant = DEMO_TENANTS[i]
    console.log(`Creating auth failure for tenant ${i}: ${tenant.name}`)
    const deployment: Deployment = {
      id: `${batchId}-${i}`,
      batchId,
      solutionName: 'Customer Service Agent',
      solutionVersion: '1.2.0',
      solutionPath: './solutions/CustomerServiceAgent_1_2_0_managed.zip',
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      status: 'failed',
      error: REALISTIC_ERRORS.authentication[i % REALISTIC_ERRORS.authentication.length],
      attemptNumber: 1,
      createdAt: new Date(now.getTime() - 3600000 + i * 60000).toISOString(),
      updatedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      startedAt: new Date(now.getTime() - 3500000 + i * 60000).toISOString(),
      completedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      triggeredBy: 'manual',
    }
    deployments.push(deployment)
    demoDeploymentsV2.set(deployment.id, deployment)
  }

  // Create permission failures for next 3 tenants (to create a fleet pattern)
  for (let i = 2; i < Math.min(5, DEMO_TENANTS.length); i++) {
    const tenant = DEMO_TENANTS[i]
    console.log(`Creating permission failure for tenant ${i}: ${tenant.name}`)
    const deployment: Deployment = {
      id: `${batchId}-${i}`,
      batchId,
      solutionName: 'Customer Service Agent',
      solutionVersion: '1.2.0',
      solutionPath: './solutions/CustomerServiceAgent_1_2_0_managed.zip',
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      status: 'failed',
      error: REALISTIC_ERRORS.authorization[0], // Same error for all 3 to trigger fleet insight
      attemptNumber: 1,
      createdAt: new Date(now.getTime() - 3600000 + i * 60000).toISOString(),
      updatedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      startedAt: new Date(now.getTime() - 3500000 + i * 60000).toISOString(),
      completedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      triggeredBy: 'manual',
    }
    deployments.push(deployment)
    demoDeploymentsV2.set(deployment.id, deployment)
  }

  // Create various other failures
  const remainingCategories: typeof errorCategories[number][] = ['network', 'dependency']
  for (let i = 5; i < Math.min(7, DEMO_TENANTS.length); i++) {
    const tenant = DEMO_TENANTS[i]
    console.log(`Creating ${remainingCategories[i - 5]} failure for tenant ${i}: ${tenant.name}`)
    const category = remainingCategories[i - 5]
    const deployment: Deployment = {
      id: `${batchId}-${i}`,
      batchId,
      solutionName: 'Customer Service Agent',
      solutionVersion: '1.2.0',
      solutionPath: './solutions/CustomerServiceAgent_1_2_0_managed.zip',
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      status: 'failed',
      error: REALISTIC_ERRORS[category][0],
      attemptNumber: 1,
      createdAt: new Date(now.getTime() - 3600000 + i * 60000).toISOString(),
      updatedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      startedAt: new Date(now.getTime() - 3500000 + i * 60000).toISOString(),
      completedAt: new Date(now.getTime() - 3000000 + i * 60000).toISOString(),
      triggeredBy: 'manual',
    }
    deployments.push(deployment)
    demoDeploymentsV2.set(deployment.id, deployment)
  }

  // Create successful deployments for the rest
  for (let i = failedCount; i < tenantCount; i++) {
    const tenant = DEMO_TENANTS[i]
    console.log(`Creating successful deployment for tenant ${i}: ${tenant.name}`)
    const deployment: Deployment = {
      id: `${batchId}-${i}`,
      batchId,
      solutionName: 'Customer Service Agent',
      solutionVersion: '1.2.0',
      solutionPath: './solutions/CustomerServiceAgent_1_2_0_managed.zip',
      tenantId: tenant.tenantId,
      tenantName: tenant.name,
      environmentUrl: tenant.environmentUrl,
      status: 'completed',
      attemptNumber: 1,
      createdAt: new Date(now.getTime() - 3600000 + i * 60000).toISOString(),
      updatedAt: new Date(now.getTime() - 2500000 + i * 60000).toISOString(),
      startedAt: new Date(now.getTime() - 3500000 + i * 60000).toISOString(),
      completedAt: new Date(now.getTime() - 2500000 + i * 60000).toISOString(),
      triggeredBy: 'manual',
    }
    deployments.push(deployment)
    demoDeploymentsV2.set(deployment.id, deployment)
  }

  console.log(`✅ Created ${deployments.length} deployments (${batch.failedDeployments} failed, ${batch.completedDeployments} succeeded)\n`)

  console.log('📊 Failure Breakdown:')
  console.log(`  - 2 authentication failures`)
  console.log(`  - 3 authorization failures (fleet pattern!)`)
  if (tenantCount > 6) {
    console.log(`  - 1 network failure`)
    console.log(`  - 1 dependency failure`)
  }
  console.log()

  console.log('🧪 Test the Deployment Doctor:')
  console.log('  1. Run: curl http://localhost:3001/api/deployments/analyze | jq')
  console.log('  2. Or use the /fix-failures command in Claude Code')
  console.log('  3. Observe the intelligent categorization and remediation plans!\n')

  console.log('✨ Seeding complete!')
}

seedFailures().catch(console.error)
