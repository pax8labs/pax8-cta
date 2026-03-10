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

import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { resolve } from "path";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  isDemoMode,
  DEMO_SOLUTIONS,
  DEMO_CONFIG,
} from "@agentsync/core";
import { internalError } from "@/lib/errors";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";

/**
 * List solutions from the source environment
 */
export async function GET() {
  try {
    // Use demo data if DEMO_MODE is enabled
    if (isDemoMode()) {
      return NextResponse.json({
        demoMode: true,
        sourceEnvironment: DEMO_CONFIG.source.environmentUrl,
        solutions: DEMO_SOLUTIONS.map((s, i) => ({
          id: `demo-solution-${i}`,
          uniqueName: s.uniqueName,
          friendlyName: s.friendlyName,
          version: s.version,
          isManaged: s.isManaged,
          publisherName: s.publisherName,
          description: s.description,
        })),
      });
    }

    // Load config
    const config = await loadConfig(resolve(CONFIG_PATH));

    // Check if client secret is available
    let clientSecret: string;
    try {
      clientSecret = getClientSecret();
    } catch {
      return internalError(
        "Client secret not configured. Set PARTNER_CLIENT_SECRET environment variable."
      );
    }

    // Create token manager for source environment
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

    // Get solutions
    const solutions = await solutionOps.listSolutions();

    // Filter to show only relevant solutions (exclude system solutions)
    const filteredSolutions = solutions.filter(
      (s) =>
        !s.uniquename.startsWith("msdyn") &&
        !s.uniquename.startsWith("Microsoft") &&
        s.uniquename !== "Active" &&
        s.uniquename !== "Basic" &&
        s.uniquename !== "Default"
    );

    return NextResponse.json({
      demoMode: false,
      sourceEnvironment: config.source.environmentUrl,
      solutions: filteredSolutions.map((s) => ({
        id: s.solutionid,
        uniqueName: s.uniquename,
        friendlyName: s.friendlyname,
        version: s.version,
        isManaged: s.ismanaged,
      })),
    });
  } catch (error) {
    console.error("List solutions error:", error);
    return internalError(
      "Failed to list solutions",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
