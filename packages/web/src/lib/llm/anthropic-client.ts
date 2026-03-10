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

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ASSISTANT_TOOLS, convertToolsForGemini } from "./tools";
import { reportErrorToGitHub } from "../github-issue-reporter";
import { createLogger } from "../logger";

const logger = createLogger("AnthropicClient");
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

// Use Anthropic if key is available, otherwise fall back to Gemini (free tier)
// Note: We can use real AI even in demo mode (demo mode just affects auth/data, not AI)
const useAnthropic = !!anthropicApiKey;
const useGemini = !anthropicApiKey && !!geminiApiKey;

export class AnthropicClient {
  private anthropicClient: Anthropic | null = null;
  private geminiClient: any = null;
  private workingModel: string | null = null;

  // Models to try in order (most recent first) - Updated Jan 2026
  private geminiModels = [
    "gemini-2.5-flash", // Latest fast model
    "gemini-2.0-flash", // Stable fast model
    "gemini-flash-latest", // Always points to latest flash
    "gemini-2.5-pro", // Latest pro model (slower but smarter)
    "gemini-pro-latest", // Always points to latest pro
  ];

  constructor() {
    if (useAnthropic) {
      this.anthropicClient = new Anthropic({
        apiKey: anthropicApiKey,
      });
      logger.info("Using Anthropic Claude Opus 4.5");
    } else if (useGemini) {
      logger.info("Gemini API configured - will auto-discover working model");
    } else {
      logger.info("Demo mode - using mock responses");
    }
  }

  async chat(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: { tools?: boolean }
  ): Promise<string | { content: string; toolCalls?: any[] }> {
    // If no AI provider configured, return mock response
    if (!useAnthropic && !useGemini) {
      const systemMessage = messages[0]?.content || "";
      // Find the LAST user message (excluding action prompt instructions)
      logger.debug("Filtering messages for mock response", {
        totalMessages: messages.length,
        messageRoles: messages.map((m) => m.role),
      });
      const userMessages = messages.filter(
        (m) =>
          m.role === "user" &&
          !m.content.toUpperCase().includes("CRITICAL INSTRUCTIONS") &&
          !m.content.includes("Example CORRECT response")
      );
      logger.debug("Filtered user messages", { count: userMessages.length });
      const userMessage = userMessages[userMessages.length - 1]?.content || "";
      logger.debug("Selected user message", { preview: userMessage.substring(0, 100) });
      return this.getMockResponseWithActions(userMessage, systemMessage);
    }

    // Use Anthropic
    if (this.anthropicClient) {
      return this.chatWithAnthropic(messages, options);
    }

    // Use Gemini
    if (useGemini) {
      return this.chatWithGemini(messages, options);
    }

    return "Sorry, no LLM provider configured.";
  }

  private async chatWithAnthropic(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: { tools?: boolean }
  ): Promise<string | { content: string; toolCalls?: any[] }> {
    try {
      const requestParams: any = {
        model: "claude-opus-4-20250514", // Opus 4.5 for maximum intelligence
        max_tokens: 4096,
        messages,
      };

      // Enable tools if requested
      if (options?.tools) {
        requestParams.tools = ASSISTANT_TOOLS;
      }

      const response = await this.anthropicClient!.messages.create(requestParams);

      // Extract text content
      const textContent = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as any).text)
        .join("\n");

      // Extract tool calls
      const toolCalls = response.content
        .filter((block) => block.type === "tool_use")
        .map((block) => ({
          id: (block as any).id,
          name: (block as any).name,
          input: (block as any).input,
        }));

      if (toolCalls.length > 0) {
        return {
          content: textContent,
          toolCalls,
        };
      }

