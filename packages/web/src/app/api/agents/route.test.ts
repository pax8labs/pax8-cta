/**
 * Copyright 2024 Pax8 Labs
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
  DEMO_SOLUTIONS: [
    {
      uniqueName: "test_agent_1",
      friendlyName: "Test Agent 1",
      version: "1.0.0",
      description: "Test agent for demos",
      publisherName: "Microsoft",
      isManaged: true,
      category: "hr",
      capabilities: ["conversational"],
    },
    {
      uniqueName: "test_agent_2",
      friendlyName: "Test Agent 2",
      version: "2.0.0",
      description: "Another test agent",
      publisherName: "Contoso",
      isManaged: false,
      category: "it",
      capabilities: ["workflows"],
    },
  ],
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployedAgents: new Map([
    [
      "11111111-1111-1111-1111-111111111111",
      [
        {
          solutionName: "Test Agent 1",
          version: "1.0.0",
          deployedAt: "2024-01-01T00:00:00Z",
          status: "active",
        },
      ],
    ],
    [
      "22222222-2222-2222-2222-222222222222",
      [
        {
          solutionName: "Test Agent 1",
          version: "1.0.0",
          deployedAt: "2024-01-02T00:00:00Z",
          status: "active",
        },
        {
          solutionName: "Test Agent 2",
          version: "2.0.0",
          deployedAt: "2024-01-03T00:00:00Z",
          status: "pending_update",
        },
      ],
    ],
  ]),
  initializeDemoAgents: vi.fn(),
  demoCustomAgents: [],
  demoAgentStatus: new Map([
    ["test_agent_1", "active"],
    ["test_agent_2", "active"],
  ]),
}));

describe("GET /api/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any
    );

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(vi.mocked(requireAuth)).toHaveBeenCalled();
  });

  it("should enforce rate limiting", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit, createRateLimitResponse } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    vi.mocked(createRateLimitResponse).mockReturnValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }) as any
    );

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(vi.mocked(apiRateLimit)).toHaveBeenCalledWith(request, "user@example.com");
  });

  it("should return list of agents in demo mode", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("builtInAgents");
    expect(data).toHaveProperty("customAgents");
    expect(Array.isArray(data.builtInAgents)).toBe(true);
    expect(Array.isArray(data.customAgents)).toBe(true);
  });

  it("should include deployment information for each agent", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    const agents = data.builtInAgents;

    // Should have agents
    expect(agents.length).toBeGreaterThan(0);

    // Each agent should have deployments property
    const agent = agents[0];
    expect(agent).toHaveProperty("deployments");
    expect(Array.isArray(agent.deployments)).toBe(true);
  });

  it("should include agent metadata fields", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    const agent = data.builtInAgents[0];

    // Check all required metadata fields
    expect(agent).toHaveProperty("id");
    expect(agent).toHaveProperty("uniqueName");
    expect(agent).toHaveProperty("friendlyName");
    expect(agent).toHaveProperty("version");
    expect(agent).toHaveProperty("description");
    expect(agent).toHaveProperty("publisherName");
    expect(agent).toHaveProperty("isManaged");
    expect(agent).toHaveProperty("isCustom");
    expect(agent).toHaveProperty("status");
    expect(agent).toHaveProperty("category");
    expect(agent).toHaveProperty("capabilities");
  });

  it("should mark built-in agents with isCustom: false", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    const builtInAgents = data.builtInAgents;
    expect(builtInAgents.every((agent: any) => agent.isCustom === false)).toBe(true);
  });

  it("should include tenant deployment details", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    // Find agent with deployments
    const agentWithDeployments = data.builtInAgents.find(
      (agent: any) => agent.deployments && agent.deployments.length > 0
    );

    expect(agentWithDeployments).toBeDefined();

    const deployment = agentWithDeployments.deployments[0];
    expect(deployment).toHaveProperty("tenantId");
    expect(deployment).toHaveProperty("tenantName");
    expect(deployment).toHaveProperty("version");
    expect(deployment).toHaveProperty("deployedAt");
    expect(deployment).toHaveProperty("status");
  });

  it("should initialize demo agents on first call", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");
    const { initializeDemoAgents } = await import("@/lib/demo-store");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    await GET(request);

    expect(vi.mocked(initializeDemoAgents)).toHaveBeenCalled();
  });

  it("should return empty custom agents array when none exist", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    expect(data.customAgents).toEqual([]);
  });

  it("should aggregate deployments across multiple tenants", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { apiRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/agents");
    const response = await GET(request);
    const data = await response.json();

    // Find "Test Agent 1" which is deployed to 2 tenants
    const testAgent1 = data.builtInAgents.find(
      (agent: any) => agent.friendlyName === "Test Agent 1"
    );

    expect(testAgent1).toBeDefined();
    expect(testAgent1.deployments.length).toBe(2);
  });
});
