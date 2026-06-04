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

// Mock @pax8-cta/core
vi.mock("@pax8-cta/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pax8-cta/core")>();

  return {
    ...actual,
    loadConfig: vi.fn(),
    getClientSecret: vi.fn(),
    findTenant: vi.fn(),
    TokenManager: vi.fn(),
    DataverseClient: vi.fn(),
    SolutionOperations: vi.fn(),
  };
});

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner()),
}));

// Mock credentials
vi.mock("../lib/credentials.js", () => ({
  getClientSecretWithFallback: vi.fn().mockResolvedValue("test-secret"),
}));

describe("Import Command", () => {
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
  });

  afterEach(() => {
    consoleCapture.stop();
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe("required options", () => {
    it("should have --solution as optional flag (positional arg preferred)", async () => {
      const { importCommand } = await import("../commands/import.js");

      const solutionOption = importCommand.options.find((opt) => opt.long === "--solution");
      expect(solutionOption).toBeDefined();
    });

    it("should have --tenant as required option", async () => {
      const { importCommand } = await import("../commands/import.js");

      const tenantOption = importCommand.options.find((opt) => opt.long === "--tenant");
      expect(tenantOption).toBeDefined();
      expect(tenantOption?.required).toBe(true);
    });
  });

  describe("option aliases", () => {
    it('should have "import" as command name', async () => {
      const { importCommand } = await import("../commands/import.js");

      expect(importCommand.name()).toBe("import");
    });

    it("should accept --agentPackage as alias for --solution", async () => {
      const { importCommand } = await import("../commands/import.js");

      // Check that the option exists
      const solutionOption = importCommand.options.find((opt) => opt.long === "--solution");
      const agentPackageOption = importCommand.options.find((opt) => opt.long === "--agentPackage");

      expect(solutionOption).toBeDefined();
      expect(agentPackageOption).toBeDefined();
    });

    it("should accept --destination as alias for --tenant", async () => {
      const { importCommand } = await import("../commands/import.js");

      const tenantOption = importCommand.options.find((opt) => opt.long === "--tenant");
      const destinationOption = importCommand.options.find((opt) => opt.long === "--destination");

      expect(tenantOption).toBeDefined();
      expect(destinationOption).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should error when tenant not found in config", async () => {
      const { loadConfig, findTenant } = await import("@pax8-cta/core");

      vi.mocked(loadConfig).mockResolvedValue({
        version: "2.0",
        partner: { tenantId: "partner-id", clientId: "client-id" },
        source: { tenantId: "source-id", environmentUrl: "https://source.crm.dynamics.com" },
        tenants: [],
      } as any);

      vi.mocked(findTenant).mockReturnValue(undefined);

      const { importCommand } = await import("../commands/import.js");
      const program = new Command();
      program.addCommand(importCommand);

      // In non-TTY test environments the error handler emits JSON to process.stderr.write.
      // Intercept it so we can assert on the error payload.
      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = vi.fn((chunk: any) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      }) as any;

      try {
        await program.parseAsync([
          "node",
          "test",
          "import",
          "--solution",
          "./test.zip",
          "--tenant",
          "unknown-id",
        ]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      } finally {
        process.stderr.write = originalWrite;
      }

      // When piped (non-TTY), errors are emitted as JSON — verify the error is present
      const stderrOutput = stderrChunks.join("");
      const consoleOutput = consoleCapture.getAllOutput();
      const combinedOutput = stderrOutput + consoleOutput;
      expect(combinedOutput.length).toBeGreaterThan(0);
      // Either JSON error or human-readable text should mention the failure
      const hasJsonError = stderrOutput.includes('"error"');
      const hasTextError = containsText(consoleOutput, "not found in manifest");
      expect(hasJsonError || hasTextError).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("configuration", () => {
    it("should use default config path if not specified", async () => {
      const { loadConfig } = await import("@pax8-cta/core");

      vi.mocked(loadConfig).mockResolvedValue({
        version: "2.0",
        partner: { tenantId: "partner-id", clientId: "client-id" },
        source: { tenantId: "source-id", environmentUrl: "https://source.crm.dynamics.com" },
        tenants: [],
      } as any);

      const { importCommand } = await import("../commands/import.js");

      // Check default config option
      const configOption = importCommand.options.find((opt) => opt.long === "--config");
      expect(configOption?.defaultValue).toBe("./config/tenants.yaml");
    });

    it("should support custom config path", async () => {
      const { importCommand } = await import("../commands/import.js");

      const configOption = importCommand.options.find((opt) => opt.long === "--config");
      expect(configOption).toBeDefined();
    });
  });

  describe("import options", () => {
    it("should support --no-overwrite flag", async () => {
      const { importCommand } = await import("../commands/import.js");

      const overwriteOption = importCommand.options.find((opt) => opt.long === "--no-overwrite");
      expect(overwriteOption).toBeDefined();
    });

    it("should support --no-publish flag", async () => {
      const { importCommand } = await import("../commands/import.js");

      const publishOption = importCommand.options.find((opt) => opt.long === "--no-publish");
      expect(publishOption).toBeDefined();
    });
  });

  describe("command description", () => {
    it("should have appropriate description", async () => {
      const { importCommand } = await import("../commands/import.js");

      expect(importCommand.description()).toContain("solution");
      expect(importCommand.description()).toContain("tenant");
    });
  });

  describe("successful import", () => {
    it("should import solution successfully when all mocks resolve", async () => {
      const {
        loadConfig,
        getClientSecret,
        findTenant,
        TokenManager,
        DataverseClient,
        SolutionOperations,
      } = await import("@pax8-cta/core");

      // Mock config
      vi.mocked(loadConfig).mockResolvedValue({
        version: "2.0",
        partner: { tenantId: "partner-id", clientId: "client-id" },
        source: { tenantId: "source-id", environmentUrl: "https://source.crm.dynamics.com" },
        tenants: [
          {
            name: "Test Tenant",
            tenantId: "test-id",
            environmentUrl: "https://test.crm.dynamics.com",
            enabled: true,
          },
        ],
      } as any);

      // Mock tenant found
      vi.mocked(findTenant).mockReturnValue({
        name: "Test Tenant",
        tenantId: "test-id",
        environmentUrl: "https://test.crm.dynamics.com",
        enabled: true,
      } as any);

      // Mock client secret
      vi.mocked(getClientSecret).mockReturnValue("mock-secret");

      // Mock classes
      vi.mocked(TokenManager).mockImplementation(function () {
        return {} as any;
      });
      vi.mocked(DataverseClient).mockImplementation(function () {
        return {} as any;
      });

      const mockImportSolutionAsync = vi.fn().mockResolvedValue("job-123");
      const mockWaitForImport = vi.fn().mockResolvedValue({ success: true });

      vi.mocked(SolutionOperations).mockImplementation(function () {
        return {
          importSolutionAsync: mockImportSolutionAsync,
          waitForImport: mockWaitForImport,
        } as any;
      });

      const { importCommand } = await import("../commands/import.js");
      const program = new Command();
      program.addCommand(importCommand);

      await program.parseAsync([
        "node",
        "test",
        "import",
        "--solution",
        "./test.zip",
        "--tenant",
        "test-id",
      ]);

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "imported successfully")).toBe(true);
      expect(mockImportSolutionAsync).toHaveBeenCalled();
      expect(mockWaitForImport).toHaveBeenCalled();
    });

    it("should handle import failure", async () => {
      const {
        loadConfig,
        getClientSecret,
        findTenant,
        TokenManager,
        DataverseClient,
        SolutionOperations,
      } = await import("@pax8-cta/core");

      vi.mocked(loadConfig).mockResolvedValue({
        version: "2.0",
        partner: { tenantId: "partner-id", clientId: "client-id" },
        source: { tenantId: "source-id", environmentUrl: "https://source.crm.dynamics.com" },
        tenants: [],
      } as any);

      vi.mocked(findTenant).mockReturnValue({
        name: "Test Tenant",
        tenantId: "test-id",
        environmentUrl: "https://test.crm.dynamics.com",
        enabled: true,
      } as any);

      vi.mocked(getClientSecret).mockReturnValue("mock-secret");
      vi.mocked(TokenManager).mockImplementation(function () {
        return {} as any;
      });
      vi.mocked(DataverseClient).mockImplementation(function () {
        return {} as any;
      });

      const mockImportSolutionAsync = vi.fn().mockResolvedValue("job-123");
      const mockWaitForImport = vi
        .fn()
        .mockResolvedValue({ success: false, error: "Import failed" });

      vi.mocked(SolutionOperations).mockImplementation(function () {
        return {
          importSolutionAsync: mockImportSolutionAsync,
          waitForImport: mockWaitForImport,
        } as any;
      });

      const { importCommand } = await import("../commands/import.js");
      const program = new Command();
      program.addCommand(importCommand);

      try {
        await program.parseAsync([
          "node",
          "test",
          "import",
          "--solution",
          "./test.zip",
          "--tenant",
          "test-id",
        ]);
      } catch (error: any) {
        expect(error.message).toContain("process.exit(1)");
      }

      const output = consoleCapture.getAllOutput();
      expect(containsText(output, "Import failed")).toBe(true);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
