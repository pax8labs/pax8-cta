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
import { GET, POST, DELETE } from "./route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AppRoles: {
    ADMIN: "admin",
    DEPLOYER: "deployer",
    VIEWER: "viewer",
  },
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  loadConfig: vi.fn(),
  SchedulerService: vi.fn(),
}));

vi.mock("@agentsync/worker", () => ({
  DeploymentQueueManager: vi.fn(),
}));

vi.mock("@/lib/queue-error-handler", () => ({
  isRedisConnectionError: vi.fn(() => false),
  createQueueUnavailableResponse: vi.fn(),
  safelyCloseQueueManager: vi.fn(),
}));

describe("GET /api/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(vi.mocked(requireAuth)).toHaveBeenCalled();
  });

  it("should return disabled status when no schedule configured", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { loadConfig } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: {}, // No schedule
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enabled).toBe(false);
    expect(data.message).toContain("No schedule configured");
  });

  it("should return schedule details when configured", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { loadConfig, SchedulerService } = await import("@agentsync/core");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const mockGetNextRuns = vi
      .fn()
      .mockReturnValue([new Date("2024-01-01T00:00:00Z"), new Date("2024-01-02T00:00:00Z")]);
    const mockIsWithinMaintenanceWindow = vi.fn().mockReturnValue(true);
    const mockDescribeCron = vi.fn().mockReturnValue("Daily at midnight");

    vi.mocked(SchedulerService).mockImplementation(
      () =>
        ({
          getNextRuns: mockGetNextRuns,
          isWithinMaintenanceWindow: mockIsWithinMaintenanceWindow,
          describeCron: mockDescribeCron,
        }) as any
    );

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: {
        schedule: {
          cron: "0 0 * * *",
          timezone: "America/New_York",
          maintenanceWindow: { start: "00:00", end: "04:00" },
        },
      },
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enabled).toBe(true);
    expect(data.cron).toBe("0 0 * * *");
    expect(data.timezone).toBe("America/New_York");
    expect(data.cronDescription).toBe("Daily at midnight");
    expect(data.isCurrentlyInWindow).toBe(true);
    expect(data.nextRuns).toHaveLength(2);
  });

  it("should include registered schedules from Redis", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { loadConfig, SchedulerService } = await import("@agentsync/core");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    const mockListScheduledDeployments = vi.fn().mockResolvedValue([
      {
        id: "schedule-1",
        name: "Daily Deployment",
        cron: "0 0 * * *",
        timezone: "UTC",
        nextRun: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    const mockClose = vi.fn();

    vi.mocked(DeploymentQueueManager).mockImplementation(
      () =>
        ({
          listScheduledDeployments: mockListScheduledDeployments,
          close: mockClose,
        }) as any
    );

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: {},
    } as any);

    vi.mocked(SchedulerService).mockImplementation(
      () =>
        ({
          getNextRuns: vi.fn().mockReturnValue([]),
          isWithinMaintenanceWindow: vi.fn().mockReturnValue(false),
          describeCron: vi.fn().mockReturnValue(""),
        }) as any
    );

    const response = await GET();
    const data = await response.json();

    expect(data.registeredSchedules).toHaveLength(1);
    expect(data.registeredSchedules[0].id).toBe("schedule-1");
    expect(mockClose).toHaveBeenCalled();
  });

  it("should handle Redis connection errors gracefully", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { loadConfig, SchedulerService } = await import("@agentsync/core");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(DeploymentQueueManager).mockImplementation(() => {
      throw new Error("Redis connection failed");
    });

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: {},
    } as any);

    vi.mocked(SchedulerService).mockImplementation(
      () =>
        ({
          getNextRuns: vi.fn().mockReturnValue([]),
          isWithinMaintenanceWindow: vi.fn().mockReturnValue(false),
          describeCron: vi.fn().mockReturnValue(""),
        }) as any
    );

    const response = await GET();
    const data = await response.json();

    // Should still return 200 with empty registered schedules
    expect(response.status).toBe(200);
    expect(data.registeredSchedules).toEqual([]);
  });
});

