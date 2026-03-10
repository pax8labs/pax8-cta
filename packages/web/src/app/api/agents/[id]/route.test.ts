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
import { DELETE } from "./route";
import { NextRequest, NextResponse } from "next/server";

// Mock dependencies
vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => true),
  DEMO_SOLUTIONS: [
    {
      uniqueName: "built_in_hr_agent",
      friendlyName: "Built-in HR Agent",
      version: "1.0.0",
      isManaged: true,
    },
    {
      uniqueName: "built_in_it_agent",
      friendlyName: "Built-in IT Agent",
      version: "2.0.0",
      isManaged: true,
    },
  ],
}));

vi.mock("@/lib/demo-store", () => {
  const customAgents = new Map([
    [
      "custom_agent_1",
      {
        id: "custom_agent_1",
        uniqueName: "custom_agent_1",
        friendlyName: "Custom Agent 1",
        version: "1.0.0",
        isCustom: true,
      },
    ],
    [
      "custom_agent_2",
      {
        id: "custom_agent_2",
        uniqueName: "custom_agent_2",
        friendlyName: "Custom Agent 2",
        version: "1.5.0",
        isCustom: true,
      },
    ],
  ]);

  return {
    demoCustomAgents: customAgents,
  };
});

describe("DELETE /api/agents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset custom agents map to initial state
    const { demoCustomAgents } = require("@/lib/demo-store");
    demoCustomAgents.clear();
    demoCustomAgents.set("custom_agent_1", {
      id: "custom_agent_1",
      uniqueName: "custom_agent_1",
      friendlyName: "Custom Agent 1",
      version: "1.0.0",
      isCustom: true,
    });
    demoCustomAgents.set("custom_agent_2", {
      id: "custom_agent_2",
      uniqueName: "custom_agent_2",
      friendlyName: "Custom Agent 2",
      version: "1.5.0",
      isCustom: true,
    });
  });

  it("should require agent ID", async () => {
    const params = Promise.resolve({ id: "" });
    const request = new NextRequest("http://localhost/api/agents/", { method: "DELETE" });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Agent ID is required");
  });

  it("should prevent deletion of built-in agents", async () => {
    const params = Promise.resolve({ id: "built_in_hr_agent" });
    const request = new NextRequest("http://localhost/api/agents/built_in_hr_agent", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Built-in agents cannot be deleted");
  });

  it("should return 404 for non-existent custom agent", async () => {
    const params = Promise.resolve({ id: "nonexistent_agent" });
    const request = new NextRequest("http://localhost/api/agents/nonexistent_agent", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Agent not found");
  });

  it("should successfully delete custom agent", async () => {
    const params = Promise.resolve({ id: "custom_agent_1" });
    const request = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("Custom Agent 1");
    expect(data.message).toContain("deleted successfully");
  });

  it("should remove agent from store after deletion", async () => {
    const { demoCustomAgents } = await import("@/lib/demo-store");

    const params = Promise.resolve({ id: "custom_agent_2" });
    const request = new NextRequest("http://localhost/api/agents/custom_agent_2", {
      method: "DELETE",
    });

    expect(demoCustomAgents.has("custom_agent_2")).toBe(true);

    await DELETE(request, { params });

    expect(demoCustomAgents.has("custom_agent_2")).toBe(false);
  });

  it("should handle multiple deletions correctly", async () => {
    const { demoCustomAgents } = await import("@/lib/demo-store");

    // Delete first agent
    const params1 = Promise.resolve({ id: "custom_agent_1" });
    const request1 = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });
    const response1 = await DELETE(request1, { params: params1 });

    expect(response1.status).toBe(200);
    expect(demoCustomAgents.has("custom_agent_1")).toBe(false);
    expect(demoCustomAgents.has("custom_agent_2")).toBe(true);

    // Delete second agent
    const params2 = Promise.resolve({ id: "custom_agent_2" });
    const request2 = new NextRequest("http://localhost/api/agents/custom_agent_2", {
      method: "DELETE",
    });
    const response2 = await DELETE(request2, { params: params2 });

    expect(response2.status).toBe(200);
    expect(demoCustomAgents.has("custom_agent_2")).toBe(false);
    expect(demoCustomAgents.size).toBe(0);
  });

  it("should return 501 in non-demo mode", async () => {
    const { isDemoMode } = await import("@agentsync/core");
    vi.mocked(isDemoMode).mockReturnValue(false);

    const params = Promise.resolve({ id: "custom_agent_1" });
    const request = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.error).toContain("not yet implemented");
  });

  it("should not delete already deleted agent", async () => {
    const params = Promise.resolve({ id: "custom_agent_1" });
    const request1 = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });

    // First deletion succeeds
    const response1 = await DELETE(request1, { params });
    expect(response1.status).toBe(200);

    // Second deletion fails with 404
    const request2 = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });
    const response2 = await DELETE(request2, { params });
    const data2 = await response2.json();

    expect(response2.status).toBe(404);
    expect(data2.error).toBe("Agent not found");
  });

  it("should preserve other agents when deleting one", async () => {
    const { demoCustomAgents } = await import("@/lib/demo-store");

    const initialSize = demoCustomAgents.size;

    const params = Promise.resolve({ id: "custom_agent_1" });
    const request = new NextRequest("http://localhost/api/agents/custom_agent_1", {
      method: "DELETE",
    });
    await DELETE(request, { params });

    expect(demoCustomAgents.size).toBe(initialSize - 1);
    expect(demoCustomAgents.has("custom_agent_2")).toBe(true);
  });

  it("should check built-in agents before custom agents", async () => {
    const { demoCustomAgents } = await import("@/lib/demo-store");

    // Add a custom agent with same ID as built-in (edge case)
    demoCustomAgents.set("built_in_hr_agent", {
      id: "built_in_hr_agent",
      uniqueName: "built_in_hr_agent",
      friendlyName: "Fake Custom Agent",
      version: "1.0.0",
      isCustom: true,
    });

    const params = Promise.resolve({ id: "built_in_hr_agent" });
    const request = new NextRequest("http://localhost/api/agents/built_in_hr_agent", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params });
    const data = await response.json();

    // Should still prevent deletion because it's a built-in agent ID
    expect(response.status).toBe(403);
    expect(data.error).toBe("Built-in agents cannot be deleted");
  });
});
