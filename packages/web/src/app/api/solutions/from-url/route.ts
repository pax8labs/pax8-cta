import { NextRequest, NextResponse } from "next/server";
import {
  loadConfig,
  getClientSecret,
  TokenManager,
  DataverseClient,
  SolutionOperations,
  AgentResolver,
} from "@agentsync/core";
import { demoCustomAgents, CustomAgent } from "@/lib/demo-store";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";
const DEMO_MODE = process.env.DEMO_MODE === "true" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * Parse titleId from M365 URL to extract possible bot info
 */
function parseTitleId(url: string) {
  const parsed = new URL(url);
  const titleId = parsed.searchParams.get("titleId");

  if (!titleId) {
    throw new Error("No titleId parameter found in URL");
  }

  const parts = titleId.split("_");
  let prefix: string | null = null;
  let possibleBotId: string | null = null;

  if (parts.length >= 2) {
    prefix = parts[0];
    possibleBotId = parts.slice(1).join("_");
    const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidPattern.test(possibleBotId)) {
      possibleBotId = null;
    }
  }

  return { titleId, prefix, possibleBotId };
}

/**
 * Generate demo data from a URL
 */
function generateDemoResult(url: string) {
  const parsed = parseTitleId(url);
  const botId = parsed.possibleBotId || crypto.randomUUID();
  const shortId = botId.slice(0, 8);
  const uniqueName = `ImportedAgent_${shortId}`;
  const friendlyName = `Imported Agent ${shortId}`;

  return {
    parsed,
    bot: {
      id: botId,
      name: friendlyName,
      status: "Active",
      modifiedOn: new Date().toISOString(),
    },
    solution: {
      id: crypto.randomUUID(),
      uniqueName,
      friendlyName,
      version: "1.0.0.0",
      isManaged: true,
    },
    exported: false,
    exportPath: null as string | null,
    demoMode: true,
  };
}

/**
 * POST /api/solutions/from-url
 *
 * Resolve an M365 agent URL and export the containing solution
 *
 * Body:
 *   - url: string - The M365 agent URL (e.g., https://m365.cloud.microsoft/chat/?titleId=...)
 *   - managed?: boolean - Whether to export as managed (default: true)
 *   - dryRun?: boolean - Only resolve, don't export (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, managed = true, dryRun = false } = body;

    if (!url) {
      return NextResponse.json(
        { error: "Missing required 'url' parameter" },
        { status: 400 }
      );
    }

    // Check if we're in demo mode or missing config
    let isDemoMode = DEMO_MODE;
    let config;

    try {
      config = await loadConfig(CONFIG_PATH);
      getClientSecret(); // Will throw if not set
    } catch {
      isDemoMode = true;
    }

    // In demo mode, return simulated data
    if (isDemoMode) {
      const result = generateDemoResult(url);
      if (!dryRun) {
        result.exported = true;
        result.exportPath = `./crates/${result.solution.uniqueName}_demo.zip`;

        // Add agent to demo store so it shows up in /agents
        const newAgent: CustomAgent = {
          id: result.solution.uniqueName,
          uniqueName: result.solution.uniqueName,
          friendlyName: result.solution.friendlyName,
          version: result.solution.version,
          description: `Imported from M365 URL`,
          publisherName: "Imported",
          isManaged: result.solution.isManaged,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        demoCustomAgents.set(result.solution.uniqueName, newAgent);
      }
      return NextResponse.json(result);
    }

    // Real mode - connect to Dataverse
    const clientSecret = getClientSecret();

    const tokenManager = new TokenManager({
      tenantId: config!.partner.tenantId,
      clientId: config!.partner.clientId,
      clientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl: config!.source.environmentUrl,
      tokenManager,
    });

    const resolver = new AgentResolver(dataverseClient);

    // Parse the URL
    const parsed = resolver.parseAgentUrl(url);

    // Resolve to solution
    const resolved = await resolver.resolveUrlToSolution(url);

    const result = {
      parsed: {
        titleId: parsed.titleId,
        prefix: parsed.prefix,
        possibleBotId: parsed.possibleBotId,
      },
      bot: {
        id: resolved.bot.botid,
        name: resolved.bot.name,
        status: resolved.bot.statecode === 0 ? "Active" : "Inactive",
        modifiedOn: resolved.bot.modifiedon,
      },
      solution: {
        id: resolved.solution.solutionid,
        uniqueName: resolved.solution.uniquename,
        friendlyName: resolved.solution.friendlyname,
        version: resolved.solution.version,
        isManaged: resolved.solution.ismanaged,
      },
      exported: false as boolean,
      exportPath: null as string | null,
      demoMode: false,
    };

    if (!dryRun) {
      // Export the solution
      const solutionOps = new SolutionOperations(dataverseClient);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const suffix = managed ? "managed" : "unmanaged";
      const outputPath = `./crates/${resolved.solution.uniquename}_${timestamp}_${suffix}.zip`;

      await solutionOps.exportSolution(resolved.solution.uniquename, {
        managed,
        outputPath,
      });

      result.exported = true;
      result.exportPath = outputPath;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error resolving URL:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/solutions/from-url?url=...
 *
 * Parse an M365 agent URL without resolving (quick validation)
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Missing required 'url' parameter" },
        { status: 400 }
      );
    }

    // Just parse the URL - no config needed for basic parsing
    const parsed = parseTitleId(url);

    return NextResponse.json({
      parsed: {
        titleId: parsed.titleId,
        prefix: parsed.prefix,
        possibleBotId: parsed.possibleBotId,
        originalUrl: url,
      },
      valid: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid URL",
        valid: false,
      },
      { status: 400 }
    );
  }
}
