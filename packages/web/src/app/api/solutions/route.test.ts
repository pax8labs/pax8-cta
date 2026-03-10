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
vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(),
  getClientSecret: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
  SolutionOperations: vi.fn(),
  DEMO_CONFIG: {
    source: {
      environmentUrl: "https://demo-source.crm.dynamics.com",
      tenantId: "demo-tenant-id",
    },
    partner: {
      clientId: "demo-client-id",
    },
  },
  DEMO_SOLUTIONS: [
    {
      uniqueName: "demo_hr_agent",
      friendlyName: "HR Agent",
      version: "1.0.0",
      isManaged: true,
      publisherName: "Microsoft",
      description: "HR support agent",
    },
    {
      uniqueName: "demo_it_agent",
      friendlyName: "IT Agent",
      version: "2.1.0",
      isManaged: false,
      publisherName: "Contoso",
      description: "IT helpdesk agent",
    },
  ],
}));

describe("GET /api/solutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return demo solutions in demo mode", async () => {
    const { isDemoMode } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(true);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(true);
    expect(data.solutions).toBeDefined();
    expect(Array.isArray(data.solutions)).toBe(true);
  });

  it("should include source environment URL", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.sourceEnvironment).toBe("https://demo-source.crm.dynamics.com");
  });

  it("should return correct number of demo solutions", async () => {
    const response = await GET();
    const data = await response.json();

    expect(data.solutions.length).toBe(2);
  });

  it("should include all solution metadata fields", async () => {
    const response = await GET();
    const data = await response.json();

    const solution = data.solutions[0];
    expect(solution).toHaveProperty("id");
    expect(solution).toHaveProperty("uniqueName");
    expect(solution).toHaveProperty("friendlyName");
    expect(solution).toHaveProperty("version");
    expect(solution).toHaveProperty("isManaged");
    expect(solution).toHaveProperty("publisherName");
    expect(solution).toHaveProperty("description");
  });

  it("should map demo solution data correctly", async () => {
    const response = await GET();
    const data = await response.json();

    const hrAgent = data.solutions.find((s: any) => s.uniqueName === "demo_hr_agent");
    expect(hrAgent).toBeDefined();
    expect(hrAgent.friendlyName).toBe("HR Agent");
    expect(hrAgent.version).toBe("1.0.0");
    expect(hrAgent.isManaged).toBe(true);
    expect(hrAgent.publisherName).toBe("Microsoft");
  });

  it("should generate unique IDs for demo solutions", async () => {
    const response = await GET();
    const data = await response.json();

    const ids = data.solutions.map((s: any) => s.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should handle missing client secret in non-demo mode", async () => {
    const { isDemoMode, getClientSecret } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(getClientSecret).mockImplementation(() => {
      throw new Error("No secret");
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Client secret not configured");
    expect(data.error).toContain("PARTNER_CLIENT_SECRET");
  });

  it("should filter system solutions in non-demo mode", async () => {
    const { isDemoMode, loadConfig, getClientSecret, DataverseClient, SolutionOperations } =
      await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue({
      source: { tenantId: "tenant-1", environmentUrl: "https://test.crm.dynamics.com" },
      partner: { clientId: "client-123" },
      tenants: [],
    } as any);
    vi.mocked(getClientSecret).mockReturnValue("secret-123");

    const mockListSolutions = vi.fn().mockResolvedValue([
      {
        solutionid: "sol-1",
        uniquename: "CustomAgent",
        friendlyname: "Custom Agent",
        version: "1.0",
        ismanaged: false,
      },
      {
        solutionid: "sol-2",
        uniquename: "msdyn_System",
        friendlyname: "System",
        version: "1.0",
        ismanaged: true,
      },
      {
        solutionid: "sol-3",
        uniquename: "Microsoft_Base",
        friendlyname: "Base",
        version: "1.0",
        ismanaged: true,
      },
      {
        solutionid: "sol-4",
        uniquename: "Active",
        friendlyname: "Active",
        version: "1.0",
        ismanaged: true,
      },
      {
        solutionid: "sol-5",
        uniquename: "Basic",
        friendlyname: "Basic",
        version: "1.0",
        ismanaged: true,
      },
      {
        solutionid: "sol-6",
        uniquename: "Default",
        friendlyname: "Default",
        version: "1.0",
        ismanaged: true,
      },
    ]);

    vi.mocked(SolutionOperations).mockImplementation(
      () =>
        ({
          listSolutions: mockListSolutions,
        }) as any
    );

    vi.mocked(DataverseClient).mockImplementation(() => ({}) as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(false);
    // Should only include CustomAgent, all system solutions filtered out
    expect(data.solutions.length).toBe(1);
    expect(data.solutions[0].uniqueName).toBe("CustomAgent");
  });

  it("should handle load config errors", async () => {
    const { isDemoMode, loadConfig } = await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockRejectedValue(new Error("Config file not found"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Config file not found");
  });

  it("should handle solution listing errors", async () => {
    const { isDemoMode, loadConfig, getClientSecret, DataverseClient, SolutionOperations } =
      await import("@agentsync/core");

    vi.mocked(isDemoMode).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue({
      source: { tenantId: "tenant-1", environmentUrl: "https://test.crm.dynamics.com" },
      partner: { clientId: "client-123" },
      tenants: [],
    } as any);
    vi.mocked(getClientSecret).mockReturnValue("secret-123");

    const mockListSolutions = vi.fn().mockRejectedValue(new Error("API timeout"));

    vi.mocked(SolutionOperations).mockImplementation(
      () =>
        ({
          listSolutions: mockListSolutions,
        }) as any
    );

    vi.mocked(DataverseClient).mockImplementation(() => ({}) as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("API timeout");
  });
});
