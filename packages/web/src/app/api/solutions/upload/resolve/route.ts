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

import { NextRequest, NextResponse } from "next/server";
import { demoCustomAgents, CustomAgent } from "@/lib/demo-store";
import { invalidRequest, notFound, conflict, internalError } from "@/lib/errors";

const DEMO_MODE = process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * POST /api/solutions/upload/resolve
 *
 * Resolve a conflict when uploading a solution with an existing uniqueName
 * Actions:
 *   - "update": Update the existing agent with the new solution
 *   - "create": Create a new agent with a different uniqueName
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      action,
      originalUniqueName,
      newUniqueName,
      newFriendlyName,
      metadata,
      urlTemplates,
      solutionBase64,
    } = body;

    if (!action || !originalUniqueName) {
      return invalidRequest("Missing required fields: action, originalUniqueName");
    }

    if (action === "update") {
      // Update existing agent with new solution data
      const existing = demoCustomAgents.get(originalUniqueName);
      if (!existing) {
        return notFound("Agent", originalUniqueName);
      }

      const updatedAgent: CustomAgent = {
        ...existing,
        // Update with new solution data
        friendlyName: metadata?.friendlyName || existing.friendlyName,
        version: metadata?.version || existing.version,
        description: metadata?.description || existing.description,
        publisherName: metadata?.publisherName || existing.publisherName,
        isManaged: metadata?.isManaged ?? existing.isManaged,
        // Reactivate if it was archived
        status: existing.status === "archived" ? "active" : existing.status,
        // Update solution data
        urlTemplates: urlTemplates || existing.urlTemplates,
        solutionBase64: solutionBase64 || existing.solutionBase64,
        dependencies: metadata?.knowledgeSources || existing.dependencies,
        connectionReferences: metadata?.connectionReferences || existing.connectionReferences,
      };

      demoCustomAgents.set(originalUniqueName, updatedAgent);

      return NextResponse.json({
        success: true,
        action: "updated",
        agent: updatedAgent,
        demoMode: DEMO_MODE,
      });
    }

    if (action === "create") {
      // Create a new agent with a different uniqueName
      if (!newUniqueName) {
        return invalidRequest("newUniqueName is required for create action");
      }

      // Check if the new name also conflicts
      if (demoCustomAgents.has(newUniqueName)) {
        return conflict(`Agent with uniqueName "${newUniqueName}" already exists`);
      }

      const newAgent: CustomAgent = {
        id: newUniqueName,
        uniqueName: newUniqueName,
        friendlyName: newFriendlyName || metadata?.friendlyName || newUniqueName,
        version: metadata?.version || "1.0.0.0",
        description: metadata?.description,
        publisherName: metadata?.publisherName,
        isManaged: metadata?.isManaged ?? true,
        status: "active",
        createdAt: new Date().toISOString(),
        urlTemplates: urlTemplates || undefined,
        solutionBase64,
        dependencies: metadata?.knowledgeSources,
        connectionReferences: metadata?.connectionReferences,
      };

      demoCustomAgents.set(newUniqueName, newAgent);

      return NextResponse.json({
        success: true,
        action: "created",
        agent: newAgent,
        demoMode: DEMO_MODE,
      });
    }

    return invalidRequest(`Invalid action: ${action}. Must be "update" or "create"`);
  } catch (error) {
    console.error("Error resolving upload conflict:", error);
    return internalError(
      "Failed to resolve conflict",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
