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

import { Intent, ChatAction } from "@/types/chat";

/**
 * Parse user message and LLM response to extract intent and actions
 */
export function parseIntent(
  userMessage: string,
  llmResponse: string
): {
  intent: Intent;
  actions: ChatAction[];
} {
  const msg = userMessage.toLowerCase();
  const response = llmResponse.toLowerCase();

  // Check for deploy action blocks in the response
  const deployActionMatch = llmResponse.match(/```action\s*\n([\s\S]*?)\n```/);
  if (deployActionMatch) {
    try {
      const actionData = JSON.parse(deployActionMatch[1]);
      if (actionData.action === "deploy") {
        return {
          intent: {
            type: "create_deployment",
            agentName: actionData.agentName,
            tenantIds: actionData.tenants,
            tenantNames: [], // Will be resolved by the handler
          },
          actions: [
            {
              type: "deploy",
              label: `Deploy ${actionData.agentName}`,
              agentName: actionData.agentName,
              tenantIds: actionData.tenants,
              requiresConfirmation: true,
            },
          ],
        };
      }
    } catch (error) {
      console.error("Failed to parse action block:", error);
    }
  }

  // Check for retry intent
  if (msg.includes("retry")) {
    const deploymentId = extractDeploymentId(userMessage);
    if (deploymentId) {
      return {
        intent: {
          type: "retry_deployment",
          deploymentId,
        },
        actions: [
          {
            type: "retry",
            label: "Retry Deployment",
            deploymentId,
            requiresConfirmation: true,
          },
        ],
      };
    }
  }

  // Check for cancel intent
  if (msg.includes("cancel")) {
    const deploymentId = extractDeploymentId(userMessage);
    if (deploymentId) {
      return {
        intent: {
          type: "cancel_deployment",
          deploymentId,
        },
        actions: [
          {
            type: "cancel",
            label: "Cancel Deployment",
            deploymentId,
            requiresConfirmation: true,
          },
        ],
      };
    }
  }

  // Check for navigation intent
  if (msg.includes("show") || msg.includes("go to") || msg.includes("open")) {
    if (msg.includes("settings")) {
      return {
        intent: { type: "navigate", page: "settings", path: "/settings" },
        actions: [
          {
            type: "navigate",
            label: "Go to Settings",
            path: "/settings",
            requiresConfirmation: false,
          },
        ],
      };
    }

    if (msg.includes("deployment") && !msg.includes("failed")) {
      return {
        intent: { type: "navigate", page: "deployments", path: "/deployments" },
        actions: [
          {
            type: "navigate",
            label: "View Deployments",
            path: "/deployments",
            requiresConfirmation: false,
          },
        ],
      };
    }

    if (msg.includes("tenant")) {
      return {
        intent: { type: "navigate", page: "tenants", path: "/tenants" },
        actions: [
          {
            type: "navigate",
            label: "View Tenants",
            path: "/tenants",
            requiresConfirmation: false,
          },
        ],
      };
    }
  }

  // Extract actions from response (for queries that suggest retries)
  const actions: ChatAction[] = [];
  const deploymentIds = extractAllDeploymentIds(llmResponse);

  // If response mentions failed deployments and suggests retry
  if ((msg.includes("failed") || msg.includes("error")) && deploymentIds.length > 0) {
    // Add retry actions for the first 3 deployments
    deploymentIds.slice(0, 3).forEach((id) => {
      actions.push({
        type: "retry",
        label: `Retry #${id}`,
        deploymentId: id,
        requiresConfirmation: true,
      });
    });

    return {
      intent: { type: "query", query: userMessage },
      actions,
    };
  }

  // Check if response mentions running deployments with cancel suggestion
  if (
    (msg.includes("running") || msg.includes("active") || msg.includes("in progress")) &&
    deploymentIds.length > 0
  ) {
    // Add cancel actions
    deploymentIds.slice(0, 3).forEach((id) => {
      actions.push({
        type: "cancel",
        label: `Cancel #${id}`,
        deploymentId: id,
        requiresConfirmation: true,
      });
    });

    return {
      intent: { type: "query", query: userMessage },
      actions,
    };
  }

  // Default to query intent
  return {
    intent: { type: "query", query: userMessage },
    actions,
  };
}

/**
 * Extract deployment ID from user message
 */
function extractDeploymentId(message: string): string | null {
  // Look for #abc123 format
  const hashMatch = message.match(/#([a-z0-9]+)/i);
  if (hashMatch) {
    return hashMatch[1];
  }

  // Look for common patterns like "deployment abc123"
  const idMatch = message.match(/deployment\s+([a-z0-9-]+)/i);
  if (idMatch) {
    return idMatch[1];
  }

  // Look for standalone alphanumeric IDs (at least 6 chars)
  const standaloneMatch = message.match(/\b([a-z0-9]{6,})\b/i);
  if (standaloneMatch) {
    return standaloneMatch[1];
  }

  return null;
}

/**
 * Extract all deployment IDs from text (for responses listing multiple deployments)
 */
function extractAllDeploymentIds(text: string): string[] {
  const ids: string[] = [];

  // Extract all #abc123 format IDs
  const matches = text.matchAll(/#([a-z0-9]+)/gi);
  for (const match of matches) {
    ids.push(match[1]);
  }

  return ids;
}

/**
 * Check if a message requires confirmation
 */
export function requiresConfirmation(intent: Intent): boolean {
  return intent.type === "retry_deployment" || intent.type === "cancel_deployment";
}
