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
import { demoTenantTags } from "@/lib/demo-store";
import { invalidRequest, notFound, internalError } from "@/lib/errors";

/**
 * PUT /api/tenants/[id]/tags
 * Update tags for a specific tenant
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tenantId } = await params;
    const body = await request.json();
    const { tags } = body;

    if (!Array.isArray(tags)) {
      return invalidRequest("Tags must be an array");
    }

    // Validate each tag
    for (const tag of tags) {
      if (typeof tag !== "string") {
        return invalidRequest("Each tag must be a string");
      }
    }

    // Normalize tags
    const normalizedTags = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);

    if (isDemoMode()) {
      // Check if tenant exists
      const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);
      if (!tenant) {
        return notFound("Tenant", tenantId);
      }

      // Store the override
      demoTenantTags.set(tenantId, normalizedTags);

      // Also update the in-memory demo tenant (for this session)
      tenant.tags = normalizedTags;

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tags: normalizedTags,
        message: "Tags updated successfully",
      });
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: "Tag updates in non-demo mode require config file modification" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Tenant tags update error:", error);
    return internalError(
      "Failed to update tenant tags",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
