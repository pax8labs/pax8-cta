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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/api-middleware", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  chatRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/llm/anthropic-client", () => ({
  getAnthropicClient: vi.fn(() => ({
    chat: vi.fn(),
  })),
}));

vi.mock("@/lib/db", () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
    })),
  })),
}));

vi.mock("@agentsync/core", () => ({
  isDemoMode: vi.fn(() => false),
  DEMO_CONFIG: {},
  generateMockDeploymentHistory: vi.fn(() => []),
}));

vi.mock("@/lib/demo-store", () => ({
  demoDeployments: new Map(),
}));

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should require authentication", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");

    vi.mocked(requireAuth).mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any
    );

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("should enforce rate limiting", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit, createRateLimitResponse } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    });

    vi.mocked(createRateLimitResponse).mockReturnValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 }) as any
    );

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(vi.mocked(chatRateLimit)).toHaveBeenCalledWith(request, "user@example.com");
  });

  it("should require message in request body", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({}), // Missing message
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Message is required");
  });

  it("should validate message is a string", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: 123 }), // Invalid type
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("must be a string");
  });

  it("should accept valid chat message with history", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic-client");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const mockClient = {
      chat: vi.fn().mockResolvedValue("This is a test response"),
    };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as any);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "How do I deploy an agent?",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi! How can I help?" },
        ],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("response");
    expect(mockClient.chat).toHaveBeenCalled();
  });

  it("should include system context in LLM prompt", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic-client");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const mockClient = {
      chat: vi.fn().mockResolvedValue("Response"),
    };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as any);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "What deployments are active?" }),
    });

    await POST(request);

    // Verify chat was called with messages including system prompt
    expect(mockClient.chat).toHaveBeenCalled();
    const callArgs = mockClient.chat.mock.calls[0];
    const messages = callArgs[0];

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("AgentSync"),
        }),
      ])
    );
  });

  it("should handle LLM tool calls and convert to actions", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic-client");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "admin@example.com", roles: ["admin"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: "I can help deploy that agent.",
        toolCalls: [
          {
            id: "tool-1",
            name: "create_deployment",
            input: {
              agent_name: "TestAgent",
              tenant_identifiers: ["tenant-1", "tenant-2"],
            },
          },
        ],
      }),
    };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as any);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Deploy TestAgent to tenant-1 and tenant-2" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.response).toBe("I can help deploy that agent.");
    expect(data.actions).toBeDefined();
    expect(data.actions.length).toBeGreaterThan(0);
    expect(data.actions[0]).toHaveProperty("type", "deploy");
    expect(data.actions[0]).toHaveProperty("agentName", "TestAgent");
  });

  it("should handle empty history array", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic-client");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "user@example.com", roles: ["viewer"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const mockClient = {
      chat: vi.fn().mockResolvedValue("Hello! How can I help you?"),
    };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as any);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Hello",
        history: [],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockClient.chat).toHaveBeenCalled();
  });

  it("should include user role context in system prompt", async () => {
    const { requireAuth } = await import("@/lib/api-middleware");
    const { chatRateLimit } = await import("@/lib/rate-limit");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic-client");

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: "1", email: "deployer@example.com", roles: ["deployer"] },
    } as any);

    vi.mocked(chatRateLimit).mockResolvedValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 60000,
    });

    const mockClient = {
      chat: vi.fn().mockResolvedValue("Response"),
    };
    vi.mocked(getAnthropicClient).mockReturnValue(mockClient as any);

    const request = new NextRequest("http://localhost/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Test" }),
    });

    await POST(request);

    const callArgs = mockClient.chat.mock.calls[0];
    const messages = callArgs[0];
    const systemMessage = messages[0].content;

    expect(systemMessage).toContain("deployer@example.com");
    expect(systemMessage).toContain("deployer");
  });
});
