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
import { GET, PUT } from "./route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AppRoles: {
    ADMIN: "admin",
    DEPLOYER: "deployer",
    VIEWER: "viewer",
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  apiRateLimit: vi.fn(() =>
    Promise.resolve({ success: true, remaining: 99, reset: Date.now() + 60000 })
  ),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/validation", () => ({
  parseAndValidate: vi.fn(async (request: any) => {
    const body = await request.json();
    return { success: true, data: body };
  }),
  updateSettingsSchema: {},
}));

vi.mock("@/lib/repositories/audit-repository", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  getSettingsService: vi.fn(),
}));

describe("GET /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(vi.mocked(requireAuth)).toHaveBeenCalled();
  });

  it("should return settings with masked secrets", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const mockGetSettings = vi.fn().mockResolvedValue({
      integration: {
        partnerTenantId: "tenant-123",
        partnerClientId: "client-456",
        partnerClientSecret: "secret-789",
        sourceEnvironmentUrl: "https://source.crm.dynamics.com",
      },
      app: {
        notificationsEnabled: true,
        slackWebhookUrl: "https://hooks.slack.com/services/xxx",
        teamsWebhookUrl: "https://outlook.office.com/webhook/xxx",
      },
    });

    const mockIsIntegrationConfigured = vi.fn().mockResolvedValue(true);

    vi.mocked(getSettingsService).mockReturnValue({
      getSettings: mockGetSettings,
      isIntegrationConfigured: mockIsIntegrationConfigured,
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.integration.partnerClientSecret).toBe("••••••••••••••••");
    expect(data.app.slackWebhookUrl).toBe("••••••••••••••••");
    expect(data.app.teamsWebhookUrl).toBe("••••••••••••••••");
    expect(data.integration.partnerTenantId).toBe("tenant-123");
  });

  it("should handle missing secrets gracefully", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const mockGetSettings = vi.fn().mockResolvedValue({
      integration: {
        partnerTenantId: "tenant-123",
        partnerClientId: "client-456",
        partnerClientSecret: undefined,
      },
      app: {
        slackWebhookUrl: undefined,
        teamsWebhookUrl: undefined,
      },
    });

    vi.mocked(getSettingsService).mockReturnValue({
      getSettings: mockGetSettings,
      isIntegrationConfigured: vi.fn().mockResolvedValue(false),
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(data.integration.partnerClientSecret).toBeUndefined();
    expect(data.app.slackWebhookUrl).toBeUndefined();
    expect(data.app.teamsWebhookUrl).toBeUndefined();
  });

  it("should include isConfigured status", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(getSettingsService).mockReturnValue({
      getSettings: vi.fn().mockResolvedValue({ integration: {}, app: {} }),
      isIntegrationConfigured: vi.fn().mockResolvedValue(true),
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(data.isConfigured).toBe(true);
  });

  it("should handle service errors", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(getSettingsService).mockImplementation(() => {
      throw new Error("Database connection failed");
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.message).toBe("Failed to load settings");
  });
});

describe("PUT /api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Admin role", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { AppRoles } = await import("@/lib/auth");

    vi.mocked(requireRole).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const request = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({ integration: { partnerTenantId: "new-tenant" } }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith(AppRoles.ADMIN);
  });

  it("should update integration settings", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockUpdateIntegration = vi.fn().mockResolvedValue({
      partnerTenantId: "new-tenant",
      partnerClientId: "new-client",
      partnerClientSecret: "new-secret",
    });

    vi.mocked(getSettingsService).mockReturnValue({
      updateIntegrationSettings: mockUpdateIntegration,
      isIntegrationConfigured: vi.fn().mockResolvedValue(true),
    } as any);

    const request = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        integration: {
          partnerTenantId: "new-tenant",
          partnerClientId: "new-client",
        },
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateIntegration).toHaveBeenCalledWith(
      { partnerTenantId: "new-tenant", partnerClientId: "new-client" },
      "web-ui"
    );
    // Secret should be masked in response
    expect(data.integration.partnerClientSecret).toBe("••••••••••••••••");
  });

  it("should update app settings", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockUpdateApp = vi.fn().mockResolvedValue({
      notificationsEnabled: true,
      slackWebhookUrl: "https://hooks.slack.com/services/new",
      teamsWebhookUrl: "https://outlook.office.com/webhook/new",
    });

    vi.mocked(getSettingsService).mockReturnValue({
      updateAppSettings: mockUpdateApp,
      isIntegrationConfigured: vi.fn().mockResolvedValue(true),
    } as any);

    const request = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        app: {
          notificationsEnabled: true,
          slackWebhookUrl: "https://hooks.slack.com/services/new",
        },
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockUpdateApp).toHaveBeenCalled();
    // Webhooks should be masked in response
    expect(data.app.slackWebhookUrl).toBe("••••••••••••••••");
    expect(data.app.teamsWebhookUrl).toBe("••••••••••••••••");
  });

  it("should update both integration and app settings", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockUpdateIntegration = vi.fn().mockResolvedValue({
      partnerTenantId: "tenant-123",
    });

    const mockUpdateApp = vi.fn().mockResolvedValue({
      notificationsEnabled: false,
    });

    vi.mocked(getSettingsService).mockReturnValue({
      updateIntegrationSettings: mockUpdateIntegration,
      updateAppSettings: mockUpdateApp,
      isIntegrationConfigured: vi.fn().mockResolvedValue(true),
    } as any);

    const request = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        integration: { partnerTenantId: "tenant-123" },
        app: { notificationsEnabled: false },
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdateIntegration).toHaveBeenCalled();
    expect(mockUpdateApp).toHaveBeenCalled();
  });

  it("should handle update errors", async () => {
    const { requireRole } = await import("@/lib/api-middleware");
    const { getSettingsService } = await import("@agentsync/core");

    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(getSettingsService).mockReturnValue({
      updateIntegrationSettings: vi.fn().mockRejectedValue(new Error("Validation failed")),
    } as any);

    const request = new NextRequest("http://localhost/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        integration: { partnerTenantId: "invalid" },
      }),
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.message).toBe("Failed to update settings");
  });
});
