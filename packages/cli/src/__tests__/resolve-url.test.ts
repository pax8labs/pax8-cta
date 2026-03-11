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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import {
  ConsoleCapture,
  mockEnv,
  stripAnsi,
  containsText,
  mockSpinner,
  mockProcessExit,
} from "./test-utils.js";

// Mock @agentsync/core
const mockLoadConfig = vi.fn();
const mockGetClientSecret = vi.fn(() => "test-secret");
const mockTokenManager = vi.fn();
const mockDataverseClient = vi.fn();
const mockSolutionOperations = vi.fn();
const mockAgentResolver = vi.fn();

vi.mock("@agentsync/core", () => ({
  loadConfig: mockLoadConfig,
  getClientSecret: mockGetClientSecret,
  TokenManager: mockTokenManager,
  DataverseClient: mockDataverseClient,
  SolutionOperations: mockSolutionOperations,
  AgentResolver: mockAgentResolver,
}));

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

// Mock credentials
vi.mock("../lib/credentials.js", () => ({
  getClientSecretWithFallback: vi.fn().mockResolvedValue("test-secret"),
}));

describe("Resolve URL Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: any;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    restoreEnv = mockEnv({});
    exitSpy = mockProcessExit();

    // Reset modules
    vi.resetModules();
    vi.clearAllMocks();

    // Default mock config
    mockLoadConfig.mockResolvedValue({
      version: "2.0",
      partner: { tenantId: "partner-id", clientId: "client-id" },
      source: { tenantId: "source-id", environmentUrl: "https://source.crm.dynamics.com" },
      tenants: [],
    });

    // Default token manager mock
    mockTokenManager.mockReturnValue({});

    // Default dataverse client mock
    mockDataverseClient.mockReturnValue({});
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("required options", () => {
    it("should have --url as required option", async () => {
      const { resolveUrlCommand } = await import("../commands/resolve-url.js");

      const urlOption = resolveUrlCommand.options.find((opt) => opt.long === "--url");
      expect(urlOption).toBeDefined();
      expect(urlOption?.required).toBe(true);
    });
  });

  describe("list-bots mode", () => {
    it("should list all bots when --list-bots flag is used", async () => {
      // Mock AgentResolver
      const mockListBotsWithSolutions = vi.fn().mockResolvedValue([
        {
          bot: {
            botid: "12345678-1234-1234-1234-123456789012",
            name: "TestBot1",
            statecode: 0,
            modifiedon: "2024-01-15T10:00:00Z",
          },
          solution: {
            uniquename: "TestSolution1",
          },
        },
        {
          bot: {
            botid: "87654321-4321-4321-4321-210987654321",
            name: "TestBot2",
            statecode: 1,
            modifiedon: "2024-01-20T15:30:00Z",
          },
          solution: {
            uniquename: "TestSolution2",
          },
        },
      ]);

      mockAgentResolver.mockReturnValue({
        listBotsWithSolutions: mockListBotsWithSolutions,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://dummy.url",
        "--list-bots",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show loading messages
      expect(containsText(output, "Configuration loaded")).toBe(true);
      expect(containsText(output, "Connected to source environment")).toBe(true);
      expect(containsText(output, "Found 2 bot(s)")).toBe(true);

      // Should show bot table headers
      expect(containsText(cleanOutput, "Bot Name")).toBe(true);
      expect(containsText(cleanOutput, "Bot ID")).toBe(true);
      expect(containsText(cleanOutput, "Solution")).toBe(true);

      // Should show bot data
      expect(containsText(cleanOutput, "TestBot1")).toBe(true);
      expect(containsText(cleanOutput, "TestBot2")).toBe(true);
      expect(containsText(cleanOutput, "TestSolution1")).toBe(true);
      expect(containsText(cleanOutput, "TestSolution2")).toBe(true);

      // Should call listBotsWithSolutions
      expect(mockListBotsWithSolutions).toHaveBeenCalled();
    });

    it("should show status for active and inactive bots", async () => {
      mockAgentResolver.mockReturnValue({
        listBotsWithSolutions: vi.fn().mockResolvedValue([
          {
            bot: {
              botid: "12345678-1234-1234-1234-123456789012",
              name: "ActiveBot",
              statecode: 0, // Active
              modifiedon: "2024-01-15T10:00:00Z",
            },
            solution: { uniquename: "Solution1" },
          },
        ]),
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://dummy.url",
        "--list-bots",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      expect(containsText(cleanOutput, "Active")).toBe(true);
    });
  });

  describe("URL parsing and resolution", () => {
    it("should parse agent URL and show info", async () => {
      // Mock AgentResolver
      const mockParseAgentUrl = vi.fn().mockReturnValue({
        titleId: "test-title-id",
        prefix: "bot-",
        possibleBotId: "12345678-1234-1234-1234-123456789012",
      });

      const mockResolveUrlToSolution = vi.fn().mockResolvedValue({
        bot: {
          botid: "12345678-1234-1234-1234-123456789012",
          name: "TestAgent",
        },
        solution: {
          uniquename: "TestSolution",
          version: "1.0.0.0",
          ismanaged: true,
        },
      });

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      // Mock SolutionOperations
      const mockExportSolution = vi.fn().mockResolvedValue({
        friendlyName: "Test Solution",
        version: "1.0.0.0",
      });

      mockSolutionOperations.mockReturnValue({
        exportSolution: mockExportSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://m365.cloud.microsoft/chat/?titleId=test-title-id",
      ]);

      const output = consoleCapture.getAllOutput();
      const cleanOutput = stripAnsi(output);

      // Should show parsed URL info
      expect(containsText(cleanOutput, "Parsed URL Info")).toBe(true);
      expect(containsText(cleanOutput, "Title ID:")).toBe(true);
      expect(containsText(cleanOutput, "test-title-id")).toBe(true);

      // Should show resolved agent info
      expect(containsText(cleanOutput, "Resolved Agent")).toBe(true);
      expect(containsText(cleanOutput, "TestAgent")).toBe(true);
      expect(containsText(cleanOutput, "TestSolution")).toBe(true);

      // Should show export complete
      expect(containsText(cleanOutput, "Export Complete")).toBe(true);
    });

    it("should support --dry-run flag", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({
        titleId: "test-title-id",
        prefix: "bot-",
        possibleBotId: "12345678-1234-1234-1234-123456789012",
      });

      const mockResolveUrlToSolution = vi.fn();

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://m365.cloud.microsoft/chat/?titleId=test-title-id",
        "--dry-run",
      ]);

      const output = consoleCapture.getAllOutput();

      // Should parse URL
      expect(containsText(output, "URL parsed")).toBe(true);
      expect(containsText(output, "Parsed URL Info")).toBe(true);

      // Should show dry run message
      expect(containsText(output, "Dry run - not resolving or exporting")).toBe(true);

      // Should NOT resolve or export
      expect(mockResolveUrlToSolution).not.toHaveBeenCalled();
    });

    it("should export as managed solution by default", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({
        titleId: "test-title-id",
      });

      const mockResolveUrlToSolution = vi.fn().mockResolvedValue({
        bot: { botid: "12345678", name: "TestAgent" },
        solution: { uniquename: "TestSolution", version: "1.0.0.0", ismanaged: true },
      });

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const mockExportSolution = vi.fn().mockResolvedValue({
        friendlyName: "Test Solution",
        version: "1.0.0.0",
      });

      mockSolutionOperations.mockReturnValue({
        exportSolution: mockExportSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://m365.cloud.microsoft/chat/?titleId=test-title-id",
      ]);

      // Should export as managed
      expect(mockExportSolution).toHaveBeenCalledWith(
        "TestSolution",
        expect.objectContaining({ managed: true })
      );

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Type:      Managed")).toBe(true);
    });

    it("should export as unmanaged when --unmanaged flag is used", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({
        titleId: "test-title-id",
      });

      const mockResolveUrlToSolution = vi.fn().mockResolvedValue({
        bot: { botid: "12345678", name: "TestAgent" },
        solution: { uniquename: "TestSolution", version: "1.0.0.0", ismanaged: false },
      });

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const mockExportSolution = vi.fn().mockResolvedValue({
        friendlyName: "Test Solution",
        version: "1.0.0.0",
      });

      mockSolutionOperations.mockReturnValue({
        exportSolution: mockExportSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://m365.cloud.microsoft/chat/?titleId=test-title-id",
        "--unmanaged",
      ]);

      // Should export as unmanaged
      expect(mockExportSolution).toHaveBeenCalledWith(
        "TestSolution",
        expect.objectContaining({ managed: false })
      );

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Type:      Unmanaged")).toBe(true);
    });
  });

  describe("configuration options", () => {
    it("should use default output directory", async () => {
      const { resolveUrlCommand } = await import("../commands/resolve-url.js");

      const outputOption = resolveUrlCommand.options.find((opt) => opt.long === "--output");
      expect(outputOption?.defaultValue).toBe("./agent packages");
    });

    it("should use default config path", async () => {
      const { resolveUrlCommand } = await import("../commands/resolve-url.js");

      const configOption = resolveUrlCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should support custom output directory", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({ titleId: "test" });
      const mockResolveUrlToSolution = vi.fn().mockResolvedValue({
        bot: { botid: "12345678", name: "TestAgent" },
        solution: { uniquename: "TestSolution", version: "1.0.0.0", ismanaged: true },
      });

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const mockExportSolution = vi.fn().mockResolvedValue({
        friendlyName: "Test Solution",
        version: "1.0.0.0",
      });

      mockSolutionOperations.mockReturnValue({
        exportSolution: mockExportSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync([
        "node",
        "test",
        "resolve-url",
        "--url",
        "https://test.url",
        "--output",
        "./custom-output",
      ]);

      // Should use custom output path
      expect(mockExportSolution).toHaveBeenCalledWith(
        "TestSolution",
        expect.objectContaining({
          outputPath: expect.stringContaining("custom-output"),
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle config loading errors", async () => {
      mockLoadConfig.mockRejectedValue(new Error("Config not found"));

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      try {
        await program.parseAsync(["node", "test", "resolve-url", "--url", "https://test.url"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Failed")).toBe(true);
      expect(containsText(output, "Config not found")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should handle resolution errors", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({ titleId: "test" });
      const mockResolveUrlToSolution = vi
        .fn()
        .mockRejectedValue(new Error("Agent not found in environment"));

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      try {
        await program.parseAsync(["node", "test", "resolve-url", "--url", "https://test.url"]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Failed")).toBe(true);
      expect(containsText(output, "Agent not found")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { resolveUrlCommand } = await import("../commands/resolve-url.js");

      expect(resolveUrlCommand.description()).toContain("M365 agent URL");
      expect(resolveUrlCommand.description()).toContain("export");
    });
  });

  describe("output hints", () => {
    it("should show how to deploy exported solution", async () => {
      const mockParseAgentUrl = vi.fn().mockReturnValue({ titleId: "test" });
      const mockResolveUrlToSolution = vi.fn().mockResolvedValue({
        bot: { botid: "12345678", name: "TestAgent" },
        solution: { uniquename: "TestSolution", version: "1.0.0.0", ismanaged: true },
      });

      mockAgentResolver.mockReturnValue({
        parseAgentUrl: mockParseAgentUrl,
        resolveUrlToSolution: mockResolveUrlToSolution,
      });

      const mockExportSolution = vi.fn().mockResolvedValue({
        friendlyName: "Test Solution",
        version: "1.0.0.0",
      });

      mockSolutionOperations.mockReturnValue({
        exportSolution: mockExportSolution,
      });

      const { resolveUrlCommand } = await import("../commands/resolve-url.js");
      const program = new Command();
      program.addCommand(resolveUrlCommand);

      await program.parseAsync(["node", "test", "resolve-url", "--url", "https://test.url"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "agentsync ship")).toBe(true);
    });
  });
});
