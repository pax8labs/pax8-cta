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
import { isDemoMode, DEMO_SOLUTIONS } from "@agentsync/core";
import {
  demoCustomAgents,
  demoAgentStatus,
  demoDeployedAgents,
  AgentStatus,
} from "@/lib/demo-store";
import { invalidRequest, notFound, internalError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Update an agent's status (active, deprecated, archived)
 *
 * - active: Can be deployed to new tenants
 * - deprecated: Cannot be deployed to new tenants, stays on existing tenants
 * - archived: Cannot be deployed, will be uninstalled from all tenants
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body as { status: AgentStatus };

    if (!id) {
      return invalidRequest("Agent ID is required");
    }

    if (!status || !["active", "deprecated", "archived"].includes(status)) {
      return invalidRequest("Invalid status. Must be: active, deprecated, or archived");
    }

    if (isDemoMode()) {
      // Check if agent exists (either built-in or custom)
      const builtIn = DEMO_SOLUTIONS.find((s: { uniqueName: string }) => s.uniqueName === id);
      const customAgent = demoCustomAgents.get(id);

      if (!builtIn && !customAgent) {
        return notFound("Agent", id);
      }

      const agentName = builtIn?.friendlyName || customAgent?.friendlyName;

      // If archiving, we need to uninstall from all tenants
      const uninstalledTenants: string[] = [];
      if (status === "archived") {
        // Find and remove from all tenants
        demoDeployedAgents.forEach((agents, tenantId) => {
          const beforeCount = agents.length;
          const filtered = agents.filter((a) => a.solutionName !== agentName);
          if (filtered.length < beforeCount) {
            uninstalledTenants.push(tenantId);
            demoDeployedAgents.set(tenantId, filtered);
          }
        });
      }

      // Update status
      if (customAgent) {
        // For custom agents, update the agent object directly
        demoCustomAgents.set(id, { ...customAgent, status });
      } else {
        // For built-in agents, use the status store
        if (status === "active") {
          // Remove from store (defaults to active)
          demoAgentStatus.delete(id);
        } else {
          demoAgentStatus.set(id, status);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Agent "${agentName}" status changed to ${status}`,
        status,
        uninstalledTenants: uninstalledTenants.length > 0 ? uninstalledTenants : undefined,
      });
    }

    // Real mode - would update in Dataverse
    return NextResponse.json(
      { error: "Real agent status update not yet implemented" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Update agent status error:", error);
    return internalError(
      "Failed to update agent status",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * Get current agent status
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return invalidRequest("Agent ID is required");
    }

    if (isDemoMode()) {
      const builtIn = DEMO_SOLUTIONS.find((s: { uniqueName: string }) => s.uniqueName === id);
      const customAgent = demoCustomAgents.get(id);

      if (!builtIn && !customAgent) {
        return notFound("Agent", id);
      }

      let status: AgentStatus = "active";
      if (customAgent) {
        status = customAgent.status || "active";
      } else if (builtIn) {
        status = demoAgentStatus.get(id) || "active";
      }

      return NextResponse.json({
        id,
        status,
      });
    }

    return NextResponse.json({ error: "Real agent status not yet implemented" }, { status: 501 });
  } catch (error) {
    console.error("Get agent status error:", error);
    return internalError(
      "Failed to get agent status",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
