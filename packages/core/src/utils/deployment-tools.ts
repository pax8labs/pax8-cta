/**
 * Shared deployment tool handlers
 * Used by both MCP server and web chat API
 */

const API_BASE_URL = process.env.AGENTSYNC_API_URL || 'http://localhost:3000'

export interface CreateDeploymentParams {
  agentId: string
  tenantIds: string[]
}

export interface CreateDeploymentResult {
  deploymentId: string
  batchId?: string
  demoMode?: boolean
  solutionPath: string
  tenantCount: number
  approvalRequired?: boolean
  message: string
}

/**
 * Create a new deployment
 * Downloads the solution file and posts it to the deployment API
 */
export async function createDeployment(params: CreateDeploymentParams): Promise<CreateDeploymentResult> {
  const { agentId, tenantIds } = params

  // Step 1: Download the solution file
  const solutionUrl = `${API_BASE_URL}/api/demo-solutions/${agentId}`
  const solutionResponse = await fetch(solutionUrl)

  if (!solutionResponse.ok) {
    throw new Error(`Failed to download solution: ${solutionResponse.status}`)
  }

  const arrayBuffer = await solutionResponse.arrayBuffer()
  const solutionBuffer = Buffer.from(arrayBuffer)

  // Step 2: Create form data with the solution file
  const FormData = (await import('node-fetch')).FormData as any
  const { Blob } = await import('node:buffer')

  const formData = new FormData()
  const blob = new Blob([solutionBuffer], { type: 'application/zip' })
  formData.append('solution', blob, `${agentId}_managed.zip`)
  formData.append('tenantIds', JSON.stringify(tenantIds))

  // Step 3: Create the deployment
  const response = await fetch(`${API_BASE_URL}/api/deployments/create`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create deployment: ${response.status} ${error}`)
  }

  return await response.json() as CreateDeploymentResult
}

export interface DeploymentStatusParams {
  deploymentId: string
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(params: DeploymentStatusParams): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/deployments/${params.deploymentId}`)

  if (!response.ok) {
    throw new Error(`Failed to get deployment status: ${response.status}`)
  }

  return await response.json()
}

export interface ListDeploymentsParams {
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  limit?: number
}

/**
 * List deployments
 */
export async function listDeployments(params: ListDeploymentsParams = {}): Promise<any> {
  const queryParams = new URLSearchParams()
  if (params.status) queryParams.append('status', params.status)
  if (params.limit) queryParams.append('limit', params.limit.toString())

  const response = await fetch(`${API_BASE_URL}/api/deployments?${queryParams}`)

  if (!response.ok) {
    throw new Error(`Failed to list deployments: ${response.status}`)
  }

  return await response.json()
}

/**
 * Retry a failed deployment
 */
export async function retryDeployment(params: DeploymentStatusParams): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/deployments/${params.deploymentId}/retry`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Failed to retry deployment: ${response.status}`)
  }

  return await response.json()
}

/**
 * List available agents
 */
export async function listAgents(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/agents`)

  if (!response.ok) {
    throw new Error(`Failed to list agents: ${response.status}`)
  }

  return await response.json()
}

/**
 * List available tenants
 */
export async function listTenants(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/tenants`)

  if (!response.ok) {
    throw new Error(`Failed to list tenants: ${response.status}`)
  }

  return await response.json()
}

/**
 * Get deployment statistics
 */
export async function getDeploymentStats(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/stats`)

  if (!response.ok) {
    throw new Error(`Failed to get deployment stats: ${response.status}`)
  }

  return await response.json()
}