describe("POST /api/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Admin or Deployer role", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { AppRoles } = await import("@/lib/auth");

    vi.mocked(requireRoles).mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const request = new NextRequest("http://localhost/api/schedules", {
      method: "POST",
      body: JSON.stringify({ solutionPath: "/path/to/solution.zip", solutionName: "TestAgent" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRoles)).toHaveBeenCalledWith([AppRoles.ADMIN, AppRoles.DEPLOYER]);
  });

  it("should require solutionPath and solutionName", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const request = new NextRequest("http://localhost/api/schedules", {
      method: "POST",
      body: JSON.stringify({ solutionPath: "/path/to/solution.zip" }), // Missing solutionName
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.message).toContain("solutionPath and solutionName are required");
  });

  it("should register schedules successfully", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { loadConfig } = await import("@agentsync/core");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: { schedule: { cron: "0 0 * * *" } },
    } as any);

    const mockRegisterScheduled = vi.fn().mockResolvedValue({
      registered: 2,
      errors: [],
    });
    const mockListScheduled = vi.fn().mockResolvedValue([
      {
        id: "schedule-1",
        name: "Schedule 1",
        cron: "0 0 * * *",
        timezone: "UTC",
        nextRun: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    const mockClose = vi.fn();

    vi.mocked(DeploymentQueueManager).mockImplementation(
      () =>
        ({
          registerScheduledDeploymentsFromConfig: mockRegisterScheduled,
          listScheduledDeployments: mockListScheduled,
          close: mockClose,
        }) as any
    );

    const request = new NextRequest("http://localhost/api/schedules", {
      method: "POST",
      body: JSON.stringify({
        solutionPath: "/path/to/solution.zip",
        solutionName: "TestAgent",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.registered).toBe(2);
    expect(data.schedules).toHaveLength(1);
    expect(mockClose).toHaveBeenCalled();
  });

  it("should return errors from registration", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { loadConfig } = await import("@agentsync/core");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [],
      settings: { schedule: { cron: "0 0 * * *" } },
    } as any);

    const mockRegisterScheduled = vi.fn().mockResolvedValue({
      registered: 1,
      errors: ["Failed to register schedule 2"],
    });
    const mockListScheduled = vi.fn().mockResolvedValue([]);
    const mockClose = vi.fn();

    vi.mocked(DeploymentQueueManager).mockImplementation(
      () =>
        ({
          registerScheduledDeploymentsFromConfig: mockRegisterScheduled,
          listScheduledDeployments: mockListScheduled,
          close: mockClose,
        }) as any
    );

    const request = new NextRequest("http://localhost/api/schedules", {
      method: "POST",
      body: JSON.stringify({
        solutionPath: "/path/to/solution.zip",
        solutionName: "TestAgent",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.errors).toHaveLength(1);
  });
});

describe("DELETE /api/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require Admin role", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { AppRoles } = await import("@/lib/auth");

    vi.mocked(requireRoles).mockResolvedValue(
      new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any
    );

    const response = await DELETE();

    expect(response.status).toBe(403);
    expect(vi.mocked(requireRoles)).toHaveBeenCalledWith([AppRoles.ADMIN]);
  });

  it("should remove all scheduled deployments", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockRemoveAll = vi.fn().mockResolvedValue(5);
    const mockClose = vi.fn();

    vi.mocked(DeploymentQueueManager).mockImplementation(
      () =>
        ({
          removeAllScheduledDeployments: mockRemoveAll,
          close: mockClose,
        }) as any
    );

    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.removed).toBe(5);
    expect(mockClose).toHaveBeenCalled();
  });

  it("should handle removal errors", async () => {
    const { requireRoles } = await import("@/lib/api-middleware");
    const { DeploymentQueueManager } = await import("@agentsync/worker");

    vi.mocked(requireRoles).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    const mockRemoveAll = vi.fn().mockRejectedValue(new Error("Unexpected failure"));

    vi.mocked(DeploymentQueueManager).mockImplementation(
      () =>
        ({
          removeAllScheduledDeployments: mockRemoveAll,
        }) as any
    );

    const response = await DELETE();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error.message).toBe("Failed to remove schedules");
    // safelyCloseQueueManager handles cleanup on error
    const { safelyCloseQueueManager } = await import("@/lib/queue-error-handler");
    expect(vi.mocked(safelyCloseQueueManager)).toHaveBeenCalled();
  });
});
