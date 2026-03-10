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
export const dynamic = "force-dynamic";
import { isDemoMode, DEMO_TENANTS } from "@agentsync/core";
import { demoDeployedAgents, initializeDemoAgents } from "@/lib/demo-store";
import { notFound, internalError } from "@/lib/errors";

/**
 * DELETE /api/tenants/[id]/agents/[solutionName]
 * Remove a deployed agent from a tenant
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; solutionName: string }> }
) {
  try {
    const { id: tenantId, solutionName } = await params;
    const decodedSolutionName = decodeURIComponent(solutionName);

    if (isDemoMode()) {
      // Check if tenant exists
      const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
      if (!tenant) {
        return notFound("Tenant", tenantId);
      }

      // Initialize demo agents if needed
      initializeDemoAgents();

      // Get current agents for this tenant
      const agents = demoDeployedAgents.get(tenantId) || [];

      // Find the agent to remove
      const agentIndex = agents.findIndex((a) => a.solutionName === decodedSolutionName);

      if (agentIndex === -1) {
        return notFound(`Agent "${decodedSolutionName}" on tenant`);
      }

      // Remove the agent
      agents.splice(agentIndex, 1);
      demoDeployedAgents.set(tenantId, agents);

      return NextResponse.json({
        demoMode: true,
        tenantId,
        solutionName: decodedSolutionName,
        message: `Agent "${decodedSolutionName}" removal initiated`,
      });
    }

    // In real mode, would:
    // 1. Connect to the tenant's Dataverse environment
    // 2. Get the solution by name
    // 3. Delete/uninstall the solution
    return NextResponse.json(
      { error: "Agent removal in non-demo mode requires Dataverse connection" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Agent removal error:", error);
    return internalError(
      "Failed to remove agent",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
