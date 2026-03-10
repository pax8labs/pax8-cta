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

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { SolutionMetadata, UploadConflict, Environment, SourceSolution } from "@/types/agent";

export function useAgentUpload(onSuccess: () => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [metadata, setMetadata] = useState<SolutionMetadata | null>(null);

  // Conflict resolution state
  const [conflict, setConflict] = useState<UploadConflict | null>(null);
  const [conflictMode, setConflictMode] = useState<"update" | "create" | null>(null);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentFriendlyName, setNewAgentFriendlyName] = useState("");
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      toast.error("Please select a .zip file exported from Copilot Studio");
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
    setIsUploading(true);
    setMetadata(null);
    setConflict(null);
    setConflictMode(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/solutions/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      // Check if there's a conflict
      if (result.conflict) {
        setConflict({
          existingAgent: result.existingAgent,
          newAgent: result.newAgent,
          metadata: result.metadata,
          urlTemplates: result.urlTemplates,
          solutionBase64: result.solutionBase64,
        });
        setMetadata(result.metadata);
        setNewAgentName(result.metadata.uniqueName + "_v2");
        setNewAgentFriendlyName(result.metadata.friendlyName + " (Copy)");
        return;
      }

      if (!response.ok) throw new Error(result.error || "Failed to parse solution");

      setMetadata(result.metadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process solution file";
      setUploadError(message);
      toast.error(message);
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleResolveConflict = useCallback(
    async (action: "update" | "create") => {
      if (!conflict) return;

      setIsResolvingConflict(true);
      setUploadError(null);

      try {
        const response = await fetch("/api/solutions/upload/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            originalUniqueName: conflict.existingAgent.uniqueName,
            newUniqueName: action === "create" ? newAgentName : undefined,
            newFriendlyName: action === "create" ? newAgentFriendlyName : undefined,
            metadata: conflict.metadata,
            urlTemplates: conflict.urlTemplates,
            solutionBase64: conflict.solutionBase64,
          }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to resolve conflict");

        toast.success(action === "update" ? "Agent updated" : "Agent created");
        reset();
        onSuccess();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve conflict";
        setUploadError(message);
        toast.error(message);
      } finally {
        setIsResolvingConflict(false);
      }
    },
    [conflict, newAgentName, newAgentFriendlyName, onSuccess]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const confirmUpload = useCallback(() => {
    toast.success("Agent added successfully");
    reset();
    onSuccess();
  }, [onSuccess]);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setMetadata(null);
    setUploadError(null);
    setConflict(null);
    setConflictMode(null);
    setNewAgentName("");
    setNewAgentFriendlyName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    fileInputRef,
    isUploading,
    uploadError,
    selectedFile,
    isDragging,
    metadata,
    conflict,
    conflictMode,
    setConflictMode,
    newAgentName,
    setNewAgentName,
    newAgentFriendlyName,
    setNewAgentFriendlyName,
    isResolvingConflict,
    handleFileSelect,
    handleResolveConflict,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    confirmUpload,
    reset,
  };
}

export function useEnvironmentBrowser() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [isLoadingEnvironments, setIsLoadingEnvironments] = useState(false);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null);

  const [solutions, setSolutions] = useState<SourceSolution[]>([]);
  const [isLoadingSolutions, setIsLoadingSolutions] = useState(false);
  const [sourceEnvironmentUrl, setSourceEnvironmentUrl] = useState<string | null>(null);

  const [showAgentsOnly, setShowAgentsOnly] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);

  const loadEnvironments = useCallback(async () => {
    setIsLoadingEnvironments(true);
    try {
      const response = await fetch("/api/environments");
      const data = await response.json();
      if (data.environments) {
        setEnvironments(data.environments);
        // Auto-select first environment if none selected
        if (data.environments.length > 0) {
          const defaultEnv =
            data.environments.find((e: Environment) => e.isDefault) || data.environments[0];
          setSelectedEnvironment(defaultEnv.instanceUrl || defaultEnv.environmentUrl);
          return defaultEnv.instanceUrl || defaultEnv.environmentUrl;
        }
      }
    } catch (err) {
      console.error("Failed to load environments:", err);
      toast.error("Failed to load environments");
    } finally {
      setIsLoadingEnvironments(false);
    }
    return null;
  }, []);

  const loadSolutions = useCallback(
    async (envUrl?: string) => {
      const url = envUrl || selectedEnvironment;
      if (!url) return;

      setIsLoadingSolutions(true);
      setSolutions([]);
      try {
        const params = new URLSearchParams();
        params.set("environmentUrl", url);
        if (showAgentsOnly) {
          params.set("botsOnly", "true");
        }
        const response = await fetch(`/api/solutions/source?${params.toString()}`);
        const data = await response.json();
        if (data.solutions) {
          setSolutions(data.solutions);
          setSourceEnvironmentUrl(data.sourceEnvironment);
        }
      } catch (err) {
        console.error("Failed to load source solutions:", err);
        toast.error("Failed to load solutions");
      } finally {
        setIsLoadingSolutions(false);
      }
    },
    [selectedEnvironment, showAgentsOnly]
  );

  const importSolution = useCallback(
    async (solution: SourceSolution, onSuccess: () => void) => {
      setImportingId(solution.uniqueName);
      try {
        const response = await fetch("/api/solutions/import-from-environment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            solutionUniqueName: solution.uniqueName,
            environmentUrl: sourceEnvironmentUrl,
            displayName: solution.name,
            description: solution.description,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Failed to import");

        toast.success(`Imported ${solution.name}`);
        onSuccess();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import solution";
        toast.error(message);
      } finally {
        setImportingId(null);
      }
    },
    [sourceEnvironmentUrl]
  );

  return {
    environments,
    isLoadingEnvironments,
    selectedEnvironment,
    setSelectedEnvironment,
    solutions,
    isLoadingSolutions,
    showAgentsOnly,
    setShowAgentsOnly,
    importingId,
    loadEnvironments,
    loadSolutions,
    importSolution,
  };
}
