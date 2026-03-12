import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleCreateDeployment } from "../../handlers/create-deployment.js";
import * as core from "@agentsync/core";

vi.mock("@agentsync/core", async () => {
  const actual = await vi.importActual("@agentsync/core");
  return {
    ...actual,
    createDeployment: vi.fn(),
  };
});
vi.mock("../../lib/logger.js");

describe("handleCreateDeployment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create deployment successfully", async () => {
    const mockResponse = {
      deploymentId: "batch-123",
      batchId: "batch-123",
      solutionPath: "/solutions/product-demo_managed.zip",
      tenantCount: 2,
      message: "Deployment created successfully",
    };

    vi.mocked(core.createDeployment).mockResolvedValue(mockResponse);

    const result = await handleCreateDeployment({
      agentId: "product-demo",
      tenantIds: ["tenant-1", "tenant-2"],
    });

    expect(core.createDeployment).toHaveBeenCalledWith({
      agentId: "product-demo",
      tenantIds: ["tenant-1", "tenant-2"],
    });
    expect(result.content[0].text).toBe(JSON.stringify(mockResponse, null, 2));
  });

  it("should throw validation error for missing agentId", async () => {
    await expect(handleCreateDeployment({ tenantIds: ["tenant-1"] })).rejects.toThrow(
      /agentId is required/
    );
  });

  it("should throw validation error for invalid agentId type", async () => {
    await expect(handleCreateDeployment({ agentId: 123, tenantIds: ["tenant-1"] })).rejects.toThrow(
      /agentId is required and must be a string/
    );
  });

  it("should throw validation error for missing tenantIds", async () => {
    await expect(handleCreateDeployment({ agentId: "product-demo" })).rejects.toThrow(
      /tenantIds is required/
    );
  });

  it("should throw validation error for empty tenantIds array", async () => {
    await expect(
      handleCreateDeployment({ agentId: "product-demo", tenantIds: [] })
    ).rejects.toThrow(/tenantIds is required and must be a non-empty array/);
  });

  it("should throw validation error for invalid tenantIds type", async () => {
    await expect(
      handleCreateDeployment({ agentId: "product-demo", tenantIds: "not-an-array" })
    ).rejects.toThrow(/tenantIds is required and must be a non-empty array/);
  });

  it("should handle API errors from createDeployment", async () => {
    vi.mocked(core.createDeployment).mockRejectedValue(
      new Error("Failed to download solution: 404")
    );

    await expect(
      handleCreateDeployment({
        agentId: "invalid-agent",
        tenantIds: ["tenant-1"],
      })
    ).rejects.toThrow("Failed to download solution: 404");
  });

  it("should handle deployment with demo mode flag", async () => {
    const mockResponse = {
      deploymentId: "batch-456",
      batchId: "batch-456",
      demoMode: true,
      solutionPath: "/solutions/faq-bot_managed.zip",
      tenantCount: 1,
      message: "Demo deployment created",
    };

    vi.mocked(core.createDeployment).mockResolvedValue(mockResponse);

    const result = await handleCreateDeployment({
      agentId: "faq-bot",
      tenantIds: ["demo-tenant"],
    });

    expect(result.content[0].text).toContain('"demoMode": true');
  });

  it("should handle deployment requiring approval", async () => {
    const mockResponse = {
      deploymentId: "batch-789",
      batchId: "batch-789",
      solutionPath: "/solutions/hr-assistant_managed.zip",
      tenantCount: 5,
      approvalRequired: true,
      message: "Deployment pending approval",
    };

    vi.mocked(core.createDeployment).mockResolvedValue(mockResponse);

    const result = await handleCreateDeployment({
      agentId: "hr-assistant",
      tenantIds: ["t1", "t2", "t3", "t4", "t5"],
    });

    expect(result.content[0].text).toContain('"approvalRequired": true');
    expect(result.content[0].text).toContain('"tenantCount": 5');
  });
});
