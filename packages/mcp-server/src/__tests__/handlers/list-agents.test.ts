import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleListAgents } from "../../handlers/list-agents.js";
import * as apiClient from "../../lib/api-client.js";
import { mockAgentsResponse } from "../helpers/mocks.js";

vi.mock("../../lib/api-client.js");
vi.mock("../../lib/logger.js");

describe("handleListAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list all agents", async () => {
    vi.mocked(apiClient.get).mockResolvedValue(mockAgentsResponse);

    const result = await handleListAgents({});

    expect(apiClient.get).toHaveBeenCalledWith("/api/agents");
    expect(result.content[0].text).toBe(JSON.stringify(mockAgentsResponse, null, 2));
  });

  it("should reject unexpected parameters", async () => {
    await expect(handleListAgents({ unexpected: "param" })).rejects.toThrow(/Validation failed/);
  });

  it("should handle API errors", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("API Error"));

    await expect(handleListAgents({})).rejects.toThrow("API Error");
  });
});
