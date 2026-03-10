#!/usr/bin/env node
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

/**
 * AgentSync MCP Server
 *
 * Production-ready Model Context Protocol server for AgentSync deployment management
 * Supports Claude Desktop, Cline, Cursor, and other MCP-compatible AI assistants
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { config } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { MCPError } from "./lib/errors.js";
import { metrics, trackRequest } from "./lib/metrics.js";
import { tools } from "./tools/definitions.js";
import {
  handleListDeployments,
  handleGetDeploymentStatus,
  handleListAgents,
  handleListTenants,
  handleAnalyzeDeploymentRisk,
  handleCreateDeployment,
  handleMonitorDeployment,
  handleGetDeploymentStats,
  handleRetryDeployment,
} from "./handlers/index.js";

/**
 * Create the MCP server
 */
const server = new Server(
  {
    name: config.serverName,
    version: config.serverVersion,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler for list tools request
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug("Handling list tools request");
  return { tools };
});

/**
 * Handler for call tool request
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const requestId = `${name}-${Date.now()}`;

  logger.info("Tool invoked", { tool: name, args, requestId });

  try {
    // Route to appropriate handler with metrics tracking
    return await trackRequest(name, requestId, async () => {
      switch (name) {
        case "list_deployments":
          return await handleListDeployments(args);

        case "get_deployment_status":
          return await handleGetDeploymentStatus(args);

        case "list_agents":
          return await handleListAgents(args);

        case "list_tenants":
          return await handleListTenants(args);

        case "analyze_deployment_risk":
          return await handleAnalyzeDeploymentRisk(args);

        case "create_deployment":
          return await handleCreateDeployment(args);

        case "monitor_deployment":
          return await handleMonitorDeployment(args);

        case "get_deployment_stats":
          return await handleGetDeploymentStats(args);

        case "retry_deployment":
          return await handleRetryDeployment(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  } catch (error) {
    logger.error("Tool invocation failed", {
      tool: name,
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Format error response
    const errorMessage =
      error instanceof MCPError
        ? JSON.stringify(error.toJSON(), null, 2)
        : error instanceof Error
          ? error.message
          : String(error);

    return {
      content: [
        {
          type: "text" as const,
          text: errorMessage,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the MCP server
 */
async function main() {
  try {
    // Validate configuration
    logger.info("Starting AgentSync MCP Server", {
      serverName: config.serverName,
      serverVersion: config.serverVersion,
      apiBaseUrl: config.apiBaseUrl,
      logLevel: config.logLevel,
    });

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("AgentSync MCP Server started successfully", {
      transport: "stdio",
      tools: tools.length,
    });
  } catch (error) {
    logger.error("Fatal error during startup", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Log metrics periodically (every 5 minutes)
setInterval(
  () => {
    metrics.logMetrics();
  },
  5 * 60 * 1000
);

// Handle process termination gracefully
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  metrics.logMetrics(); // Log final metrics
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  metrics.logMetrics(); // Log final metrics
  process.exit(0);
});

// Start the server
main();
