import { NextRequest, NextResponse } from "next/server";
import { demoCustomAgents, CustomAgent } from "@/lib/demo-store";

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
      return NextResponse.json(
        { error: "Missing required fields: action, originalUniqueName" },
        { status: 400 }
      );
    }

    if (action === "update") {
      // Update existing agent with new solution data
      const existing = demoCustomAgents.get(originalUniqueName);
      if (!existing) {
        return NextResponse.json(
          { error: "Original agent not found" },
          { status: 404 }
        );
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
        status: existing.status === 'archived' ? 'active' : existing.status,
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
        return NextResponse.json(
          { error: "newUniqueName is required for create action" },
          { status: 400 }
        );
      }

      // Check if the new name also conflicts
      if (demoCustomAgents.has(newUniqueName)) {
        return NextResponse.json(
          { error: `Agent with uniqueName "${newUniqueName}" already exists` },
          { status: 409 }
        );
      }

      const newAgent: CustomAgent = {
        id: newUniqueName,
        uniqueName: newUniqueName,
        friendlyName: newFriendlyName || metadata?.friendlyName || newUniqueName,
        version: metadata?.version || "1.0.0.0",
        description: metadata?.description,
        publisherName: metadata?.publisherName,
        isManaged: metadata?.isManaged ?? true,
        status: 'active',
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

    return NextResponse.json(
      { error: `Invalid action: ${action}. Must be "update" or "create"` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error resolving upload conflict:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to resolve conflict",
      },
      { status: 500 }
    );
  }
}
