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
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAgentList, useAgentTags, useAgentStatus } from "./useAgentList";
import type { Agent } from "@/types/agent";

// Mock SWR
vi.mock("swr", () => ({
  default: vi.fn(),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import useSWR from "swr";
import { toast } from "sonner";

const mockUseSWR = useSWR as ReturnType<typeof vi.fn>;

const createMockAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: "agent-1",
  uniqueName: "test_agent",
  friendlyName: "Test Agent",
  version: "1.0.0",
  isManaged: true,
  status: "active",
  deployedTenants: [],
  totalDeployments: 0,
  ...overrides,
});

describe("useAgentList", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("data fetching", () => {
    it("should return agents from SWR", () => {
      const agents = [createMockAgent()];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      expect(result.current.agents).toEqual(agents);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeUndefined();
    });

    it("should handle loading state", () => {
      mockUseSWR.mockReturnValue({
        data: undefined,
        error: undefined,
        isLoading: true,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.agents).toEqual([]);
    });

    it("should handle error state", () => {
      const error = new Error("Failed to fetch");
      mockUseSWR.mockReturnValue({
        data: undefined,
        error,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      expect(result.current.error).toBe(error);
    });
  });

  describe("filtering", () => {
    it("should filter agents by search query (friendlyName)", () => {
      const agents = [
        createMockAgent({ id: "1", friendlyName: "Sales Bot", uniqueName: "sales_bot" }),
        createMockAgent({ id: "2", friendlyName: "Support Bot", uniqueName: "support_bot" }),
        createMockAgent({ id: "3", friendlyName: "HR Assistant", uniqueName: "hr_assistant" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.setSearchQuery("bot");
      });

      expect(result.current.agents).toHaveLength(2);
      expect(result.current.agents.map((a) => a.friendlyName)).toEqual([
        "Sales Bot",
        "Support Bot",
      ]);
    });

    it("should filter agents by search query (uniqueName)", () => {
      const agents = [
        createMockAgent({ id: "1", friendlyName: "Sales Bot", uniqueName: "sales_bot" }),
        createMockAgent({ id: "2", friendlyName: "Support Bot", uniqueName: "support_bot" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.setSearchQuery("support_bot");
      });

      expect(result.current.agents).toHaveLength(1);
      expect(result.current.agents[0].uniqueName).toBe("support_bot");
    });

    it("should filter agents by description", () => {
      const agents = [
        createMockAgent({
          id: "1",
          friendlyName: "Bot A",
          description: "Handles customer inquiries",
        }),
        createMockAgent({ id: "2", friendlyName: "Bot B", description: "Internal tool" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.setSearchQuery("customer");
      });

      expect(result.current.agents).toHaveLength(1);
      expect(result.current.agents[0].friendlyName).toBe("Bot A");
    });

    it("should be case-insensitive", () => {
      const agents = [createMockAgent({ id: "1", friendlyName: "Sales Bot" })];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.setSearchQuery("SALES");
      });

      expect(result.current.agents).toHaveLength(1);
    });
  });

  describe("view modes", () => {
    it("should show only active agents in active view", () => {
      const agents = [
        createMockAgent({ id: "1", status: "active" }),
        createMockAgent({ id: "2", status: "deprecated" }),
        createMockAgent({ id: "3", status: "archived" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      // Default view is 'active' which shows active and deprecated
      expect(result.current.agents).toHaveLength(2);
      expect(result.current.agents.map((a) => a.status)).toEqual(["active", "deprecated"]);
    });

    it("should show only archived agents in archived view", () => {
      const agents = [
        createMockAgent({ id: "1", status: "active" }),
        createMockAgent({ id: "2", status: "archived" }),
        createMockAgent({ id: "3", status: "archived" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.setViewMode("archived");
      });

      expect(result.current.agents).toHaveLength(2);
      expect(result.current.agents.every((a) => a.status === "archived")).toBe(true);
    });

    it("should count archived agents correctly", () => {
      const agents = [
        createMockAgent({ id: "1", status: "active" }),
        createMockAgent({ id: "2", status: "archived" }),
        createMockAgent({ id: "3", status: "archived" }),
      ];
      mockUseSWR.mockReturnValue({
        data: { agents },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      expect(result.current.archivedCount).toBe(2);
    });
  });

  describe("expand/collapse", () => {
    it("should toggle expanded state", () => {
      mockUseSWR.mockReturnValue({
        data: { agents: [] },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      expect(result.current.expandedAgentId).toBeNull();

      act(() => {
        result.current.toggleExpanded("agent-1");
      });

      expect(result.current.expandedAgentId).toBe("agent-1");

      act(() => {
        result.current.toggleExpanded("agent-1");
      });

      expect(result.current.expandedAgentId).toBeNull();
    });

    it("should switch to different agent when clicking another", () => {
      mockUseSWR.mockReturnValue({
        data: { agents: [] },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
      });

      const { result } = renderHook(() => useAgentList());

      act(() => {
        result.current.toggleExpanded("agent-1");
      });

      expect(result.current.expandedAgentId).toBe("agent-1");

      act(() => {
        result.current.toggleExpanded("agent-2");
      });

      expect(result.current.expandedAgentId).toBe("agent-2");
    });
  });
});

describe("useAgentTags", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should start editing with current tags", () => {
    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent({ tags: ["tag1", "tag2"] });

    act(() => {
      result.current.startEditing(agent);
    });

    expect(result.current.editingAgentId).toBe(agent.id);
    expect(result.current.editInput).toBe("tag1, tag2");
  });

  it("should handle empty tags", () => {
    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent({ tags: [] });

    act(() => {
      result.current.startEditing(agent);
    });

    expect(result.current.editInput).toBe("");
  });

  it("should cancel editing", () => {
    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent({ tags: ["tag1"] });

    act(() => {
      result.current.startEditing(agent);
    });

    expect(result.current.editingAgentId).toBe(agent.id);

    act(() => {
      result.current.cancelEditing();
    });

    expect(result.current.editingAgentId).toBeNull();
    expect(result.current.editInput).toBe("");
  });

  it("should save tags successfully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent();

    act(() => {
      result.current.startEditing(agent);
      result.current.setEditInput("new-tag, another-tag");
    });

    await act(async () => {
      await result.current.saveTags(agent.id);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/agents/${agent.id}/tags`,
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ tags: ["new-tag", "another-tag"] }),
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Tags updated");
    expect(mockMutate).toHaveBeenCalled();
  });

  it("should handle save failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
    });

    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent();

    act(() => {
      result.current.startEditing(agent);
      result.current.setEditInput("tag1");
    });

    await act(async () => {
      await result.current.saveTags(agent.id);
    });

    expect(toast.error).toHaveBeenCalledWith("Failed to save tags");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("should parse tags correctly with various separators", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useAgentTags(mockMutate));
    const agent = createMockAgent();

    act(() => {
      result.current.startEditing(agent);
      result.current.setEditInput("  tag1  ,  tag2,tag3  , , ");
    });

    await act(async () => {
      await result.current.saveTags(agent.id);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ tags: ["tag1", "tag2", "tag3"] }),
      })
    );
  });
});

describe("useAgentStatus", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should request status change and show confirm dialog", () => {
    const { result } = renderHook(() => useAgentStatus(mockMutate));

    act(() => {
      result.current.requestStatusChange("agent-1", "archived");
    });

    expect(result.current.confirmDialog).toEqual({
      agentId: "agent-1",
      newStatus: "archived",
    });
  });

  it("should cancel status change", () => {
    const { result } = renderHook(() => useAgentStatus(mockMutate));

    act(() => {
      result.current.requestStatusChange("agent-1", "archived");
    });

    expect(result.current.confirmDialog).not.toBeNull();

    act(() => {
      result.current.cancelStatusChange();
    });

    expect(result.current.confirmDialog).toBeNull();
  });

  it("should confirm status change successfully", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useAgentStatus(mockMutate));

    act(() => {
      result.current.requestStatusChange("agent-1", "archived");
    });

    await act(async () => {
      await result.current.confirmStatusChange();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/agents/agent-1/status",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ status: "archived" }),
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Agent archived");
    expect(mockMutate).toHaveBeenCalled();
    expect(result.current.confirmDialog).toBeNull();
  });

  it("should handle status change failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
    });

    const { result } = renderHook(() => useAgentStatus(mockMutate));

    act(() => {
      result.current.requestStatusChange("agent-1", "deprecated");
    });

    await act(async () => {
      await result.current.confirmStatusChange();
    });

    expect(toast.error).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("should do nothing if no confirm dialog", async () => {
    const { result } = renderHook(() => useAgentStatus(mockMutate));

    await act(async () => {
      await result.current.confirmStatusChange();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
