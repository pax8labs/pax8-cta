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
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  AgentResolver,
} from "@agentsync/core";
import { internalError } from "@/lib/errors";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";

/**
 * GET /api/bots
 *
 * List all Copilot Studio bots in the source environment with their containing solutions
 */
export async function GET(request: NextRequest) {
  try {
    const config = await loadConfig(CONFIG_PATH);
    const clientSecret = getClientSecret();

    const tokenManager = new TokenManager({
      tenantId: config.partner.tenantId,
      clientId: config.partner.clientId,
      clientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl: config.source.environmentUrl,
      tokenManager,
    });

    const resolver = new AgentResolver(dataverseClient);
    const botsWithSolutions = await resolver.listBotsWithSolutions();

    const bots = botsWithSolutions.map(({ bot, solution }) => ({
      id: bot.botid,
      name: bot.name,
      schemaName: bot.schemaname,
      status: bot.statecode === 0 ? "Active" : "Inactive",
      createdOn: bot.createdon,
      modifiedOn: bot.modifiedon,
      solution: solution
        ? {
            id: solution.solutionid,
            uniqueName: solution.uniquename,
            friendlyName: solution.friendlyname,
            version: solution.version,
            isManaged: solution.ismanaged,
          }
        : null,
    }));

    return NextResponse.json({ bots, count: bots.length });
  } catch (error) {
    console.error("Error listing bots:", error);
    return internalError(
      "Failed to list bots",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
