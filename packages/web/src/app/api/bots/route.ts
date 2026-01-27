import { NextRequest, NextResponse } from "next/server";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  AgentResolver,
} from "@agentsync/core";

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
