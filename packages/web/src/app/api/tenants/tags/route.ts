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
import { loadConfig, isDemoMode, DEMO_CONFIG } from "@agentsync/core";
import { resolve } from "path";
import { demoTags } from "@/lib/demo-store";
import { invalidRequest, internalError } from "@/lib/errors";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";

/**
 * GET /api/tenants/tags
 * Returns all unique tags across all tenants plus any custom-created tags
 */
export async function GET() {
  try {
    const config = isDemoMode() ? DEMO_CONFIG : await loadConfig(resolve(CONFIG_PATH));

    // Collect all unique tags from tenants
    const tagsSet = new Set<string>();

    for (const tenant of config.tenants) {
      if (tenant.tags) {
        for (const tag of tenant.tags) {
          tagsSet.add(tag);
        }
      }
    }

    // Add any custom tags created in demo mode
    if (isDemoMode()) {
      for (const tag of demoTags) {
        tagsSet.add(tag);
      }
    }

    // Sort alphabetically
    const tags = Array.from(tagsSet).sort();

    return NextResponse.json({
      demoMode: isDemoMode(),
      tags,
    });
  } catch (error) {
    console.error("Tags list error:", error);
    return internalError(
      "Failed to load tags",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * POST /api/tenants/tags
 * Create a new tag (demo mode only - real mode would modify config file)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tag } = body;

    if (!tag || typeof tag !== "string") {
      return invalidRequest("Tag name is required");
    }

    const normalizedTag = tag.trim().toLowerCase();

    if (normalizedTag.length === 0) {
      return invalidRequest("Tag name cannot be empty");
    }

    if (normalizedTag.length > 50) {
      return invalidRequest("Tag name must be 50 characters or less");
    }

    // Check if tag contains invalid characters
    if (!/^[a-z0-9-_]+$/.test(normalizedTag)) {
      return invalidRequest(
        "Tag can only contain lowercase letters, numbers, hyphens, and underscores"
      );
    }

    if (isDemoMode()) {
      demoTags.add(normalizedTag);
      return NextResponse.json({
        demoMode: true,
        tag: normalizedTag,
        message: "Tag created successfully",
      });
    }

    // In real mode, would modify config file
    return NextResponse.json(
      { error: "Tag creation in non-demo mode requires config file modification" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Tag creation error:", error);
    return internalError(
      "Failed to create tag",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * DELETE /api/tenants/tags
 * Delete a tag (demo mode only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");

    if (!tag) {
      return invalidRequest("Tag name is required");
    }

    if (isDemoMode()) {
      demoTags.delete(tag);
      return NextResponse.json({
        demoMode: true,
        tag,
        message: "Tag deleted successfully",
      });
    }

    return NextResponse.json(
      { error: "Tag deletion in non-demo mode requires config file modification" },
      { status: 501 }
    );
  } catch (error) {
    console.error("Tag deletion error:", error);
    return internalError(
      "Failed to delete tag",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
