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
import { POST } from "./route";
import { NextRequest, NextResponse } from "next/server";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    default: actual,
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };
});

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireRoles: vi.fn(),
  logAuthFailure: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  deploymentRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AppRoles: { ADMIN: "admin", DEPLOYER: "deployer", VIEWER: "viewer" },
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: new Map(),
  demoDeploymentsV2: { getByBatchId: vi.fn(() => []), set: vi.fn() },
  demoBatches: new Map(),
}));

vi.mock("@/lib/demo-worker", () => ({
  startDemoDeployment: vi.fn(),
}));

vi.mock("@/lib/posthog-server", () => ({
  serverTrackDeployment: vi.fn(),
  serverTrackError: vi.fn(),
}));

vi.mock("@/lib/repositories/deployment-repository", () => ({
  createBatch: vi.fn(),
  createDeployment: vi.fn(),
  updateBatchStatus: vi.fn(),
  updateDeploymentStatus: vi.fn(),
}));

vi.mock("@/lib/repositories/approval-repository", () => ({
  createApproval: vi.fn(),
  getApprovalByDeployment: vi.fn(),
}));

vi.mock("@/lib/repositories/audit-repository", () => ({
  logDeploymentAction: vi.fn(),
  logApprovalAction: vi.fn(),
}));

vi.mock("@/lib/queue-error-handler", () => ({
  isRedisConnectionError: vi.fn(() => false),
  createQueueUnavailableResponse: vi.fn(),
  safelyCloseQueueManager: vi.fn(),
}));

vi.mock("@agentsync/worker", () => ({
  DeploymentQueueManager: vi.fn(),
}));

vi.mock("@agentsync/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@agentsync/core")>()),
  isDemoMode: vi.fn(() => false),
  loadConfig: vi.fn(),
  DEMO_TENANTS: [
    {
      tenantId: "11111111-1111-1111-1111-111111111111",
      name: "Test Tenant",
      enabled: true,
      environmentUrl: "https://test.crm.dynamics.com",
    },
  ],
  getDeploymentNotifications: vi.fn(() => ({
    requiresApproval: false,
    notifyDeploymentStart: vi.fn(),
    notifyApprovalNeeded: vi.fn(),
    notifyDeploymentComplete: vi.fn(),
    notifyDeploymentFailed: vi.fn(),
  })),
}));

/**
 * Helper to create a NextRequest with a mocked formData() method.
 * This avoids jsdom issues where FormData with File objects may hang.
 */
function createFormDataRequest(fields: Record<string, string | File>): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  const request = new NextRequest("http://localhost/api/deployments/create", {
    method: "POST",
  });

  // Override formData() to return our prebuilt FormData without re-parsing the body
  vi.spyOn(request, "formData").mockResolvedValue(formData);
  return request;
}

describe("POST /api/deployments/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("File Validation", () => {
    it("should reject requests without a solution file", async () => {
      const { requireRoles } = await import("@/lib/api-middleware");
      const { deploymentRateLimit } = await import("@/lib/rate-limit");

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: "test", email: "test@example.com", roles: ["admin"] },
      } as any);
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: true,
        remaining: 10,
        reset: Date.now() + 60000,
      });

      const request = createFormDataRequest({
        tenantIds: JSON.stringify(["tenant-1"]),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain("Solution file is required");
    });

    it("should reject files that are too large", async () => {
      const { requireRoles } = await import("@/lib/api-middleware");
      const { deploymentRateLimit } = await import("@/lib/rate-limit");

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: "test", email: "test@example.com", roles: ["admin"] },
      } as any);
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: true,
        remaining: 10,
        reset: Date.now() + 60000,
      });

      // Create a small file but override its size to simulate a large file
      const largeFile = new File(["test"], "large-solution.zip", { type: "application/zip" });
      Object.defineProperty(largeFile, "size", { value: 101 * 1024 * 1024 });

      const request = createFormDataRequest({
        solution: largeFile,
        tenantIds: JSON.stringify(["tenant-1"]),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain("File too large");
    });

    it("should reject files with invalid extensions", async () => {
      const { requireRoles } = await import("@/lib/api-middleware");
      const { deploymentRateLimit } = await import("@/lib/rate-limit");

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: "test", email: "test@example.com", roles: ["admin"] },
      } as any);
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: true,
        remaining: 10,
        reset: Date.now() + 60000,
      });

      // Create a file with wrong extension
      const invalidFile = new File(["test content"], "malicious.exe", {
        type: "application/octet-stream",
      });

      const request = createFormDataRequest({
        solution: invalidFile,
        tenantIds: JSON.stringify(["tenant-1"]),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain("Invalid file extension");
      expect(data.error.details.allowedExtensions).toContain(".zip");
    });

    it("should accept valid ZIP files within size limits", async () => {
      const { requireRoles } = await import("@/lib/api-middleware");
      const { deploymentRateLimit } = await import("@/lib/rate-limit");
      const { isDemoMode } = await import("@agentsync/core");

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: "test", email: "test@example.com", roles: ["admin"] },
      } as any);
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: true,
        remaining: 10,
        reset: Date.now() + 60000,
      });
      vi.mocked(isDemoMode).mockReturnValue(true); // Use demo mode to avoid file system operations

      // Create a valid ZIP file with arrayBuffer support (jsdom File lacks it)
      const fileContent = new TextEncoder().encode("test content");
      const validFile = new File([fileContent], "valid-solution_managed.zip", {
        type: "application/zip",
      });
      (validFile as any).arrayBuffer = () => Promise.resolve(fileContent.buffer);

      const request = createFormDataRequest({
        solution: validFile,
        tenantIds: JSON.stringify(["11111111-1111-1111-1111-111111111111"]),
      });

      const response = await POST(request);

      // In demo mode, should create deployment successfully
      expect(response.status).toBe(200);
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits", async () => {
      const { requireRoles } = await import("@/lib/api-middleware");
      const { deploymentRateLimit, createRateLimitResponse } = await import("@/lib/rate-limit");

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: "test", email: "test@example.com", roles: ["admin"] },
      } as any);
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 60000,
      });
      vi.mocked(createRateLimitResponse).mockReturnValue(
        new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }) as any
      );

      const request = createFormDataRequest({
        solution: new File(["test"], "test.zip", { type: "application/zip" }),
        tenantIds: JSON.stringify(["tenant-1"]),
      });

      const response = await POST(request);

      expect(response.status).toBe(429);
    });
  });
});
