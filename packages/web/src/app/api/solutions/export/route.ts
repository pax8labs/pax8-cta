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
import { resolve, join } from "path";
import { mkdir } from "fs/promises";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  isDemoMode,
  DEMO_SOLUTIONS,
} from "@agentsync/core";
import { invalidRequest, notFound, internalError } from "@/lib/errors";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const SOLUTIONS_DIR = process.env.SOLUTIONS_DIR || "./solutions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { solutionName, managed = true } = body;

    if (!solutionName) {
      return invalidRequest("Solution name is required");
    }

    // In demo mode, return a mock export result
    if (isDemoMode()) {
      const demoSolution = DEMO_SOLUTIONS.find((s) => s.uniqueName === solutionName);
      if (!demoSolution) {
        return notFound("Solution", solutionName);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const mockPath = `./solutions/${solutionName}_${timestamp}_${suffix}.zip`;

      return NextResponse.json({
        success: true,
        demoMode: true,
        outputPath: mockPath,
        message: "Demo mode: Solution would be exported to " + mockPath,
        solution: {
          uniqueName: demoSolution.uniqueName,
          friendlyName: demoSolution.friendlyName,
          version: demoSolution.version,
          isManaged: managed,
        },
      });
    }

    // Load config
    const config = await loadConfig(resolve(CONFIG_PATH));

    // Get client secret
    let clientSecret: string;
    try {
      clientSecret = getClientSecret();
    } catch {
      return internalError("Client secret not configured");
    }

    // Create token manager
    const tokenManager = new TokenManager({
      tenantId: config.source.tenantId,
      clientId: config.partner.clientId,
      clientSecret,
    });

    // Create Dataverse client
    const dataverseClient = new DataverseClient({
      environmentUrl: config.source.environmentUrl,
      tokenManager,
    });

    const solutionOps = new SolutionOperations(dataverseClient);

    // Ensure solutions directory exists
    const solutionsDir = resolve(SOLUTIONS_DIR);
    await mkdir(solutionsDir, { recursive: true });

    // Build output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const suffix = managed ? "managed" : "unmanaged";
    const outputPath = join(solutionsDir, `${solutionName}_${timestamp}_${suffix}.zip`);

    // Export solution
    const metadata = await solutionOps.exportSolution(solutionName, {
      managed,
      outputPath,
    });

    return NextResponse.json({
      success: true,
      outputPath,
      solution: {
        uniqueName: metadata.uniqueName,
        friendlyName: metadata.friendlyName,
        version: metadata.version,
        isManaged: metadata.isManaged,
      },
    });
  } catch (error) {
    console.error("Export solution error:", error);
    return internalError(
      "Export failed",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
