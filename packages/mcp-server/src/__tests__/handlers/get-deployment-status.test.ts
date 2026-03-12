import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetDeploymentStatus } from "../../handlers/get-deployment-status.js";
import * as apiClient from "../../lib/api-client.js";
import { mockDeploymentStatusResponse } from "../helpers/mocks.js";

vi.mock("../../lib/api-client.js");
vi.mock("../../lib/logger.js");

describe("handleGetDeploymentStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get deployment status by ID", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockDeploymentStatusResponse);

    const result = await handleGetDeploymentStatus({ deploymentId: "batch-test-123" });

    expect(apiClient.get).toHaveBeenCalledWith("/api/deployments/batch-test-123");
    expect(result.content[0].text).toBe(JSON.stringify(mockDeploymentStatusResponse, null, 2));
  });

  it("should throw validation error for missing deploymentId", async () => {
    await expect(handleGetDeploymentStatus({})).rejects.toThrow(/Validation failed/);
  });

  it("should throw validation error for invalid deploymentId format", async () => {
    await expect(handleGetDeploymentStatus({ deploymentId: "invalid@id" })).rejects.toThrow(
      /Validation failed/
    );
  });

  it("should handle API errors", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Deployment not found"));

    await expect(handleGetDeploymentStatus({ deploymentId: "batch-123" })).rejects.toThrow(
      "Deployment not found"
    );
  });
});
