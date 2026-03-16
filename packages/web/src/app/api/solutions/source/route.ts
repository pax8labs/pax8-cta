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
  isDemoMode,
  DataverseClient,
  TokenManager,
  getEffectiveIntegrationSettings,
} from "@agentsync/core";
import { internalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Demo solutions that would be available in a source environment
const DEMO_SOURCE_SOLUTIONS: Record<string, DemoSolution[]> = {
  "https://contoso-prod.crm.dynamics.com": [
    {
      solutionId: "src-sol-1",
      uniqueName: "CopilotStudioHRBot",
      displayName: "HR Assistant Copilot",
      version: "1.2.0.5",
      publisher: "Contoso Solutions",
      description:
        "An AI-powered HR assistant for employee questions about policies, benefits, and procedures.",
      isManaged: false,
      createdOn: "2024-09-15T10:00:00Z",
      modifiedOn: "2024-12-01T14:30:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-hr-001",
        botName: "HR Helper",
        botType: "copilot",
        topicsCount: 24,
        knowledgeSources: ["SharePoint HR Policies", "Benefits FAQ Document"],
      },
    },
    {
      solutionId: "src-sol-2",
      uniqueName: "CopilotStudioITHelp",
      displayName: "IT Helpdesk Copilot",
      version: "2.0.1.0",
      publisher: "Contoso Solutions",
      description: "IT support and troubleshooting assistant for common technical issues.",
      isManaged: false,
      createdOn: "2024-08-20T08:00:00Z",
      modifiedOn: "2024-11-28T09:15:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-it-001",
        botName: "IT Support Bot",
        botType: "copilot",
        topicsCount: 36,
        knowledgeSources: ["IT Knowledge Base", "Troubleshooting Guides"],
      },
    },
    {
      solutionId: "src-sol-3",
      uniqueName: "CustomerServiceAgent",
      displayName: "Customer Service Agent",
      version: "1.0.0.0",
      publisher: "Contoso Solutions",
      description: "Customer-facing support agent for common inquiries and ticket creation.",
      isManaged: false,
      createdOn: "2024-10-10T12:00:00Z",
      modifiedOn: "2024-11-15T16:45:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-cs-001",
        botName: "Customer Support",
        botType: "copilot",
        topicsCount: 18,
        knowledgeSources: ["Product Documentation", "FAQ Database"],
      },
    },
    {
      solutionId: "src-sol-4",
      uniqueName: "SalesEnablement",
      displayName: "Sales Enablement Agent",
      version: "1.5.0.0",
      publisher: "Contoso Solutions",
      description: "Helps sales team with product info, pricing, and proposals.",
      isManaged: false,
      createdOn: "2024-07-05T09:00:00Z",
      modifiedOn: "2024-12-10T11:20:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-sales-001",
        botName: "Sales Assistant",
        botType: "copilot",
        topicsCount: 15,
        knowledgeSources: ["Product Catalog", "Pricing Guide"],
      },
    },
    {
      solutionId: "src-sol-5",
      uniqueName: "CoreDataExtensions",
      displayName: "Core Data Extensions",
      version: "1.0.0.0",
      publisher: "Contoso Solutions",
      description: "Custom entities and fields for business data.",
      isManaged: false,
      createdOn: "2024-05-01T08:00:00Z",
      modifiedOn: "2024-10-20T10:00:00Z",
      hasBot: false,
    },
  ],
  "https://contoso-dev.crm.dynamics.com": [
    {
      solutionId: "dev-sol-1",
      uniqueName: "DevTestBot",
      displayName: "Development Test Bot",
      version: "0.1.0.0",
      publisher: "Contoso Solutions",
      description: "Bot used for development testing.",
      isManaged: false,
      createdOn: "2024-11-01T10:00:00Z",
      modifiedOn: "2024-12-15T14:00:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-dev-001",
        botName: "Test Bot",
        botType: "copilot",
        topicsCount: 5,
        knowledgeSources: [],
      },
    },
  ],
  "https://agenttesting.crm.dynamics.com": [
    {
      solutionId: "test-sol-1",
      uniqueName: "QATestAgent",
      displayName: "QA Test Agent",
      version: "1.0.0.0",
      publisher: "Contoso Solutions",
      description: "Agent for QA testing scenarios.",
      isManaged: false,
      createdOn: "2024-10-01T10:00:00Z",
      modifiedOn: "2024-12-01T11:00:00Z",
      hasBot: true,
      botInfo: {
        botId: "bot-qa-001",
        botName: "QA Bot",
        botType: "copilot",
        topicsCount: 12,
        knowledgeSources: ["Test Documentation"],
      },
    },
  ],
};

interface DemoSolution {
  solutionId: string;
  uniqueName: string;
  displayName: string;
  version: string;
  publisher: string;
  description: string;
  isManaged: boolean;
  createdOn: string;
  modifiedOn: string;
  hasBot: boolean;
  botInfo?: {
    botId: string;
    botName: string;
    botType: string;
    topicsCount: number;
    knowledgeSources: string[];
  };
}

// Default demo environment URL
const DEFAULT_DEMO_ENV = "https://contoso-prod.crm.dynamics.com";

