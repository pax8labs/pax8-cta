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
import { demoTenantStatus } from "@/lib/demo-store";
import { invalidRequest, notFound, internalError } from "@/lib/errors";

/**
 * PUT /api/tenants/[id]/status
 * Update enabled/disabled status for a specific tenant
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tenantId } = await params;
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return invalidRequest("Enabled must be a boolean");
    }

    if (isDemoMode()) {
      // Check if tenant exists
      const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
      if (!tenant) {
        return notFound("Tenant", tenantId);
      }

      // Store the override
      demoTenantStatus.set(tenantId, enabled);

      // Also update the in-memory demo tenant (for this session)
      tenant.enabled = enabled;

      return NextResponse.json({
        demoMode: true,
        tenantId,
        enabled,
        message: `Tenant ${enabled ? "enabled" : "disabled"} successfully`,
      });
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: "Status updates in non-demo mode require config file modification" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Tenant status update error:", error);
    return internalError(
      "Failed to update tenant status",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
