/**
 * Copyright 2024 Pax8, Inc.
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
  containsText,
  mockSpinner,
  mockProcessExit,
} from "./test-utils.js";
import * as fs from "node:fs";

function normalizePathForAssert(pathValue: string): string {
  return pathValue.replace(/\\/g, "/");
}

function getConfigWriteCall(expectedPathSuffix = "config/tenants.yaml") {
  const calls = vi.mocked(fs.writeFileSync).mock.calls;
  const match = calls.find(([pathValue]) =>
    normalizePathForAssert(String(pathValue)).endsWith(expectedPathSuffix)
  );

  if (!match) {
    throw new Error(
      `Expected config write call ending with ${expectedPathSuffix} but saw: ${calls
        .map(([pathValue]) => normalizePathForAssert(String(pathValue)))
        .join(", ")}`
    );
  }

  return match;
}

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
}));

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

// Mock the shared input module (used by init instead of raw readline)
const mockQuestion = vi.fn();
const mockQuestionHidden = vi.fn();
vi.mock("../lib/input.js", () => ({
  question: (...args: unknown[]) => mockQuestion(...args),
  questionHidden: (...args: unknown[]) => {
    mockQuestionHidden(...args);
    return mockQuestion(...args);
  },
  closeInput: vi.fn(),
}));

// Mock demo config
vi.mock("../commands/demo.js", () => ({
  saveCliConfig: vi.fn(),
}));

// Mock credentials
vi.mock("../lib/credentials.js", () => ({
  getClientSecretWithFallback: vi.fn().mockRejectedValue(new Error("not found")),
}));

// Mock auth
vi.mock("../lib/auth.js", () => ({
  storeCredentials: vi.fn().mockRejectedValue(new Error("keytar not available")),
  interactiveLogin: vi.fn(),
}));

/**
 * Standard production-mode question sequence for init --no-gdap.
 * After the client secret, env discovery fails (mocked) and prompts
 * for a manual source URL, which we skip with "".
 */
function mockProductionFlow(
  overrides: {
    signIn?: string;
    tenantId?: string;
    clientId?: string;
    secret?: string;
    sourceEnv?: string;
    addTenant?: string;
    testCreds?: string;
  } = {}
) {
  const {
    signIn = "n",
    tenantId = "tid",
    clientId = "cid",
    secret = "secret",
    sourceEnv = "",
    addTenant = "n",
    testCreds = "n",
  } = overrides;

  mockQuestion
    .mockResolvedValueOnce(signIn) // sign in: no
    .mockResolvedValueOnce(tenantId) // tenant ID
    .mockResolvedValueOnce(clientId) // client ID
    .mockResolvedValueOnce(secret) // client secret
    .mockResolvedValueOnce(sourceEnv) // source env URL (skip)
    .mockResolvedValueOnce(addTenant) // add tenant manually
    .mockResolvedValueOnce(testCreds); // test credentials
}

