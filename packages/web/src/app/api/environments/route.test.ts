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

// Mock dependencies
vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  isDemoMode: vi.fn(() => true),
  getEffectiveIntegrationSettings: vi.fn(),
  TokenManager: vi.fn(),
  PowerPlatformAdminClient: vi.fn(),
}));

describe("GET /api/environments", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-mock isDemoMode since clearAllMocks resets mock return values
    const { isDemoMode } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(true);
  });

  it("should return demo environments in demo mode", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(true);
    expect(data.environments).toBeDefined();
    expect(Array.isArray(data.environments)).toBe(true);
    expect(data.environments.length).toBeGreaterThan(0);
  });

  it("should include all environment metadata", async () => {
    const response = await GET();
    const data = await response.json();

    const env = data.environments[0];
    expect(env).toHaveProperty("id");
    expect(env).toHaveProperty("displayName");
    expect(env).toHaveProperty("uniqueName");
    expect(env).toHaveProperty("domainName");
    expect(env).toHaveProperty("type");
    expect(env).toHaveProperty("instanceUrl");
    expect(env).toHaveProperty("instanceApiUrl");
    expect(env).toHaveProperty("version");
    expect(env).toHaveProperty("state");
    expect(env).toHaveProperty("location");
    expect(env).toHaveProperty("isDefault");
    expect(env).toHaveProperty("createdTime");
  });

  it("should include both Production and Sandbox environments", async () => {
    const response = await GET();
    const data = await response.json();

    const types = data.environments.map((env: any) => env.type);
    expect(types).toContain("Production");
    expect(types).toContain("Sandbox");
  });

  it("should mark one environment as default", async () => {
    const response = await GET();
    const data = await response.json();

    const defaultEnvs = data.environments.filter((env: any) => env.isDefault);
    expect(defaultEnvs.length).toBeGreaterThanOrEqual(1);
  });

  it("should handle missing credentials in non-demo mode", async () => {
    const { isDemoMode, getEffectiveIntegrationSettings } = await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(getEffectiveIntegrationSettings).mockResolvedValue({
      partnerClientId: undefined,
      partnerClientSecret: undefined,
      partnerTenantId: undefined,
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.configured).toBe(false);
    expect(data.message).toContain("not configured");
    expect(data.environments).toEqual([]);
  });

  it("should list environments in non-demo mode when configured", async () => {
    const { isDemoMode, getEffectiveIntegrationSettings, TokenManager, PowerPlatformAdminClient } =
      await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(getEffectiveIntegrationSettings).mockResolvedValue({
      partnerClientId: "client-123",
      partnerClientSecret: "secret-456",
      partnerTenantId: "tenant-789",
    } as any);

    const mockListEnvironments = vi.fn().mockResolvedValue([
      {
        id: "env-1",
        displayName: "Production",
        uniqueName: "prod",
        type: "Production",
        state: "Ready",
      },
      {
        id: "env-2",
        displayName: "Development",
        uniqueName: "dev",
        type: "Sandbox",
        state: "Ready",
      },
    ]);

    vi.mocked(PowerPlatformAdminClient).mockImplementation(
      () =>
        ({
          listEnvironmentSummaries: mockListEnvironments,
        }) as any
    );

    vi.mocked(TokenManager).mockImplementation(() => ({}) as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(false);
    expect(data.configured).toBe(true);
    expect(data.environments.length).toBe(2);
  });

  it("should handle API errors gracefully", async () => {
    const { isDemoMode, getEffectiveIntegrationSettings, PowerPlatformAdminClient } =
      await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(getEffectiveIntegrationSettings).mockResolvedValue({
      partnerClientId: "client",
      partnerClientSecret: "secret",
      partnerTenantId: "tenant",
    } as any);

    vi.mocked(PowerPlatformAdminClient).mockImplementation(
      () =>
        ({
          listEnvironmentSummaries: vi.fn().mockRejectedValue(new Error("API timeout")),
        }) as any
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.message).toBe("Failed to fetch environments");
  });

  it("should include demo environment URLs", async () => {
    const response = await GET();
    const data = await response.json();

    data.environments.forEach((env: any) => {
      expect(env.instanceUrl).toMatch(/https:\/\/.*\.crm\.dynamics\.com/);
      expect(env.instanceApiUrl).toMatch(/https:\/\/.*\.api\.crm\.dynamics\.com/);
    });
  });

  it("should have consistent domain names", async () => {
    const response = await GET();
    const data = await response.json();

    data.environments.forEach((env: any) => {
      // uniqueName and domainName should match
      expect(env.uniqueName).toBe(env.domainName);

      // instanceUrl should contain the domain name
      expect(env.instanceUrl).toContain(env.domainName);
    });
  });
});
