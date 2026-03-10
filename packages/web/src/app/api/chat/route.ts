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
import { getAnthropicClient } from "@/lib/llm/anthropic-client";
import { parseIntent } from "@/lib/llm/intent-parser";
import { requireAuth } from "@/lib/api-middleware";
import { getDatabase } from "@/lib/db";
import { isDemoMode, DEMO_CONFIG, generateMockDeploymentHistory } from "@agentsync/core";
import { demoDeployments } from "@/lib/demo-store";
import { chatRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { parseAndValidate, chatRequestSchema } from "@/lib/validation";
import { validationError, internalError } from "@/lib/errors";

const logger = createLogger("ChatAPI");

export const dynamic = "force-dynamic";

interface ChatRequest {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Convert a tool call into a ChatAction for confirmation
 */
function convertToolCallToAction(toolCall: any): any {
  const { name, input } = toolCall;

  switch (name) {
    case "create_deployment":
      return {
        type: "deploy",
        label: `Deploy ${input.agent_name}`,
        agentName: input.agent_name,
        tenantIds: input.tenant_identifiers,
        requiresConfirmation: true,
        toolCallId: toolCall.id,
      };

    case "retry_deployment":
      return {
        type: "retry",
        label: `Retry deployment #${input.deployment_id}`,
        deploymentId: input.deployment_id,
        requiresConfirmation: true,
        toolCallId: toolCall.id,
      };

    case "cancel_deployment":
      return {
        type: "cancel",
        label: `Cancel deployment #${input.deployment_id}`,
        deploymentId: input.deployment_id,
        requiresConfirmation: true,
        toolCallId: toolCall.id,
      };

    default:
      // Info-gathering tools don't need confirmation
      return null;
  }
}

/**
 * Fetch system context for the AI
 */
async function getSystemContext() {
  try {
    // Get deployment statistics
    const deployments = isDemoMode()
      ? [...Array.from(demoDeployments.values()), ...generateMockDeploymentHistory(50)]
      : [];

    const failedDeployments = deployments
      .filter((d) =>
        d.tenantResults?.some((r) => ["failed", "error", "timed_out"].includes(r.status))
      )
      .slice(0, 10);

    const activeDeployments = deployments
      .filter((d) => d.status === "in_progress" || d.status === "pending")
      .slice(0, 5);

    const recentDeployments = deployments
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    // Get health check data
    let healthStats = {
      versionDriftCount: 0,
      dependencyIssuesCount: 0,
      tenantsWithIssues: [] as any[],
    };
    try {
      const db = getDatabase();
      const results = db
        .prepare(
          `
        SELECT tenant_id, tenant_name, version_drift, dependencies_healthy,
               installed_version, expected_version, missing_dependencies
        FROM health_check_results
        WHERE id IN (
          SELECT MAX(id)
          FROM health_check_results
          GROUP BY tenant_id
        )
      `
        )
        .all() as Array<{
        tenant_id: string;
        tenant_name: string;
        version_drift: number;
        dependencies_healthy: number;
        installed_version: string | null;
        expected_version: string | null;
        missing_dependencies: string | null;
      }>;

      healthStats = {
        versionDriftCount: results.filter((r) => r.version_drift === 1).length,
        dependencyIssuesCount: results.filter((r) => r.dependencies_healthy === 0).length,
        tenantsWithIssues: results
          .filter((r) => r.version_drift === 1 || r.dependencies_healthy === 0)
          .map((r) => ({
            id: r.tenant_id,
            name: r.tenant_name,
            versionDrift: r.version_drift === 1,
            installedVersion: r.installed_version,
            expectedVersion: r.expected_version,
            dependencyIssues: r.dependencies_healthy === 0,
            missingDependencies: r.missing_dependencies ? JSON.parse(r.missing_dependencies) : [],
          })),
      };
    } catch (error) {
      console.error("Error fetching health data:", error);
    }

    // Get tenant count and list
    const totalTenants = isDemoMode() ? DEMO_CONFIG.tenants.length : 0;
    const tenants = isDemoMode()
      ? DEMO_CONFIG.tenants.map((t) => ({
          id: t.tenantId,
          name: t.name,
        }))
      : [];

    // Get available agents/solutions
    const agents = isDemoMode()
      ? [
          { name: "Customer Service Agent", id: "CustomerServiceAgent" },
          { name: "Sales Assistant Copilot", id: "SalesAssistant" },
          { name: "HR Onboarding Bot", id: "HROnboarding" },
          { name: "IT Helpdesk Agent", id: "ITHelpdesk" },
        ]
      : [];

    return {
      totalTenants,
      tenants,
      agents,
      activeDeployments: activeDeployments.map((d) => ({
        id: d.id,
        solutionName: d.solutionName,
        status: d.status,
        createdAt: d.createdAt,
        tenantCount: d.totalTenants || 0,
      })),
      failedDeployments: failedDeployments.map((d) => ({
        id: d.id,
        solutionName: d.solutionName,
        createdAt: d.createdAt,
        failedTenants:
          d.tenantResults
            ?.filter((r) => ["failed", "error", "timed_out"].includes(r.status))
            .map((r) => ({
              tenantId: r.tenantId,
              error: r.error,
            })) || [],
      })),
      recentDeployments: recentDeployments.map((d) => ({
        id: d.id,
        solutionName: d.solutionName,
        status: d.status,
        createdAt: d.createdAt,
      })),
      healthStats,
    };
  } catch (error) {
    console.error("Error fetching system context:", error);
    return null;
  }
}

/**
 * POST /api/chat - Send a message to the AI assistant
 */
export async function POST(request: NextRequest) {
  // Require authentication
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    return session;
  }

  // Apply rate limiting (protect LLM costs)
  const rateLimitResult = await chatRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Validate request body
    const validation = await parseAndValidate(request, chatRequestSchema);
    if (!validation.success || !validation.data) {
      return validationError(
        "Invalid request body",
        validation.errors?.map((e) => `${e.path}: ${e.message}`)
      );
    }

    const { message, history = [] } = validation.data;

    // Fetch system context
    const context = await getSystemContext();

    // Build enhanced system prompt with real-time context
    const systemPrompt = `You are an AI assistant helping manage AgentSync - a platform for deploying Microsoft Copilot Studio agents across multiple Microsoft 365 tenants.

Current user: ${session.user.email} (${session.user.roles?.join(", ") || "Viewer"})

=== YOUR ROLE ===
You help MSP IT professionals manage multi-tenant agent deployments. You can:
• Answer "how do I" questions about using AgentSync
• Explain deployment workflows and best practices
• Investigate issues with deployments, tenants, or agents
• Suggest solutions when things go wrong
• Recommend actions to take (retry deployments, fix health issues, etc.)
• Guide users through complex tasks
• **Answer questions by using available tools** - Don't say "I can't" when you have tools to help!
• **Cross-reference data** - e.g., "which tenants don't have agent X?" → use list_tenants and check recent deployments

=== BE PROACTIVE AND INSIGHTFUL ===
Don't just wait to be asked - act like a knowledgeable MSP colleague who notices things:

**Spot patterns and call them out:**
• "I notice 3 deployments to Contoso failed this week - there might be a tenant environment issue worth investigating"
• "Your deployment success rate dropped from 95% to 78% over the past week - this is unusual"
• "You have 5 tenants with version drift accumulating - consider a bulk update to avoid support headaches"

**Point out risks proactively:**
• "Several failed deployments show authentication errors - your service principal credentials may need renewal"
• "Tenant 'Fabrikam' has missing dependencies that will break deployments - fix this before deploying there"
• "You're deploying to 10 tenants at once - consider staggering to avoid overwhelming your support team"

**Share MSP best practices unprompted:**
• "Pro tip: Test new agents in a pilot tenant before mass deployment"
• "Schedule high-risk updates during maintenance windows to minimize user impact"
• "Version drift of more than 2 releases can cause compatibility issues - stay current"

**Make helpful suggestions:**
• When you see issues, suggest specific next steps
• When deployments succeed, acknowledge good practices
• When patterns emerge, help the user understand what's happening

Think of yourself as a senior MSP engineer reviewing the dashboard and sharing observations - not just answering questions.

=== CRITICAL: USE THE DATA YOU HAVE ===
**You have DIRECT ACCESS to system state - USE IT IMMEDIATELY when asked:**

When user asks "which tenants have [issue]?" → Look at the CURRENT SYSTEM STATE above and list them directly!
• "Which tenants are missing dependencies?" → Check the "Tenants needing attention" section and list ALL tenants with "missing dependencies"
• "Which tenants have version drift?" → Check the "Tenants needing attention" section and list ALL tenants with version info
• "What deployments failed?" → Check the "Failed Deployments" section and list them with details
• "What's running now?" → Check the "Active Deployments" section and list them
• **"Which tenants don't have agent X?"** → Check "Recent Activity" section, see which tenants received agent X, compare with "Available Tenants" list, identify missing ones

**YOU CAN answer "which tenants don't have X" by:**
1. Looking at "Recent Activity" to see recent deployments
2. Checking which tenants received which agents
3. Comparing with "Available Tenants" list
4. Identifying tenants that never received that agent
5. **DO THIS - don't say "I cannot"!**

**NEVER say "I need tenant IDs" or "please provide more info" or "I cannot determine" when the data is ALREADY in the system state above!**

**Examples of CORRECT behavior:**
User: "Which tenants have dependency issues?"
You: "Based on the current health checks, these tenants have missing dependencies:
• Contoso Corp - missing: PowerAutomate, SharePoint connectors
• Fabrikam Ltd - missing: Teams connector
You should fix these before deploying any agents to avoid failures."

User: "What failed recently?"
You: "Looking at recent deployments, I see:
• #batch-abc123: Product Demo Agent - 2 tenants failed with authentication errors
• #batch-xyz789: FAQ Bot - 1 tenant failed with timeout
The auth errors suggest we should check service principal credentials."

User: "Which tenants don't have the product agent?"
You: "Looking at recent deployment history in the 'Recent Activity' section, I can see deployments to various tenants. Let me check which tenants haven't received the Product Demo Agent:
• Tenant A - has Product Demo Agent (deployed in #batch-xyz)
• Tenant B - NO Product Demo Agent deployment found
• Tenant C - has Product Demo Agent (deployed in #batch-abc)
You should deploy to Tenant B to ensure all tenants have this agent."

=== CURRENT SYSTEM STATE ===
${
  context
    ? `
**Overview:** ${context.totalTenants} tenants configured

**Available Agents:**${context.agents.map((a) => `\n  • ${a.name} (id: ${a.id})`).join("")}

**Available Tenants:**${context.tenants.map((t) => `\n  • ${t.name} (id: ${t.id})`).join("")}

**Active Deployments:** ${
        context.activeDeployments.length > 0
          ? context.activeDeployments
              .map(
                (d) =>
                  `\n  • #${d.id}: ${d.solutionName} → ${d.tenantCount} tenants (started ${new Date(d.createdAt).toLocaleString()})`
              )
              .join("")
          : " None"
      }

**Failed Deployments:** ${
        context.failedDeployments.length > 0
          ? context.failedDeployments
              .map((d) => {
                const failedCount = d.failedTenants.length;
                const firstError = d.failedTenants[0]?.error || "Unknown error";
                return `\n  • #${d.id}: ${d.solutionName} - ${failedCount} tenant${failedCount !== 1 ? "s" : ""} failed\n    Error: ${firstError.substring(0, 80)}...`;
              })
              .join("")
          : " None"
      }

**Health Issues:**
  • Version drift: ${context.healthStats.versionDriftCount} tenant${context.healthStats.versionDriftCount !== 1 ? "s" : ""}
  • Missing dependencies: ${context.healthStats.dependencyIssuesCount} tenant${context.healthStats.dependencyIssuesCount !== 1 ? "s" : ""}${
    context.healthStats.tenantsWithIssues.length > 0
      ? "\n\n**Tenants needing attention:**" +
        context.healthStats.tenantsWithIssues
          .slice(0, 3)
          .map(
            (t) =>
              `\n  • ${t.name}: ${t.versionDrift ? `outdated (${t.installedVersion} vs ${t.expectedVersion})` : ""}${t.versionDrift && t.dependencyIssues ? ", " : ""}${t.dependencyIssues ? "missing dependencies" : ""}`
          )
          .join("")
      : ""
  }

**Recent Activity:**${context.recentDeployments
        .slice(0, 5)
        .map((d) => `\n  • #${d.id}: ${d.solutionName} - ${d.status}`)
        .join("")}
`
    : "System context unavailable"
}

=== HOW TO RESPOND ===
**Tone:** Friendly, helpful, and conversational - like a knowledgeable colleague
**Style:** Clear and concise, but thorough when explaining complex topics
**Format:** Use bullet points for lists, bold for emphasis

**When asked for "system status" or "brief overview":**
Keep it SHORT - 2-3 sentences maximum! Just highlight the most important items:
• If there are alerts/issues → mention them
• If everything is good → say "all systems normal"
• Don't list every detail - just the headlines

**When answering "how do I" questions:**
1. Explain the concept or workflow clearly
2. Provide step-by-step guidance if needed
3. Mention relevant UI locations (dashboard, deployments page, etc.)
4. Share tips or best practices
5. Offer to help with next steps

**When addressing issues:**
1. Acknowledge the problem
2. Explain what's likely causing it
3. Suggest specific actions to fix it
4. Prioritize by severity if multiple issues

**Available actions you can execute:**
• **Deploy agents:** User says "deploy X to Y" → you can trigger deployments
• **Retry failed deployments:** mention deployment ID (#abc123)
• **Cancel running deployments:** mention deployment ID
• **Navigate pages:** suggest /deployments, /tenants, /agents, /settings

**When the user wants to take an action:**
You have access to powerful tools to execute actions on their behalf:
- **create_deployment**: Deploy agents to tenants
- **retry_deployment**: Retry failed deployments
- **cancel_deployment**: Cancel running deployments
- **get_deployment_details**: Fetch deployment information
- **get_tenant_health**: Check tenant health status
- **list_agents, list_tenants**: List available resources

**CRITICAL: How to use tools with IDs:**
1. When the user says "deploy X to Y", you MUST create_deployment tool call immediately
2. **MANDATORY ID LOOKUP PROCESS WITH FUZZY MATCHING:**
   - User says: "deploy product agent to contoso" or "deploy sales to fabisco"
   - Step 1: Look at "Available Agents" list → Find closest match (be aggressive with fuzzy matching!)
     - "product", "product agent" → "Customer Service Agent (id: CustomerServiceAgent)" (default agent)
     - "customer service", "customer support", "service agent" → "Customer Service Agent (id: CustomerServiceAgent)"
     - "sales", "sales assistant", "sales agent" → "Sales Assistant Copilot (id: SalesAssistant)"
   - Step 2: Extract the **id** field → "CustomerServiceAgent" or "SalesAssistant"
   - Step 3: Look at "Available Tenants" → Find closest match (fuzzy match typos!)
     - "contoso", "contso", "conso" → "Contoso Corporation (id: 11111...)"
     - "fabisco", "fabrikam", "fabrikm" → "Fabrikam Inc (id: 22222...)"
     - "woodfard", "woodgrove", "woodward" → "Woodgrove Bank (id: 55555...)"
   - Step 4: Extract the **id** field → UUID
   - Step 5: Create deployment tool call with the IDs
3. **NEVER ask for confirmation if you find a close match - just use it!**
4. **NEVER pass display names or raw user input - ONLY IDs from the lists**
5. Only ask for clarification if there's truly no match at all
6. The tool will show a confirmation dialog to the user automatically

**CRITICAL: Handling multi-turn deployments:**
If you ask the user to clarify a tenant name (e.g., "Did you mean Woodgrove Bank?"), and they confirm ("yes" or "yes Woodgrove Bank"):
- **YOU MUST IMMEDIATELY CREATE THE DEPLOYMENT** using create_deployment tool in THIS response
- Look back in the conversation history to find the ORIGINAL agent they wanted to deploy
- Use the CONFIRMED tenant name/ID from "Available Tenants" list
- **DO NOT just say "Let me process that" - CALL THE create_deployment TOOL IN THIS SAME RESPONSE!**
- Your response MUST include BOTH text acknowledgment AND the tool call

Example flow that shows CORRECT behavior:
User: "deploy product agent to woodfard"
You: "I couldn't find 'woodfard'. Did you mean Woodgrove Bank?"
User: "yes"
You: → Response MUST include:
  1. Text: "Great! I'll deploy the Customer Service Agent to Woodgrove Bank now."
  2. Tool call: create_deployment with agent_name="CustomerServiceAgent", tenant_identifiers=["55555555-5555-5555-5555-555555555555"]

**BAD examples (DON'T DO THIS):**
User: "yes"
You: "Let me process that request for you." ← NO TOOL CALL = WRONG!

User: "yes"
You: "Okay, I'll get that started." ← NO TOOL CALL = WRONG!

**GOOD examples (DO THIS):**
User: "yes"
You: [Text: "Creating deployment now..." + Tool call: create_deployment(...)]

**Examples showing correct ID usage:**
User: "deploy customer service to contoso"
→ Look up "Customer Service Agent" in Available Agents list → ID is "CustomerServiceAgent"
→ Look up "Contoso" in Available Tenants list → ID is "11111111-1111-1111-1111-111111111111"
→ create_deployment with agent_name="CustomerServiceAgent", tenant_identifiers=["11111111-1111-1111-1111-111111111111"]

User: "deploy sales assistant to woodgrove and fabrikam"
→ Look up "Sales Assistant Copilot" → ID is "SalesAssistant"
→ Look up "Woodgrove Bank" → ID is "55555555-5555-5555-5555-555555555555"
→ Look up "Fabrikam" → ID is "22222222-2222-2222-2222-222222222222"
→ create_deployment with agent_name="SalesAssistant", tenant_identifiers=["55555555-5555-5555-5555-555555555555", "22222222-2222-2222-2222-222222222222"]

**Remember:**
- ALWAYS use the ID (like "CustomerServiceAgent"), never the display name (like "Customer Service Agent"), when calling tools!
- When user confirms a clarification, CREATE THE DEPLOYMENT immediately with the tool!

Be conversational and helpful. Explain what you're about to do before calling tools. The user will see a confirmation prompt with all the details.`;

    // Build message history for context
    const messages = [
      {
        role: "user" as const,
        content: systemPrompt,
      },
      ...history,
      {
        role: "user" as const,
        content: message,
      },
    ];

    // Get response from LLM with tools enabled
    const client = getAnthropicClient();

    // Add explicit action instruction for deployment requests
    const actionMessage = {
      role: "user" as const,
      content: `CRITICAL INSTRUCTIONS FOR DEPLOYMENT REQUESTS:

When the user says "deploy X to Y":
1. ✅ DO: Immediately look up the agent/tenant IDs from the lists above (use fuzzy matching!)
2. ✅ DO: Call create_deployment tool RIGHT NOW in this response with the IDs
3. ✅ DO: Say something brief like "I'll deploy [agent] to [tenant] now"
4. ❌ DON'T: Say "Let me check available agents" - you already have the list above!
5. ❌ DON'T: Call list_agents or list_tenants - you already have that data!
6. ❌ DON'T: Say "Let me process that" without calling the tool!

Example CORRECT response to "deploy product agent to fabisco":
- Text: "I'll deploy the Customer Service Agent to Fabrikam Inc now."
- Tool call: create_deployment with agent_name="CustomerServiceAgent", tenant_identifiers=["22222222-2222-2222-2222-222222222222"]

Example WRONG response:
- Text: "Let me check the available agents first." ← NO! You already have the list!

The agent/tenant lists are ALREADY in your context above. Just fuzzy match and deploy!`,
    };
    messages.push(actionMessage);

    const response = await client.chat(messages, { tools: true });

    // Handle tool calls
    let responseText = "";
    let actions: any[] = [];

    if (typeof response === "string") {
      responseText = response;
      // Parse legacy format for backwards compatibility
      const parsed = parseIntent(message, response);
      actions = parsed.actions;
    } else {
      responseText = response.content;

      // Convert tool calls to confirmation actions
      if (response.toolCalls && response.toolCalls.length > 0) {
        logger.debug("Tool calls received", { toolCalls: response.toolCalls });
        for (const toolCall of response.toolCalls) {
          const action = convertToolCallToAction(toolCall);
          logger.debug("Converted action", { action });
          if (action) {
            actions.push(action);
          }
        }

        // If tools were called, prepend a transparency message
        if (actions.length > 0) {
          const actionDesc = actions.map((a) => a.label).join(", ");
          responseText = `I'll help you with: ${actionDesc}\n\n${responseText}`;
        }
      }
    }

    return NextResponse.json({
      response: responseText,
      actions,
      toolCalls: typeof response === "object" ? response.toolCalls : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return internalError(
      "Failed to process message",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
