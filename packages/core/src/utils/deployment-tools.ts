/**
 * Copyright 2024 Pax8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Shared deployment tool handlers
 * Used by MCP server for creating deployments via the web API
 */

const API_BASE_URL = process.env.AGENTSYNC_API_URL || "http://localhost:3000";

export interface CreateDeploymentParams {
  agentId: string;
  tenantIds: string[];
}

export interface CreateDeploymentResult {
  deploymentId: string;
  batchId?: string;
  demoMode?: boolean;
  solutionPath: string;
  tenantCount: number;
  approvalRequired?: boolean;
  message: string;
}

export interface DeploymentStatusResponse {
  id: string;
  status: string;
  solutionName?: string;
  totalTenants: number;
  completedTenants: number;
  failedTenants: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tenants?: Array<{
    tenantId: string;
    tenantName: string;
    status: string;
    error?: string;
  }>;
}

export interface DeploymentListResponse {
  deployments: DeploymentStatusResponse[];
  total: number;
}

export interface AgentListResponse {
  agents: Array<{
    id: string;
    name: string;
    version?: string;
    description?: string;
  }>;
}

export interface TenantListResponse {
  tenants: Array<{
    id: string;
    name: string;
    environmentUrl: string;
    tags?: string[];
  }>;
}

export interface DeploymentStatsResponse {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  successRate: number;
}

/**
 * Create a new deployment
 * Downloads the solution file and posts it to the deployment API
 */
export async function createDeployment(
  params: CreateDeploymentParams
): Promise<CreateDeploymentResult> {
  const { agentId, tenantIds } = params;

  // Step 1: Download the solution file
  const solutionUrl = `${API_BASE_URL}/api/demo-solutions/${agentId}`;
  const solutionResponse = await fetch(solutionUrl);

  if (!solutionResponse.ok) {
    throw new Error(`Failed to download solution: ${solutionResponse.status}`);
  }

  const arrayBuffer = await solutionResponse.arrayBuffer();
  const solutionBuffer = Buffer.from(arrayBuffer);

  // Step 2: Create form data with the solution file
  const { FormData, Blob } = (await import("node:buffer")) as Record<string, unknown>;
  const NativeFormData = FormData as typeof globalThis.FormData;
  const NativeBlob = Blob as typeof globalThis.Blob;

  const formData = new NativeFormData();
  const blob = new NativeBlob([solutionBuffer], { type: "application/zip" });
  formData.append("solution", blob, `${agentId}_managed.zip`);
  formData.append("tenantIds", JSON.stringify(tenantIds));

  // Step 3: Create the deployment
  const response = await fetch(`${API_BASE_URL}/api/deployments/create`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create deployment: ${response.status} ${error}`);
  }

  return (await response.json()) as CreateDeploymentResult;
}

export interface DeploymentStatusParams {
  deploymentId: string;
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(
  params: DeploymentStatusParams
): Promise<DeploymentStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/deployments/${params.deploymentId}`);

  if (!response.ok) {
    throw new Error(`Failed to get deployment status: ${response.status}`);
  }

  return (await response.json()) as DeploymentStatusResponse;
}

export interface ListDeploymentsParams {
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  limit?: number;
}

/**
 * List deployments
 */
export async function listDeployments(
  params: ListDeploymentsParams = {}
): Promise<DeploymentListResponse> {
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append("status", params.status);
  if (params.limit) queryParams.append("limit", params.limit.toString());

  const response = await fetch(`${API_BASE_URL}/api/deployments?${queryParams}`);

  if (!response.ok) {
    throw new Error(`Failed to list deployments: ${response.status}`);
  }

  return (await response.json()) as DeploymentListResponse;
}

/**
 * Retry a failed deployment
 */
export async function retryDeployment(
  params: DeploymentStatusParams
): Promise<DeploymentStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/deployments/${params.deploymentId}/retry`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to retry deployment: ${response.status}`);
  }

  return (await response.json()) as DeploymentStatusResponse;
}

/**
 * List available agents
 */
export async function listAgents(): Promise<AgentListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/agents`);

  if (!response.ok) {
    throw new Error(`Failed to list agents: ${response.status}`);
  }

  return (await response.json()) as AgentListResponse;
}

/**
 * List available tenants
 */
export async function listTenants(): Promise<TenantListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/tenants`);

  if (!response.ok) {
    throw new Error(`Failed to list tenants: ${response.status}`);
  }

  return (await response.json()) as TenantListResponse;
}

/**
 * Get deployment statistics
 */
export async function getDeploymentStats(): Promise<DeploymentStatsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/stats`);

  if (!response.ok) {
    throw new Error(`Failed to get deployment stats: ${response.status}`);
  }

  return (await response.json()) as DeploymentStatsResponse;
}