describe("Init Command", () => {
  let consoleCapture: ConsoleCapture;
  let restoreEnv: () => void;
  let exitSpy: ReturnType<typeof mockProcessExit>;

  beforeEach(async () => {
    consoleCapture = new ConsoleCapture();
    consoleCapture.start();

    restoreEnv = mockEnv({});
    exitSpy = mockProcessExit();

    // Reset modules
    vi.resetModules();
    vi.clearAllMocks();

    // Default mock - directory doesn't exist
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("demo mode", () => {
    it("should enable demo mode with --demo flag", async () => {
      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--demo"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "AgentSync Setup Wizard")).toBe(true);
      expect(containsText(output, "Setting up in DEMO MODE")).toBe(true);
      expect(containsText(output, "Demo mode enabled")).toBe(true);
      expect(containsText(output, "Setup complete")).toBe(true);
    });

    it("should show next steps for demo mode", async () => {
      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--demo"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Try these commands")).toBe(true);
      expect(containsText(output, "agentsync tenants list")).toBe(true);
      expect(containsText(output, "agentsync demo off")).toBe(true);
    });

    it("should not prompt for credentials in demo mode", async () => {
      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--demo"]);

      expect(mockQuestion).not.toHaveBeenCalled();
    });
  });

  describe("existing config handling", () => {
    it("should ask to overwrite when config exists", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockQuestion.mockResolvedValueOnce("n"); // Don't overwrite

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Configuration already exists")).toBe(true);
      expect(containsText(output, "Setup cancelled")).toBe(true);
    });

    it("should preserve config when user declines overwrite", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      mockQuestion.mockResolvedValueOnce("n");

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init"]);

      // Should not write any files
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("should proceed when user confirms overwrite", async () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // config exists
        .mockReturnValue(false); // other paths

      mockQuestion.mockResolvedValueOnce("y"); // overwrite: yes

      // Then standard production flow
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      // Should have written config
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe("production mode", () => {
    it("should prompt for credentials in manual flow", async () => {
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "AgentSync Setup Wizard")).toBe(true);
      expect(containsText(output, "Partner Tenant ID")).toBe(true);
      expect(containsText(output, "App Registration Client ID")).toBe(true);
      expect(containsText(output, "Client Secret")).toBe(true);
    });

    it("should use hidden input for client secret entry", async () => {
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      expect(mockQuestionHidden).toHaveBeenCalledWith(expect.stringContaining("Secret Value"));
    });

    it("should create config file with entered credentials", async () => {
      mockProductionFlow({
        tenantId: "my-tenant-id-123",
        clientId: "my-client-id-456",
        secret: "my-secret",
      });

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      expect(fs.writeFileSync).toHaveBeenCalled();

      const writeCall = getConfigWriteCall();
      const configPath = writeCall[0] as string;
      const configContent = writeCall[1] as string;

      expect(normalizePathForAssert(configPath)).toContain("config/tenants.yaml");
      expect(configContent).toContain("my-tenant-id-123");
      expect(configContent).toContain("my-client-id-456");
      expect(configContent).toContain("AgentSync Configuration");
    });

    it("should include source environment in config when provided", async () => {
      mockProductionFlow({
        sourceEnv: "https://mydev.crm.dynamics.com",
      });

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const writeCall = getConfigWriteCall();
      const configContent = writeCall[1] as string;

      expect(configContent).toContain('environmentUrl: "https://mydev.crm.dynamics.com"');
      expect(configContent).not.toContain("# source:");
    });

    it("should comment out source when skipped", async () => {
      mockProductionFlow({ sourceEnv: "" });

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const writeCall = getConfigWriteCall();
      const configContent = writeCall[1] as string;

      expect(configContent).toContain("# source:");
    });

    it("should create config directory if missing", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("config"), {
        recursive: true,
      });
    });

    it("should use custom config path when specified", async () => {
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync([
        "node",
        "test",
        "init",
        "--config",
        "./custom/path.yaml",
        "--no-gdap",
      ]);

      const writeCall = getConfigWriteCall("custom/path.yaml");
      const configPath = writeCall[0] as string;

      expect(normalizePathForAssert(configPath)).toContain("custom/path.yaml");
    });

    it("should show setup complete after config creation", async () => {
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const output = consoleCapture.getAllOutput();

      expect(containsText(output, "Setup complete")).toBe(true);
      expect(containsText(output, "Next steps")).toBe(true);
    });

    it("should add manually entered tenant to config", async () => {
      mockQuestion
        .mockResolvedValueOnce("n") // sign in: no
        .mockResolvedValueOnce("tid") // tenant ID
        .mockResolvedValueOnce("cid") // client ID
        .mockResolvedValueOnce("secret") // client secret
        .mockResolvedValueOnce("") // source env: skip
        .mockResolvedValueOnce("y") // add tenant manually: yes
        .mockResolvedValueOnce("Contoso") // tenant name
        .mockResolvedValueOnce("contoso-tenant-id")
        .mockResolvedValueOnce("https://contoso.crm.dynamics.com")
        .mockResolvedValueOnce("n") // add another: no
        .mockResolvedValueOnce("n"); // test credentials: no

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const writeCall = getConfigWriteCall();
      const configContent = writeCall[1] as string;

      expect(configContent).toContain("contoso-tenant-id");
      expect(configContent).toContain("Contoso");
      expect(configContent).toContain("https://contoso.crm.dynamics.com");
    });

    it("should handle multiple manually added tenants", async () => {
      mockQuestion
        .mockResolvedValueOnce("n") // sign in: no
        .mockResolvedValueOnce("tid") // tenant ID
        .mockResolvedValueOnce("cid") // client ID
        .mockResolvedValueOnce("secret") // client secret
        .mockResolvedValueOnce("") // source env: skip
        .mockResolvedValueOnce("y") // add tenant: yes
        .mockResolvedValueOnce("Contoso")
        .mockResolvedValueOnce("contoso-tid")
        .mockResolvedValueOnce("https://contoso.crm.dynamics.com")
        .mockResolvedValueOnce("y") // add another: yes
        .mockResolvedValueOnce("Fabrikam")
        .mockResolvedValueOnce("fabrikam-tid")
        .mockResolvedValueOnce("https://fabrikam.crm.dynamics.com")
        .mockResolvedValueOnce("n") // add another: no
        .mockResolvedValueOnce("n"); // test credentials: no

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const writeCall = getConfigWriteCall();
      const configContent = writeCall[1] as string;

      expect(configContent).toContain("contoso-tid");
      expect(configContent).toContain("Contoso");
      expect(configContent).toContain("fabrikam-tid");
      expect(configContent).toContain("Fabrikam");
    });

    it("should show commented tenant placeholder when no tenants added", async () => {
      mockProductionFlow();

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      await program.parseAsync(["node", "test", "init", "--no-gdap"]);

      const writeCall = getConfigWriteCall();
      const configContent = writeCall[1] as string;

      expect(configContent).toContain("tenants: []");
    });
  });

  describe("configuration options", () => {
    it("should use default config path", async () => {
      const { initCommand } = await import("../commands/init.js");

      const configOption = initCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should support --demo flag", async () => {
      const { initCommand } = await import("../commands/init.js");

      const demoOption = initCommand.options.find((opt) => opt.long === "--demo");
      expect(demoOption).toBeDefined();
    });

    it("should support --no-gdap flag", async () => {
      const { initCommand } = await import("../commands/init.js");

      const gdapOption = initCommand.options.find((opt) => opt.long === "--no-gdap");
      expect(gdapOption).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle question errors gracefully", async () => {
      mockQuestion.mockRejectedValueOnce(new Error("Input error"));

      const { initCommand } = await import("../commands/init.js");
      const program = new Command();
      program.addCommand(initCommand);

      // In non-TTY test environments the error handler emits JSON to process.stderr.write.
      // Intercept it so we can assert on the presence of error output.
      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = vi.fn((chunk: any) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      }) as any;

      try {
        await program.parseAsync(["node", "test", "init"]);
      } catch {
        // Expected - process.exit throws
      } finally {
        process.stderr.write = originalWrite;
      }

      // Either JSON error payload or human-readable text — both are valid depending on TTY state.
      const stderrOutput = stderrChunks.join("");
      const consoleOutput = consoleCapture.getAllOutput();
      const hasJsonError = stderrOutput.includes('"error"');
      const hasTextError =
        containsText(consoleOutput, "Setup failed") || containsText(consoleOutput, "Input error");
      expect(hasJsonError || hasTextError).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { initCommand } = await import("../commands/init.js");

      expect(initCommand.description()).toContain("Initialize");
      expect(initCommand.description()).toContain("AgentSync");
    });
  });
});
