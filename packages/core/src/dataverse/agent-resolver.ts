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

import { DataverseClient, SolutionRecord } from "./client.js";

/**
 * Bot (Copilot) record from Dataverse
 */
export interface BotRecord {
  botid: string;
  name: string;
  schemaname?: string;
  solutionid?: string;
  statecode: number;
  statuscode: number;
  createdon: string;
  modifiedon: string;
  componentstate?: number;
}

/**
 * Solution component record for bot resolution (internal use)
 */
interface BotSolutionComponent {
  solutioncomponentid: string;
  componenttype: number;
  objectid: string;
  _solutionid_value: string;
  rootcomponentbehavior?: number;
}

/**
 * Parsed M365 agent URL info
 */
export interface ParsedAgentUrl {
  titleId: string;
  possibleBotId: string | null;
  prefix: string | null;
  originalUrl: string;
}

/**
 * Resolved agent info with solution details
 */
export interface ResolvedAgent {
  bot: BotRecord;
  solution: SolutionRecord;
  titleId: string;
}

// Component types for bots in solutioncomponent table
// (unused constant kept for documentation - actual values are in componentTypes array)

/**
 * Resolves M365 agent URLs to Dataverse solutions for export
 */
export class AgentResolver {
  constructor(private client: DataverseClient) {}

  /**
   * Parse an M365 agent URL to extract the titleId
   *
   * URL format: https://m365.cloud.microsoft/chat/?titleId=P_8cfc4e6f-267e-db15-c6e7-3fc47a54f61e
   *
   * The titleId appears to be formatted as: {prefix}_{guid}
   * Where prefix might indicate the type (P = Published?)
   */
  parseAgentUrl(url: string): ParsedAgentUrl {
    const parsed = new URL(url);
    const titleId = parsed.searchParams.get("titleId");

    if (!titleId) {
      throw new Error("No titleId parameter found in URL");
    }

    // Try to extract the GUID portion from titleId
    // Format appears to be: P_8cfc4e6f-267e-db15-c6e7-3fc47a54f61e
    const parts = titleId.split("_");
    let prefix: string | null = null;
    let possibleBotId: string | null = null;

    if (parts.length >= 2) {
      prefix = parts[0];
      // The remaining parts might form a GUID (with dashes already present)
      possibleBotId = parts.slice(1).join("_");

      // Validate it looks like a GUID
      const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidPattern.test(possibleBotId)) {
        possibleBotId = null;
      }
    }

    return {
      titleId,
      possibleBotId,
      prefix,
      originalUrl: url,
    };
  }

  /**
   * Query all bots in the environment
   */
  async listBots(): Promise<BotRecord[]> {
    const result = await this.client.get<{ value: BotRecord[] }>("/bots", {
      $select: "botid,name,schemaname,statecode,statuscode,createdon,modifiedon,componentstate",
      $orderby: "modifiedon desc",
    });
    return result.value;
  }

  /**
   * Get a bot by its ID
   */
  async getBotById(botId: string): Promise<BotRecord | null> {
    try {
      const result = await this.client.get<BotRecord>(`/bots(${botId})`, {
        $select: "botid,name,schemaname,statecode,statuscode,createdon,modifiedon,componentstate",
      });
      return result;
    } catch (error) {
      // Bot not found
      if (error instanceof Error && error.message.includes("404")) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for a bot by name (partial match)
   */
  async searchBotsByName(searchTerm: string): Promise<BotRecord[]> {
    const result = await this.client.get<{ value: BotRecord[] }>("/bots", {
      $select: "botid,name,schemaname,statecode,statuscode,createdon,modifiedon,componentstate",
      $filter: `contains(name, '${searchTerm}')`,
      $orderby: "modifiedon desc",
    });
    return result.value;
  }

  /**
   * Find the solution containing a specific bot
   *
   * Uses the solutioncomponent table to find which solution contains the bot
   */
  async findSolutionForBot(botId: string): Promise<SolutionRecord | null> {
    // Search solutioncomponents for this bot
    // Try multiple component types as the exact type for bots varies
    const componentTypes = [10109, 10034, 300]; // Different possible bot component types

    for (const componentType of componentTypes) {
      const result = await this.client.get<{ value: BotSolutionComponent[] }>(
        "/solutioncomponents",
        {
          $select: "solutioncomponentid,componenttype,objectid,_solutionid_value",
          $filter: `objectid eq '${botId}' and componenttype eq ${componentType}`,
        }
      );

      if (result.value.length > 0) {
        const component = result.value[0];
        const solution = await this.client.get<SolutionRecord>(
          `/solutions(${component._solutionid_value})`,
          {
            $select: "solutionid,uniquename,friendlyname,version,ismanaged",
          }
        );
        return solution;
      }
    }

    return null;
  }

  /**
   * Resolve an M365 agent URL to its containing solution
   *
   * This tries multiple strategies:
   * 1. Direct bot ID lookup (if titleId contains a valid GUID)
   * 2. Search all bots for a matching ID pattern
   * 3. Query solution components
   */
  async resolveUrlToSolution(url: string): Promise<ResolvedAgent> {
    const parsed = this.parseAgentUrl(url);

    // Strategy 1: Try direct bot ID lookup
    if (parsed.possibleBotId) {
      const bot = await this.getBotById(parsed.possibleBotId);
      if (bot) {
        const solution = await this.findSolutionForBot(bot.botid);
        if (solution) {
          return { bot, solution, titleId: parsed.titleId };
        }
      }
    }

    // Strategy 2: List all bots and try to match by ID pattern
    const allBots = await this.listBots();

    // Try to find a bot whose ID matches part of the titleId
    for (const bot of allBots) {
      if (parsed.titleId.toLowerCase().includes(bot.botid.toLowerCase().replace(/-/g, ""))) {
        const solution = await this.findSolutionForBot(bot.botid);
        if (solution) {
          return { bot, solution, titleId: parsed.titleId };
        }
      }
    }

    // Strategy 3: Try matching by name containing the titleId prefix
    if (parsed.prefix) {
      const matchingBots = await this.searchBotsByName(parsed.prefix);
      for (const bot of matchingBots) {
        const solution = await this.findSolutionForBot(bot.botid);
        if (solution) {
          return { bot, solution, titleId: parsed.titleId };
        }
      }
    }

    throw new Error(
      `Could not resolve agent URL to a solution. titleId: ${parsed.titleId}\n` +
        `Tried: direct lookup, pattern matching across ${allBots.length} bots.\n` +
        `The titleId format may require M365 Graph API access to resolve.`
    );
  }

  /**
   * List all bots with their containing solutions
   */
  async listBotsWithSolutions(): Promise<
    Array<{ bot: BotRecord; solution: SolutionRecord | null }>
  > {
    const bots = await this.listBots();
    const results: Array<{ bot: BotRecord; solution: SolutionRecord | null }> = [];

    for (const bot of bots) {
      const solution = await this.findSolutionForBot(bot.botid);
      results.push({ bot, solution });
    }

    return results;
  }
}
