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
import { GET, POST } from "./route";
import { NextRequest, NextResponse } from "next/server";

const { mockCheckTenantHealthDetail, mockClearCache } = vi.hoisted(() => ({
  mockCheckTenantHealthDetail: vi.fn(),
  mockClearCache: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(() =>
    Promise.resolve({ user: { id: "1", email: "user@example.com", roles: ["viewer"] } })
  ),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  apiRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now() + 60000 })
  ),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
  HealthCheckService: vi.fn(),
  DEMO_CONFIG: {
    partner: { tenantId: "partner-123", clientId: "client-456" },
    source: { environmentUrl: "https://source.crm.dynamics.com", tenantId: "partner-123" },
    tenants: [
      {
        name: "Contoso Corporation",
        tenantId: "11111111-1111-1111-1111-111111111111",
        environmentUrl: "https://contoso.crm.dynamics.com",
        tags: ["production"],
        enabled: true,
      },
    ],
    settings: {},
  },
  healthChecker: {
    checkTenantHealthDetail: mockCheckTenantHealthDetail,
    clearCache: mockClearCache,
  },
}));

vi.mock("@/lib/repositories/deployment-repository", () => ({
  getDeploymentsByTenant: vi.fn(() => []),
}));

describe("GET /api/tenants/[id]/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckTenantHealthDetail.mockResolvedValue({
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "Contoso Corporation",
      status: "healthy",
      healthy: true,
      checks: [{ name: "connectivity", passed: true, message: "OK", durationMs: 50 }],
      totalDurationMs: 50,
      checkedAt: "2024-01-01T00:00:00Z",
    });
  });

  it("should return health detail for known tenant", async () => {
    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.healthy).toBe(true);
    expect(data.status).toBe("healthy");
    expect(data.timestamp).toBeDefined();
  });

  it("should return unhealthy status", async () => {
    mockCheckTenantHealthDetail.mockResolvedValue({
      tenantId: "11111111-1111-1111-1111-111111111111",
      status: "unhealthy",
      healthy: false,
      checks: [{ name: "connectivity", passed: false, message: "Failed", durationMs: 100 }],
      totalDurationMs: 100,
    });

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.status).toBe("unhealthy");
    expect(data.healthy).toBe(false);
  });

  it("should return 404 for unknown tenant", async () => {
    const params = Promise.resolve({ id: "nonexistent-tenant" });
    const request = new NextRequest("http://localhost/api/tenants/nonexistent-tenant/health");
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tenant not found");
  });

  it("should handle health checker errors gracefully", async () => {
    mockCheckTenantHealthDetail.mockRejectedValue(new Error("Health check failed"));

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health"
    );
    const response = await GET(request, { params });

    expect(response.status).toBe(500);
  });
});

describe("POST /api/tenants/[id]/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckTenantHealthDetail.mockResolvedValue({
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "Contoso Corporation",
      status: "healthy",
      healthy: true,
      checks: [{ name: "connectivity", passed: true, message: "OK", durationMs: 50 }],
      totalDurationMs: 50,
      checkedAt: new Date().toISOString(),
    });
  });

  it("should return 404 for unknown tenant in demo mode", async () => {
    const params = Promise.resolve({ id: "nonexistent-tenant" });
    const request = new NextRequest("http://localhost/api/tenants/nonexistent-tenant/health", {
      method: "POST",
    });
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tenant not found");
  });

  it("should refresh health check in demo mode", async () => {
    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health",
      { method: "POST" }
    );
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.refreshed).toBe(true);
    expect(data.timestamp).toBeDefined();
    expect(mockClearCache).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("should include health check results", async () => {
    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health",
      { method: "POST" }
    );
    const response = await POST(request, { params });
    const data = await response.json();

    expect(data.checks).toBeDefined();
    expect(data.checks.length).toBeGreaterThan(0);
    expect(data.checks[0]).toHaveProperty("name");
    expect(data.checks[0]).toHaveProperty("passed");
  });

  it("should return 500 for missing config in non-demo mode", async () => {
    const { isDemoMode, loadConfig } = await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue(null as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health",
      { method: "POST" }
    );
    const response = await POST(request, { params });

    expect(response.status).toBe(500);
  });

  it("should return 404 for tenant not in config in non-demo mode", async () => {
    const { isDemoMode, loadConfig } = await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [{ tenantId: "22222222-2222-2222-2222-222222222222", name: "Other" }],
      partner: { clientId: "client", tenantId: "partner-tenant" },
      settings: {},
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health",
      { method: "POST" }
    );
    const response = await POST(request, { params });

    expect(response.status).toBe(404);
  });

  it("should handle health checker errors gracefully", async () => {
    const { isDemoMode } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(true);
    mockCheckTenantHealthDetail.mockRejectedValue(new Error("Service unavailable"));

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health",
      { method: "POST" }
    );
    const response = await POST(request, { params });

    expect(response.status).toBe(500);
  });
});
