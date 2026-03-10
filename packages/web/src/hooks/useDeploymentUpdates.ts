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

"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface DeploymentUpdate {
  type: "connected" | "heartbeat" | "progress" | "tenant_completed" | "deployment_completed";
  deploymentId?: string;
  timestamp?: string;
  data?: {
    tenantId?: string;
    tenantName?: string;
    status?: string;
    progress?: number;
    error?: string;
  };
}

interface UseDeploymentUpdatesOptions {
  deploymentId: string;
  onUpdate?: (update: DeploymentUpdate) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export function useDeploymentUpdates({
  deploymentId,
  onUpdate,
  onError,
  enabled = true,
}: UseDeploymentUpdatesOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<DeploymentUpdate | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!enabled || !deploymentId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/ws?deploymentId=${encodeURIComponent(deploymentId)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const update: DeploymentUpdate = JSON.parse(event.data);
        setLastUpdate(update);
        onUpdate?.(update);
      } catch (error) {
        console.error("Failed to parse SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      setIsConnected(false);
      eventSource.close();

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        onError?.(new Error("Max reconnection attempts reached"));
      }
    };
  }, [deploymentId, enabled, onUpdate, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    lastUpdate,
    reconnect: connect,
    disconnect,
  };
}
