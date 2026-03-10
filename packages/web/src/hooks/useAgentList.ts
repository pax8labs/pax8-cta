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

import { useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import type { Agent, AgentStatus } from "@/types/agent";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export type ViewMode = "active" | "archived";

export function useAgentList() {
  const { data, error, isLoading, mutate } = useSWR<{ agents: Agent[] }>("/api/agents", fetcher);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("active");
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Filter agents by search and view mode
  const filteredAgents = useMemo(() => {
    const agents: Agent[] = data?.agents || [];
    // First filter by view mode (active/deprecated vs archived)
    const byStatus = agents.filter((agent) => {
      const status = agent.status || "active";
      if (viewMode === "archived") return status === "archived";
      return status !== "archived"; // active view shows both active and deprecated
    });
    // Then filter by search
    if (!searchQuery) return byStatus;
    const query = searchQuery.toLowerCase();
    return byStatus.filter(
      (agent) =>
        agent.friendlyName.toLowerCase().includes(query) ||
        agent.uniqueName.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query) ||
        agent.category?.toLowerCase().includes(query) ||
        agent.publisherName?.toLowerCase().includes(query)
    );
  }, [data?.agents, searchQuery, viewMode]);

  // Count archived agents for the tab badge
  const archivedCount = useMemo(() => {
    const agents: Agent[] = data?.agents || [];
    return agents.filter((a) => (a.status || "active") === "archived").length;
  }, [data?.agents]);

  const toggleExpanded = useCallback((agentId: string) => {
    setExpandedAgentId((prev) => (prev === agentId ? null : agentId));
  }, []);

  return {
    agents: filteredAgents,
    allAgents: data?.agents || [],
    archivedCount,
    isLoading,
    error,
    mutate,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    expandedAgentId,
    toggleExpanded,
  };
}

export function useAgentTags(mutate: () => void) {
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [saving, setSaving] = useState(false);

  const startEditing = useCallback((agent: Agent) => {
    setEditingAgentId(agent.id);
    setEditInput(agent.tags?.join(", ") || "");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingAgentId(null);
    setEditInput("");
  }, []);

  const saveTags = useCallback(
    async (agentId: string) => {
      setSaving(true);
      try {
        const tags = editInput
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        const response = await fetch(`/api/agents/${agentId}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags }),
        });

        if (!response.ok) {
          throw new Error("Failed to save tags");
        }

        toast.success("Tags updated");
        mutate();
        cancelEditing();
      } catch (err) {
        console.error("Save tags error:", err);
        toast.error("Failed to save tags");
      } finally {
        setSaving(false);
      }
    },
    [editInput, mutate, cancelEditing]
  );

  return {
    editingAgentId,
    editInput,
    setEditInput,
    saving,
    startEditing,
    cancelEditing,
    saveTags,
  };
}

export function useAgentStatus(mutate: () => void) {
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    agentId: string;
    newStatus: AgentStatus;
  } | null>(null);

  const requestStatusChange = useCallback((agentId: string, newStatus: AgentStatus) => {
    setConfirmDialog({ agentId, newStatus });
  }, []);

  const cancelStatusChange = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const confirmStatusChange = useCallback(async () => {
    if (!confirmDialog) return;

    const { agentId, newStatus } = confirmDialog;
    setChangingStatusId(agentId);
    setConfirmDialog(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      const statusLabels: Record<AgentStatus, string> = {
        active: "activated",
        deprecated: "deprecated",
        archived: "archived",
      };
      toast.success(`Agent ${statusLabels[newStatus]}`);
      mutate();
    } catch (err) {
      console.error("Change status error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update agent status");
    } finally {
      setChangingStatusId(null);
    }
  }, [confirmDialog, mutate]);

  return {
    changingStatusId,
    confirmDialog,
    requestStatusChange,
    cancelStatusChange,
    confirmStatusChange,
  };
}
