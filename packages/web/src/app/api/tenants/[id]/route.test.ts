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
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireTenantAccess: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(),
  DEMO_CONFIG: {
    tenants: [
      {
        name: "Contoso Corporation",
        tenantId: "11111111-1111-1111-1111-111111111111",
        environmentUrl: "https://contoso.crm.dynamics.com",
        tags: ["production", "enterprise"],
        enabled: true,
        metadata: { tier: "premium", region: "us-east" },
      },
      {
        name: "Fabrikam Inc",
        tenantId: "22222222-2222-2222-2222-222222222222",
        environmentUrl: "https://fabrikam.crm.dynamics.com",
        tags: ["test"],
        enabled: false,
        metadata: {},
      },
    ],
  },
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployedAgents: new Map([
    [
      "11111111-1111-1111-1111-111111111111",
      [
        { solutionName: "HR Agent", version: "1.0.0", status: "active" },
        { solutionName: "IT Agent", version: "2.1.0", status: "pending_update" },
      ],
    ],
    ["22222222-2222-2222-2222-222222222222", []],
  ]),
  initializeDemoAgents: vi.fn(),
}));

describe("GET /api/tenants/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication and tenant access", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });

    expect(response.status).toBe(403);
    expect(vi.mocked(requireTenantAccess)).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("should return tenant details when authorized", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(true);
    expect(data.tenant).toBeDefined();
  });

  it("should return 404 when tenant not found", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "nonexistent-tenant-id" });
    const request = new NextRequest("http://localhost/api/tenants/nonexistent-tenant-id");
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tenant not found");
  });

  it("should include all tenant metadata fields", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant).toHaveProperty("name");
    expect(data.tenant).toHaveProperty("tenantId");
    expect(data.tenant).toHaveProperty("environmentUrl");
    expect(data.tenant).toHaveProperty("tags");
    expect(data.tenant).toHaveProperty("enabled");
    expect(data.tenant).toHaveProperty("metadata");
    expect(data.tenant).toHaveProperty("deployedAgents");
  });

  it("should include deployed agents for tenant", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant.deployedAgents).toBeDefined();
    expect(Array.isArray(data.tenant.deployedAgents)).toBe(true);
    expect(data.tenant.deployedAgents.length).toBe(2);
    expect(data.tenant.deployedAgents[0].solutionName).toBe("HR Agent");
  });

  it("should return empty deployed agents array for tenant with no agents", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "22222222-2222-2222-2222-222222222222" });
    const request = new NextRequest(
      "http://localhost/api/tenants/22222222-2222-2222-2222-222222222222"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant.deployedAgents).toEqual([]);
  });

  it("should include tenant tags", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant.tags).toEqual(["production", "enterprise"]);
  });

  it("should include custom metadata", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant.metadata).toEqual({ tier: "premium", region: "us-east" });
  });

  it("should include enabled status", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "22222222-2222-2222-2222-222222222222" });
    const request = new NextRequest(
      "http://localhost/api/tenants/22222222-2222-2222-2222-222222222222"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.tenant.enabled).toBe(false);
  });

  it("should initialize demo agents before returning", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");
    const { initializeDemoAgents } = await import("@/lib/demo-store");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    await GET(request, { params });

    expect(vi.mocked(initializeDemoAgents)).toHaveBeenCalled();
  });

  it("should log auth failure on forbidden access", async () => {
    const { requireTenantAccess, logAuthFailure } = await import("@/lib/api-middleware");

    vi.mocked(requireTenantAccess).mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    await GET(request, { params });

    expect(vi.mocked(logAuthFailure)).toHaveBeenCalledWith(
      undefined,
      "/api/tenants/11111111-1111-1111-1111-111111111111",
      "forbidden",
      { tenantId: "11111111-1111-1111-1111-111111111111" }
    );
  });

  it("should handle load config errors in non-demo mode", async () => {
    const { requireTenantAccess } = await import("@/lib/api-middleware");
    const { isDemoMode, loadConfig } = await import("@agentsync/core");

    vi.mocked(requireTenantAccess).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockRejectedValue(new Error("Config load failed"));

    const params = Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" });
    const request = new NextRequest(
      "http://localhost/api/tenants/11111111-1111-1111-1111-111111111111"
    );
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to load tenant details");
  });
});