/**
 * Get solutions available in a specific environment
 * Query params:
 *   - environmentUrl: The Dataverse environment URL to query (optional, uses configured source if not provided)
 *   - botsOnly: If 'true', only return solutions that contain Copilot agents
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedEnvUrl = searchParams.get("environmentUrl");
    const botsOnly = searchParams.get("botsOnly") === "true";

    if (isDemoMode()) {
      const envUrl = requestedEnvUrl || DEFAULT_DEMO_ENV;
      let solutions = DEMO_SOURCE_SOLUTIONS[envUrl] || [];

      if (botsOnly) {
        solutions = solutions.filter((s) => s.hasBot);
      }

      return NextResponse.json({
        demoMode: true,
        sourceEnvironment: envUrl,
        solutions,
      });
    }

    const settings = await getEffectiveIntegrationSettings();

    // Determine which environment to query
    const environmentUrl = requestedEnvUrl || settings.sourceEnvironmentUrl;

    // Check if environment is specified
    if (!environmentUrl) {
      return NextResponse.json({
        demoMode: false,
        configured: false,
        message:
          "No environment specified. Select an environment or configure a default source environment in Settings.",
        solutions: [],
      });
    }

    if (!settings.partnerClientId || !settings.partnerClientSecret) {
      return internalError("Partner credentials not configured");
    }

    // Determine tenant ID for the environment
    // For now, use source tenant if configured, otherwise partner tenant
    // In a full implementation, we might detect this from the environment URL
    const sourceTenantId = settings.sourceTenantId || settings.partnerTenantId;
    if (!sourceTenantId) {
      return internalError("Unable to determine tenant ID for environment");
    }

    const tokenManager = new TokenManager({
      tenantId: sourceTenantId,
      clientId: settings.partnerClientId,
      clientSecret: settings.partnerClientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl,
      tokenManager,
    });

    // Query solutions from the environment
    const solutions = await dataverseClient.querySolutions();

    // Filter to unmanaged solutions (these are the ones we can export)
    const exportableSolutions = solutions
      .filter((s) => !s.ismanaged) // Unmanaged solutions only
      .filter((s) => !s.uniquename.startsWith("msdyn_")) // Exclude system solutions
      .filter((s) => !s.uniquename.startsWith("msft_")); // Exclude Microsoft solutions

    // Check each solution for bot components
    const solutionsWithBotInfo = await Promise.all(
      exportableSolutions.map(async (s) => {
        const botInfo = await detectBotInSolution(dataverseClient, s.solutionid);
        return {
          solutionId: s.solutionid,
          uniqueName: s.uniquename,
          displayName: s.friendlyname,
          version: s.version,
          publisher: s.publisherid?.friendlyname || "Unknown",
          description: "",
          isManaged: s.ismanaged,
          hasBot: botInfo.hasBot,
          botInfo: botInfo.hasBot ? botInfo : undefined,
        };
      })
    );

    // Filter to bots only if requested
    const filteredSolutions = botsOnly
      ? solutionsWithBotInfo.filter((s) => s.hasBot)
      : solutionsWithBotInfo;

    return NextResponse.json({
      demoMode: false,
      configured: true,
      sourceEnvironment: environmentUrl,
      sourceTenantId,
      solutions: filteredSolutions,
    });
  } catch (error) {
    console.error("Source solutions error:", error);
    return internalError(
      "Failed to fetch source solutions",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * Detect if a solution contains a Copilot Studio bot/agent
 * Queries the solution components for bot-related entities
 */
async function detectBotInSolution(
  client: DataverseClient,
  solutionId: string
): Promise<{
  hasBot: boolean;
  botId?: string;
  botName?: string;
  botType?: string;
  topicsCount?: number;
  knowledgeSources?: string[];
}> {
  try {
    // Query solution components of type "bot" (component type 300 for chatbot, 301 for bot component)
    // The msdyn_botcomponent table contains bot definitions
    const result = await client.get<{ value: SolutionComponent[] }>("/solutioncomponents", {
      $select: "objectid,componenttype",
      $filter: `_solutionid_value eq '${solutionId}' and (componenttype eq 300 or componenttype eq 301)`,
    });

    if (result.value && result.value.length > 0) {
      // Found bot components - try to get more details
      const botComponentId = result.value.find((c) => c.componenttype === 300)?.objectid;

      if (botComponentId) {
        try {
          // Try to get bot details from the chatbot table
          const botResult = await client.get<{ value: ChatBot[] }>("/bots", {
            $select: "botid,name,schemaname",
            $filter: `botid eq '${botComponentId}'`,
          });

          if (botResult.value && botResult.value.length > 0) {
            const bot = botResult.value[0];
            return {
              hasBot: true,
              botId: bot.botid,
              botName: bot.name || bot.schemaname,
              botType: "copilot",
            };
          }
        } catch {
          // Bot details query failed, but we still know there's a bot
        }
      }

      return { hasBot: true };
    }

    // No bot components found - check for Power Virtual Agents classic bots
    // These use different entity types
    try {
      const pvaResult = await client.get<{ value: SolutionComponent[] }>("/solutioncomponents", {
        $select: "objectid,componenttype",
        $filter: `_solutionid_value eq '${solutionId}' and componenttype eq 10052`, // PVA bot type
      });

      if (pvaResult.value && pvaResult.value.length > 0) {
        return { hasBot: true, botType: "pva-classic" };
      }
    } catch {
      // PVA query failed, continue
    }

    return { hasBot: false };
  } catch (error) {
    console.error("Bot detection error:", error);
    // On error, assume no bot (conservative approach)
    return { hasBot: false };
  }
}

interface SolutionComponent {
  objectid: string;
  componenttype: number;
}

interface ChatBot {
  botid: string;
  name?: string;
  schemaname?: string;
}