      return textContent || "Sorry, I received an unexpected response format.";
    } catch (error) {
      console.error("Anthropic API error:", error);
      throw new Error("Failed to get response from AI. Please try again.");
    }
  }

  private async chatWithGemini(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: { tools?: boolean }
  ): Promise<string | { content: string; toolCalls?: any[] }> {
    // Convert messages to Gemini format
    const systemPrompt = messages[0]?.content || "";
    // Find the LAST user message (excluding action prompt instructions)
    const userMessages = messages.filter(
      (m) =>
        m.role === "user" &&
        !m.content.toUpperCase().includes("CRITICAL INSTRUCTIONS") &&
        !m.content.includes("Example CORRECT response")
    );
    const userMessage = userMessages[userMessages.length - 1]?.content || "";
    // Build chat history excluding system prompt, action prompts, and last user message
    let chatHistory = messages
      .slice(1, -1)
      .filter(
        (m) =>
          m.role !== "user" ||
          (m.content !== userMessage &&
            !m.content.toUpperCase().includes("CRITICAL INSTRUCTIONS") &&
            !m.content.includes("Example CORRECT response"))
      )
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

    // Gemini requires first message in history to be from 'user' role
    // Remove any leading 'model' messages
    while (chatHistory.length > 0 && chatHistory[0].role === "model") {
      chatHistory = chatHistory.slice(1);
    }

    // Prepend system context to first user message
    const fullUserMessage =
      chatHistory.length === 0 ? `${systemPrompt}\n\nUser: ${userMessage}` : userMessage;

    // Try cached working model first, then discover
    const modelsToTry = this.workingModel
      ? [this.workingModel, ...this.geminiModels.filter((m) => m !== this.workingModel)]
      : this.geminiModels;

    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        // Create client for this model
        const genAI = new GoogleGenerativeAI(geminiApiKey!);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        });

        // Start chat with history
        const chatConfig: any = {
          history: chatHistory,
        };

        // Enable tools if requested
        if (options?.tools) {
          chatConfig.tools = convertToolsForGemini(ASSISTANT_TOOLS);
        }

        const chat = model.startChat(chatConfig);
        const result = await chat.sendMessage(fullUserMessage);
        const response = await result.response;

        // Success! Cache this model
        if (!this.workingModel || this.workingModel !== modelName) {
          this.workingModel = modelName;
          logger.info("Using Google Gemini model", { model: modelName });
        }

        // Extract text content
        let textContent = "";
        const toolCalls: any[] = [];

        for (const candidate of response.candidates || []) {
          for (const part of candidate.content?.parts || []) {
            if (part.text) {
              textContent += part.text;
            }
            if (part.functionCall) {
              toolCalls.push({
                id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: part.functionCall.name,
                input: part.functionCall.args,
              });
            }
          }
        }

        if (toolCalls.length > 0) {
          return {
            content: textContent || "Let me process that request for you.",
            toolCalls,
          };
        }

        return textContent || "Sorry, I received an unexpected response format.";
      } catch (error: any) {
        lastError = error;

        // Check for quota/rate limit errors (429)
        const errorMessage = error?.message || "";
        if (
          error?.status === 429 ||
          errorMessage.includes("quota") ||
          errorMessage.includes("rate limit")
        ) {
          console.warn(`⚠ ${modelName} quota exceeded, falling back to mock mode`);
          // Don't try other models - they'll hit the same quota
          break;
        }

        // Model not found - try next model
        if (error?.status === 404 || errorMessage.includes("not found")) {
          logger.debug("Model not available, trying next", { model: modelName });
          continue;
        }

        // Other errors - don't try more models
        break;
      }
    }

    // All models failed - report to GitHub and fall back to mock
    const errorMessage = lastError?.message || String(lastError);
    const isQuotaError =
      lastError?.status === 429 ||
      errorMessage.includes("quota") ||
      errorMessage.includes("rate limit");

    if (isQuotaError) {
      console.warn(
        "⚠ Gemini API quota exceeded (20 requests/day on free tier), using demo mode responses"
      );
    } else {
      console.error("All Gemini models failed, falling back to mock responses:", lastError);

      // Report actual failures to GitHub (not quota issues)
      reportErrorToGitHub({
        error: lastError instanceof Error ? lastError : new Error(String(lastError)),
        errorStack: lastError instanceof Error ? lastError.stack : undefined,
        source: "api_error",
        context: {
          message: "All Gemini models failed to respond",
          attemptedModels: this.geminiModels,
          apiKeyConfigured: !!geminiApiKey,
        },
      })
        .then((result) => {
          if (result.success) {
            logger.info("Gemini failure reported to GitHub", { issueUrl: result.issueUrl });
          } else if (result.deduplicated) {
            logger.debug("Gemini failure already reported recently");
          } else if (result.rateLimited) {
            logger.warn("GitHub issue rate limit reached");
          }
        })
        .catch((err) => {
          logger.error("Failed to report Gemini issue to GitHub", err);
        });
    }

    logger.info("Using enhanced demo mode response system");

    // Extract system and user messages for mock (reuse existing variables from above)
    const mockResponse = this.getMockResponseWithActions(userMessage, systemPrompt);

    // Add quota message prefix if it's a quota error
    if (isQuotaError) {
      const prefix =
        "ℹ️ **Note:** Gemini API quota exceeded (free tier allows 20 requests/day). Using demo mode responses until quota resets.\n\n";
      if (typeof mockResponse === "string") {
        return prefix + mockResponse;
      } else {
        return {
          ...mockResponse,
          content: prefix + mockResponse.content,
        };
      }
    }

    return mockResponse;
  }

  private getMockResponseWithActions(
    userMessage: string,
    systemContext: string = ""
  ): string | { content: string; toolCalls?: any[] } {
    // IMPORTANT: Search only in the actual user message, not in system context/examples
    const msg = userMessage.toLowerCase();

    // Disclaimer for mock mode
    const mockDisclaimer =
      "_⚠️ AI assistant offline (daily quota reached). Using basic pattern matching instead._\n\n";

    logger.debug("Mock mode processing user message", {
      userMessagePreview: userMessage.substring(0, 100),
      systemContextLength: systemContext.length,
    });

    // Check for deployment requests like "deploy X to Y" or "can you deploy X to Y"
    // Use a regex that requires actual agent/tenant words, not "x to y" from examples
    const deployMatch = userMessage.match(
      /deploy\s+(?:the\s+)?([a-z0-9-\s]+?)(?:\s+to|\s+on)\s+([a-z0-9-\s]+)/i
    );
    logger.debug("Deploy regex match result", { matched: !!deployMatch });

    // Filter out matches that look like example text (single letters)
    if (deployMatch && deployMatch[1].trim().length > 1 && deployMatch[2].trim().length > 1) {
      const agentName = deployMatch[1].trim();
      const tenantName = deployMatch[2].trim();
      logger.debug("Extracted deployment request", { agentName, tenantName });

      // Map common agent names to their IDs (not display names!)
      const agentMap: { [key: string]: { id: string; name: string } } = {
        "customer service": { id: "CustomerServiceAgent", name: "Customer Service Agent" },
        customer: { id: "CustomerServiceAgent", name: "Customer Service Agent" },
        service: { id: "CustomerServiceAgent", name: "Customer Service Agent" },
        product: { id: "CustomerServiceAgent", name: "Customer Service Agent" }, // fallback
        "product agent": { id: "CustomerServiceAgent", name: "Customer Service Agent" },
        sales: { id: "SalesAssistant", name: "Sales Assistant Copilot" },
        "sales assistant": { id: "SalesAssistant", name: "Sales Assistant Copilot" },
        "sales copilot": { id: "SalesAssistant", name: "Sales Assistant Copilot" },
        hr: { id: "HROnboarding", name: "HR Onboarding Bot" },
        "hr onboarding": { id: "HROnboarding", name: "HR Onboarding Bot" },
        onboarding: { id: "HROnboarding", name: "HR Onboarding Bot" },
        it: { id: "ITHelpdesk", name: "IT Helpdesk Agent" },
        "it helpdesk": { id: "ITHelpdesk", name: "IT Helpdesk Agent" },
        helpdesk: { id: "ITHelpdesk", name: "IT Helpdesk Agent" },
      };

      // Map common tenant names
      const tenantMap: { [key: string]: { name: string; id: string } } = {
        contoso: { name: "Contoso Corporation", id: "11111111-1111-1111-1111-111111111111" },
        fabrikam: { name: "Fabrikam Inc", id: "22222222-2222-2222-2222-222222222222" },
        fabisco: { name: "Fabrikam Inc", id: "22222222-2222-2222-2222-222222222222" }, // common typo
        adventure: { name: "Adventure Works", id: "33333333-3333-3333-3333-333333333333" },
        northwind: { name: "Northwind Traders", id: "44444444-4444-4444-4444-444444444444" },
        woodgrove: { name: "Woodgrove Bank", id: "55555555-5555-5555-5555-555555555555" },
        woodward: { name: "Woodgrove Bank", id: "55555555-5555-5555-5555-555555555555" }, // common typo
        woodfard: { name: "Woodgrove Bank", id: "55555555-5555-5555-5555-555555555555" }, // common typo
        tailspin: { name: "Tailspin Toys", id: "66666666-6666-6666-6666-666666666666" },
        wingtip: { name: "Wingtip Toys", id: "77777777-7777-7777-7777-777777777777" },
        litware: { name: "Litware Inc", id: "88888888-8888-8888-8888-888888888888" },
        proseware: { name: "Proseware", id: "99999999-9999-9999-9999-999999999999" },
        coho: { name: "Coho Vineyard", id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
      };

      const matchedAgent = agentMap[agentName.toLowerCase()] || { id: agentName, name: agentName };
      const matchedTenant = tenantMap[tenantName.toLowerCase()] || {
        name: tenantName,
        id: "11111111-1111-1111-1111-111111111111",
      };

      logger.debug("Matched agent and tenant", {
        agentId: matchedAgent.id,
        agentName: matchedAgent.name,
        tenantId: matchedTenant.id,
        tenantName: matchedTenant.name,
      });

      const mockDeployResponse = {
        content: `${mockDisclaimer}I'll help you deploy **${matchedAgent.name}** to **${matchedTenant.name}**.\n\nThis will deploy the agent solution to the tenant's Dataverse environment. Click the button below to confirm and start the deployment.`,
        toolCalls: [
          {
            id: `mock-${Date.now()}`,
            name: "create_deployment",
            input: {
              agent_name: matchedAgent.id, // Use ID, not display name!
              tenant_identifiers: [matchedTenant.id],
            },
          },
        ],
      };

      logger.debug("Returning mock deployment response", {
        toolCallCount: mockDeployResponse.toolCalls.length,
      });
      return mockDeployResponse;
    }

    // Fall back to regular mock response for non-action queries
    return mockDisclaimer + this.getMockResponse(userMessage, systemContext);
  }

  private getMockResponse(userMessage: string, systemContext: string = ""): string {
    const msg = userMessage.toLowerCase();

    // Parse context for smarter responses
    const failedCount = this.extractNumber(systemContext, /Failed Deployments \((\d+)\)/) || 0;
    const activeCount = this.extractNumber(systemContext, /Active Deployments \((\d+)\)/) || 0;
    const versionDriftCount = this.extractNumber(systemContext, /Version Drift: (\d+)/) || 0;
    const dependencyIssuesCount =
      this.extractNumber(systemContext, /Dependency Issues: (\d+)/) || 0;
    const totalTenants = this.extractNumber(systemContext, /Total Tenants: (\d+)/) || 0;

    // Extract deployment IDs from context
    const failedDeploymentIds = this.extractDeploymentIds(systemContext, "Failed Deployments");
    const activeDeploymentIds = this.extractDeploymentIds(systemContext, "Active Deployments");

    // Query responses - handle various ways to ask about issues
    if (
      msg.includes("failed") ||
      msg.includes("failures") ||
      msg.includes("issue") ||
      msg.includes("problem") ||
      msg.includes("alert") ||
      msg.includes("wrong") ||
      /what.*\d+/.test(msg) || // "what are the 5 issues"
      /tell me about.*\d+/.test(msg)
    ) {
      // "tell me about the 5 alerts"
      if (failedCount === 0) {
        return `Good news! There are currently no failed deployments.

All recent deployments completed successfully.

Your system is running smoothly.`;
      }

      return `I found **${failedCount} failed deployment${failedCount !== 1 ? "s" : ""}**:
${failedDeploymentIds
  .slice(0, 3)
  .map(
    (id, i) => `
• **Deployment #${id}**
  Failed recently - click to view details and retry`
  )
  .join("\n")}

${failedCount > 3 ? `\n...and ${failedCount - 3} more. ` : ""}Would you like me to help investigate these failures?`;
    }

    if (msg.includes("version drift") || msg.includes("outdated")) {
      if (versionDriftCount === 0) {
        return `All tenants are running the expected agent versions. No version drift detected.`;
      }

      return `**${versionDriftCount} tenant${versionDriftCount !== 1 ? "s have" : " has"} version drift:**

These tenants are not running the expected agent version. This usually happens when:
• A deployment hasn't been rolled out to these tenants yet
• A manual update was made directly in the Dataverse environment
• The expected version in your configuration has changed

**Recommended action:** Deploy the latest agent version to bring these tenants up to date.`;
    }

    if (msg.includes("dependency") || msg.includes("dependencies") || msg.includes("missing")) {
      if (dependencyIssuesCount === 0) {
        return `All tenants have healthy dependencies. No missing connection references or environment variables detected.`;
      }

      return `**${dependencyIssuesCount} tenant${dependencyIssuesCount !== 1 ? "s have" : " has"} dependency issues:**

These tenants are missing required:
• Connection references (API connections)
• Environment variables
• Custom connectors

**Impact:** Agents may not function correctly without these dependencies.

**Recommended action:** Review the tenant health details and configure missing dependencies in each environment.`;
    }

    if (msg.includes("health") || msg.includes("status") || msg.includes("system")) {
      const issueCount = versionDriftCount + dependencyIssuesCount + failedCount;
      if (issueCount === 0) {
        return `**System Health: Excellent** ✅

• All ${totalTenants} tenants are healthy
• No version drift detected
• All dependencies configured
• No failed deployments

Your AgentSync deployment is running smoothly!`;
      }

      return `**System Health Summary:**

**Alerts:**
${versionDriftCount > 0 ? `• ${versionDriftCount} tenant${versionDriftCount !== 1 ? "s" : ""} with version drift ⚠️` : ""}
${dependencyIssuesCount > 0 ? `• ${dependencyIssuesCount} tenant${dependencyIssuesCount !== 1 ? "s" : ""} with missing dependencies 🔴` : ""}
${failedCount > 0 ? `• ${failedCount} failed deployment${failedCount !== 1 ? "s" : ""} 🔴` : ""}

**Activity:**
• ${activeCount} deployment${activeCount !== 1 ? "s" : ""} in progress
• ${totalTenants} total tenants

${issueCount > 0 ? `**Priority:** Address the ${issueCount} issue${issueCount !== 1 ? "s" : ""} above to maintain optimal operations.` : ""}`;
    }

    if (msg.includes("running") || msg.includes("active") || msg.includes("in progress")) {
      if (activeCount === 0) {
        return `There are currently no active deployments.

All recent deployments have completed. Ready to start a new deployment whenever you need!`;
      }

      return `I found **${activeCount} active deployment${activeCount !== 1 ? "s" : ""}**:
${activeDeploymentIds
  .slice(0, 3)
  .map(
    (id, i) => `
• **Deployment #${id}**
  Currently in progress...`
  )
  .join("\n")}

${activeCount > 3 ? `\n...and ${activeCount - 3} more.\n` : ""}All are progressing normally. You can monitor their progress on the deployments page.`;
    }

    // Agent queries - "which agents", "what agents", "list agents", "available agents"
    if (
      msg.includes("agent") &&
      (msg.includes("which") ||
        msg.includes("what") ||
        msg.includes("list") ||
        msg.includes("available") ||
        msg.includes("can") ||
        msg.includes("show"))
    ) {
      const agents = this.extractAgents(systemContext);
      if (agents.length === 0) {
        return `I don't see any agents listed in the current context. This might be because:
• The agents list hasn't loaded yet
• You need to configure agents in the system
• There's a connection issue with the agent catalog

Try navigating to the Agents page to see the full list of available solutions.`;
      }

      return `**Available agents you can deploy:**

${agents.map((a) => `• **${a.name}** (${a.id})`).join("\n")}

To deploy an agent, you can say something like:
_"Deploy ${agents[0].name} to [tenant name]"_

Or use the Deployments page to create a deployment with more options.`;
    }

    // Tenant queries - "which tenants", "what tenants", "list tenants"
    if (
      msg.includes("tenant") &&
      (msg.includes("which") ||
        msg.includes("what") ||
        msg.includes("list") ||
        msg.includes("available") ||
        msg.includes("can") ||
        msg.includes("show") ||
        msg.includes("how many"))
    ) {
      const tenants = this.extractTenants(systemContext);
      if (tenants.length === 0) {
        return `I don't see any tenants listed in the current context. This might be because:
• The tenants list hasn't loaded yet
• You need to configure tenants in the system
• There's a connection issue

Try navigating to the Tenants page to manage your Microsoft 365 tenant connections.`;
      }

      if (totalTenants > 0 && tenants.length < 5) {
        return `You have **${totalTenants} tenants** configured${tenants.length > 0 ? ` (showing ${tenants.length})` : ""}:

${tenants.map((t) => `• **${t.name}**`).join("\n")}

${totalTenants > tenants.length ? `\n...and ${totalTenants - tenants.length} more. ` : ""}You can deploy agents to any of these tenants.`;
      }

      return `You have **${totalTenants} Microsoft 365 tenants** connected to AgentSync.

You can deploy agents to any of these tenants using the Deployments page, or by asking me to deploy directly (e.g., "deploy FAQ bot to Contoso").`;
    }

    // "How do I" questions - provide helpful guidance
    if (msg.includes("how do i") || msg.includes("how to") || msg.includes("how can i")) {
      if (msg.includes("deploy") || msg.includes("deployment")) {
        return `To deploy an agent solution to your tenants:

**1. Go to the Deployments page** (or click "New Deployment" on the dashboard)

**2. Choose your deployment options:**
• Select which agent/solution to deploy
• Choose target tenants (or select all)
• Pick deployment strategy (all at once or phased rollout)

**3. Review and start** the deployment

**4. Monitor progress** on the deployments page - you'll see real-time status for each tenant

**Tips:**
• Start with a test tenant if it's a new agent
• Check tenant health before deploying (some may need dependencies configured)
• Failed deployments can be retried with one click

Want me to walk you through any specific step?`;
      }

      return `I'm here to help! I can guide you through:

• **Deploying agents** to multiple tenants
• **Managing tenants** and their health status
• **Troubleshooting failures** and fixing issues
• **Monitoring deployments** in real-time
• **Best practices** for multi-tenant management

What would you like to learn more about?`;
    }

    // Default fallback
    const hasIssues = failedCount > 0 || versionDriftCount > 0 || dependencyIssuesCount > 0;

    return `I didn't understand that query. **In basic mode, I can only handle:**

**✅ What I can do:**
• Deploy agents: _"deploy customer service to fabrikam"_
• Show failures: _"what failed?"_ or _"show failed deployments"_
• List agents: _"which agents?"_ or _"what can I deploy?"_
• List tenants: _"show tenants"_ or _"how many tenants?"_
• System status: _"health check"_ or _"system status"_
• Active work: _"what's running?"_ or _"show active deployments"_

${hasIssues ? `\n⚠️ **Heads up:** You have ${failedCount + versionDriftCount + dependencyIssuesCount} issue${failedCount + versionDriftCount + dependencyIssuesCount !== 1 ? "s" : ""} that need attention. Try asking "what failed?"` : ""}

_Tip: For complex questions, the AI assistant will be back tomorrow when the daily quota resets!_`;
  }

  // Helper method to extract numbers from context
  private extractNumber(text: string, pattern: RegExp): number | null {
    const match = text.match(pattern);
    return match ? parseInt(match[1], 10) : null;
  }

  // Helper method to extract deployment IDs from context
  private extractDeploymentIds(text: string, section: string): string[] {
    const ids: string[] = [];
    const sectionRegex = new RegExp(`${section}[^]*?(?=\\n\\n|$)`, "i");
    const sectionMatch = text.match(sectionRegex);

    if (sectionMatch) {
      const idMatches = sectionMatch[0].matchAll(/#([a-z0-9-]+):/gi);
      for (const match of idMatches) {
        ids.push(match[1]);
      }
    }

    return ids;
  }

  // Helper method to extract agents from context
  private extractAgents(text: string): Array<{ name: string; id: string }> {
    const agents: Array<{ name: string; id: string }> = [];
    const agentSectionRegex = /\*\*Available Agents:\*\*([^]*?)(?=\n\n\*\*|$)/i;
    const sectionMatch = text.match(agentSectionRegex);

    if (sectionMatch) {
      // Match patterns like "• Product Demo Agent (id: product-demo)"
      const agentMatches = sectionMatch[1].matchAll(/•\s+(.+?)\s+\(id:\s+([^\)]+)\)/gi);
      for (const match of agentMatches) {
        agents.push({
          name: match[1].trim(),
          id: match[2].trim(),
        });
      }
    }

    return agents;
  }

  // Helper method to extract tenants from context
  private extractTenants(text: string): Array<{ name: string; id?: string }> {
    const tenants: Array<{ name: string; id?: string }> = [];
    const tenantSectionRegex = /\*\*Available Tenants:\*\*([^]*?)(?=\n\n\*\*|$)/i;
    const sectionMatch = text.match(tenantSectionRegex);

    if (sectionMatch) {
      // Match patterns like "• Contoso Corporation (id: 11111111-1111-1111-1111-111111111111)"
      const tenantMatches = sectionMatch[1].matchAll(/•\s+(.+?)(?:\s+\(id:\s+([^\)]+)\))?$/gim);
      for (const match of tenantMatches) {
        tenants.push({
          name: match[1].trim(),
          id: match[2]?.trim(),
        });
      }
    }

    return tenants;
  }
}

// Singleton instance
let clientInstance: AnthropicClient | null = null;

export function getAnthropicClient(): AnthropicClient {
  if (!clientInstance) {
    clientInstance = new AnthropicClient();
  }
  return clientInstance;
}
