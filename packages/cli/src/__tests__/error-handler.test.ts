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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentSyncError, formatError, printError } from "../lib/error-handler.js";
import { handleCommandError, isJsonOutputMode, CliError, UsageError } from "../lib/errors.js";
import {
  AuthError,
  GdapError,
  DataverseApiError,
  SolutionError,
  AgentResolutionError,
  ConfigValidationError,
  NetworkError,
  ErrorCode,
} from "@pax8-cta/core";

describe("Error Handler", () => {
  describe("AgentSyncError", () => {
    it("should create error with all properties", () => {
      const error = new AgentSyncError(
        "TEST_ERROR",
        "Test error message",
        ["Cause 1", "Cause 2"],
        ["Step 1", "Step 2"],
        { environmentUrl: "https://test.crm.dynamics.com" }
      );

      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test error message");
      expect(error.causes).toEqual(["Cause 1", "Cause 2"]);
      expect(error.recovery).toEqual(["Step 1", "Step 2"]);
      expect(error.context?.environmentUrl).toBe("https://test.crm.dynamics.com");
      expect(error.name).toBe("AgentSyncError");
    });
  });

  describe("formatError - structured error codes (code path)", () => {
    it("should map GdapError with GDAP_APP_USER_NOT_REGISTERED", () => {
      const error = new GdapError(
        ErrorCode.GDAP_APP_USER_NOT_REGISTERED,
        "App user not registered",
        { clientId: "test-id", environmentUrl: "https://test.crm.dynamics.com" }
      );
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_GDAP_MISSING");
      expect(formatted.message).toContain("Application user not registered");
      expect(formatted.causes).toHaveLength(3);
      expect(formatted.recovery).toContain("Go to https://admin.powerplatform.microsoft.com");
      expect(formatted.context?.clientId).toBe("test-id");
      expect(formatted.context?.environmentUrl).toBe("https://test.crm.dynamics.com");
    });

    it("should map AuthError with AUTH_FAILED", () => {
      const error = new AuthError(ErrorCode.AUTH_FAILED, "Token acquisition failed", {
        clientId: "test-id",
      });
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_AUTH_FAILED");
      expect(formatted.message).toContain("Authentication failed");
      expect(formatted.causes).toContain("The client secret may have expired");
    });

    it("should map AuthError with AUTH_INVALID_SECRET", () => {
      const error = new AuthError(ErrorCode.AUTH_INVALID_SECRET, "Secret expired");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_AUTH_FAILED");
    });

    it("should map AuthError with AUTH_APP_NOT_FOUND", () => {
      const error = new AuthError(ErrorCode.AUTH_APP_NOT_FOUND, "App not found");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_AUTH_FAILED");
    });

    it("should map DataverseError with PERMISSION_PRIVILEGE_MISSING", () => {
      const error = new DataverseApiError(
        ErrorCode.PERMISSION_PRIVILEGE_MISSING,
        "prvRead missing",
        403,
        { clientId: "abc-123" }
      );
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_INSUFFICIENT_PERMISSIONS");
      expect(formatted.message).toContain("lacks required permissions");
      expect(formatted.context?.clientId).toBe("abc-123");
    });

    it("should map DataverseError with DATAVERSE_FORBIDDEN", () => {
      const error = new DataverseApiError(ErrorCode.DATAVERSE_FORBIDDEN, "Forbidden", 403);
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_INSUFFICIENT_PERMISSIONS");
    });

    it("should map DataverseError with DATAVERSE_UNAUTHORIZED", () => {
      const error = new DataverseApiError(ErrorCode.DATAVERSE_UNAUTHORIZED, "Unauthorized", 401);
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_AUTH_FAILED");
    });

    it("should map SolutionError with SOLUTION_NOT_FOUND", () => {
      const error = new SolutionError(ErrorCode.SOLUTION_NOT_FOUND, "Solution not found", {
        solutionName: "MyAgent",
      });
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_SOLUTION_NOT_FOUND");
      expect(formatted.message).toContain("not found");
      expect(formatted.context?.solutionName).toBe("MyAgent");
    });

    it("should map AgentResolutionError", () => {
      const error = new AgentResolutionError(
        ErrorCode.AGENT_RESOLUTION_FAILED,
        "Could not resolve"
      );
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_SOLUTION_NOT_FOUND");
      expect(formatted.message).toContain("resolve agent URL");
    });

    it("should map ConfigValidationError with CONFIG_NOT_FOUND", () => {
      const error = new ConfigValidationError(ErrorCode.CONFIG_NOT_FOUND, "Config not found");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_CONFIG_NOT_FOUND");
      expect(formatted.message).toContain("Configuration file");
    });

    it("should map NetworkError with NETWORK_CONNECTION_REFUSED", () => {
      const error = new NetworkError(ErrorCode.NETWORK_CONNECTION_REFUSED, "Connection refused", {
        environmentUrl: "https://test.crm.dynamics.com",
      });
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_NETWORK");
      expect(formatted.message).toContain("Network connection failed");
    });
  });

  describe("formatError - regex fallback (legacy path)", () => {
    it("should map GDAP missing errors", () => {
      const error = new Error(
        "user is not a member of the organization. Environment: https://test.crm.dynamics.com"
      );
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_GDAP_MISSING");
      expect(formatted.message).toContain("Application user not registered");
      expect(formatted.causes).toHaveLength(3);
      expect(formatted.recovery).toContain("Go to https://admin.powerplatform.microsoft.com");
      expect(formatted.context?.environmentUrl).toBe("https://test.crm.dynamics.com");
    });

    it("should map permission errors with prvRead", () => {
      const error = new Error("prvRead privilege required");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_INSUFFICIENT_PERMISSIONS");
      expect(formatted.message).toContain("lacks required permissions");
      expect(formatted.causes.length).toBeGreaterThan(0);
      expect(formatted.recovery).toContain("Go to https://admin.powerplatform.microsoft.com");
    });

    it("should map 403 forbidden errors", () => {
      const error = new Error("403 Forbidden - access denied");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_INSUFFICIENT_PERMISSIONS");
      expect(formatted.message).toContain("lacks required permissions");
    });

    it("should map 401 unauthorized errors", () => {
      const error = new Error("401 Unauthorized");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_AUTH_FAILED");
      expect(formatted.message).toContain("Authentication failed");
      expect(formatted.causes).toContain("The client secret may have expired");
      expect(formatted.recovery).toContain("Verify the app registration in Azure Portal:");
    });

    it("should map solution not found errors", () => {
      const error = new Error("Solution 'MyAgent' not found in environment");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_SOLUTION_NOT_FOUND");
      expect(formatted.message).toContain("not found");
      expect(formatted.context?.solutionName).toBe("MyAgent");
      expect(formatted.recovery.join(" ")).toContain("solutions list");
    });

    it("should map network errors - ECONNREFUSED", () => {
      const error = new Error("ECONNREFUSED - Connection refused to https://test.crm.dynamics.com");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_NETWORK");
      expect(formatted.message).toContain("Network connection failed");
      expect(formatted.causes).toContain(
        "The target environment URL may be incorrect or unreachable"
      );
    });

    it("should map network errors - ETIMEDOUT", () => {
      const error = new Error("ETIMEDOUT - Connection timed out");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_NETWORK");
    });

    it("should map config not found errors", () => {
      const error = new Error("Config file not found: /path/to/config.yaml");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_CONFIG_NOT_FOUND");
      expect(formatted.message).toContain("Configuration file");
      expect(formatted.recovery.join(" ")).toContain("  init");
    });

    it("should map legacy queue connection errors", () => {
      const error = new Error("Redis connection refused");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_QUEUE_CONNECTION");
      expect(formatted.message).toContain("open-source CLI");
      expect(formatted.recovery.join(" ")).toContain("deploy --direct");
      expect(formatted.recovery.join(" ")).not.toContain("--redis");
    });
    it("should handle generic errors", () => {
      const error = new Error("Some unexpected error");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_UNKNOWN");
      expect(formatted.message).toBe("Some unexpected error");
      expect(formatted.causes).toContain("An unexpected error occurred");
      expect(formatted.recovery.join(" ")).toContain("https://github.com/pax8labs/pax8-cta/issues");
    });

    it("should handle non-Error objects", () => {
      const formatted = formatError("String error");

      expect(formatted.code).toBe("ERROR_UNKNOWN");
      expect(formatted.message).toBe("String error");
    });

    it("should extract client ID from error message", () => {
      const error = new Error(
        "Authentication failed. Client ID: 12345678-1234-1234-1234-123456789abc"
      );
      const formatted = formatError(error);

      expect(formatted.context?.clientId).toBe("12345678-1234-1234-1234-123456789abc");
    });
  });

  describe("printError", () => {
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("should print formatted error with all sections", () => {
      const error = new AgentSyncError(
        "TEST_ERROR",
        "Test error message",
        ["Cause 1", "Cause 2"],
        ["Step 1", "Step 2"],
        {
          environmentUrl: "https://test.crm.dynamics.com",
          tenantName: "Test Tenant",
          clientId: "test-client-id",
        }
      );

      printError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();

      // Verify error message and code are printed
      const calls = consoleErrorSpy.mock.calls.flat();
      const output = calls.join(" ");
      expect(output).toContain("Test error message");
      expect(output).toContain("TEST_ERROR");
      expect(output).toContain("Possible causes:");
      expect(output).toContain("Cause 1");
      expect(output).toContain("Cause 2");
      expect(output).toContain("To fix:");
      expect(output).toContain("Step 1");
      expect(output).toContain("Step 2");
      expect(output).toContain("Context:");
      expect(output).toContain("https://test.crm.dynamics.com");
      expect(output).toContain("Test Tenant");
      expect(output).toContain("test-client-id");
    });

    it("should handle recovery steps with sub-steps", () => {
      const error = new AgentSyncError(
        "TEST_ERROR",
        "Test",
        ["Cause"],
        ["Main step", "  Sub-step 1", "  Sub-step 2", "Another main step"]
      );

      printError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls.flat();
      const output = calls.join(" ");
      expect(output).toContain("Main step");
      expect(output).toContain("Sub-step 1");
    });

    it("should not print context section if empty", () => {
      const error = new AgentSyncError("TEST_ERROR", "Test error", ["Cause"], ["Step"]);

      printError(error);

      const calls = consoleErrorSpy.mock.calls.flat();
      const output = calls.join(" ");
      expect(output).not.toContain("Context:");
    });
  });

  // ---------------------------------------------------------------------------
  // isJsonOutputMode
  // ---------------------------------------------------------------------------

  describe("isJsonOutputMode", () => {
    const originalArgv = process.argv;
    const originalIsTTY = process.stdout.isTTY;

    afterEach(() => {
      process.argv = originalArgv;
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    it("returns true when --json is in argv", () => {
      process.argv = ["node", "pax8-cta", "tenants", "list", "--json"];
      expect(isJsonOutputMode()).toBe(true);
    });

    it("returns true when stdout is not a TTY (piped)", () => {
      process.argv = ["node", "pax8-cta", "tenants", "list"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      expect(isJsonOutputMode()).toBe(true);
    });

    it("returns false when no --json and stdout is a TTY", () => {
      process.argv = ["node", "pax8-cta", "tenants", "list"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });
      expect(isJsonOutputMode()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // handleCommandError — JSON mode output shape
  // ---------------------------------------------------------------------------

  describe("handleCommandError JSON mode", () => {
    let stderrChunks: string[];
    let originalWrite: typeof process.stderr.write;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let originalArgv: string[];
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalArgv = process.argv;
      originalIsTTY = process.stdout.isTTY;

      // Force JSON mode via --json argv
      process.argv = ["node", "pax8-cta", "tenants", "list", "--json"];

      stderrChunks = [];
      originalWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = vi.fn((chunk: any) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      }) as any;

      exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: any) => {
        throw new Error("process.exit called");
      }) as any;
    });

    afterEach(() => {
      process.argv = originalArgv;
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      process.stderr.write = originalWrite;
      exitSpy.mockRestore();
    });

    function capturedJson(): unknown {
      const raw = stderrChunks.join("");
      return JSON.parse(raw.trim());
    }

    it("emits JSON with code/message/causes/recovery for a ConfigValidationError", () => {
      const coreErr = new ConfigValidationError(
        ErrorCode.CONFIG_NOT_FOUND,
        "tenants.yaml not found"
      );

      expect(() => handleCommandError(coreErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload).toHaveProperty("error");
      expect(payload.error.code).toBe("ERROR_CONFIG_NOT_FOUND");
      expect(typeof payload.error.message).toBe("string");
      expect(Array.isArray(payload.error.causes)).toBe(true);
      expect(payload.error.causes.length).toBeGreaterThan(0);
      expect(Array.isArray(payload.error.recovery)).toBe(true);
      expect(payload.error.recovery.length).toBeGreaterThan(0);
      // No stack traces — stack frames look like "    at Object.<anonymous> (file:..."
      expect(JSON.stringify(payload)).not.toMatch(/at Object\.|at new |at async /);
    });

    it("emits JSON for a GdapError", () => {
      const coreErr = new GdapError(ErrorCode.GDAP_MISSING, "GDAP inactive", {
        tenantName: "Contoso",
        clientId: "abc-123",
      });

      expect(() => handleCommandError(coreErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload.error.code).toBe("ERROR_GDAP_MISSING");
      expect(payload.error.causes).toBeDefined();
      expect(payload.error.recovery).toBeDefined();
    });

    it("emits JSON for an AuthError", () => {
      const coreErr = new AuthError(ErrorCode.AUTH_TOKEN_EXPIRED, "Token expired");

      expect(() => handleCommandError(coreErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload.error.code).toBe("ERROR_AUTH_FAILED");
    });

    it("emits JSON for a NetworkError", () => {
      const coreErr = new NetworkError(ErrorCode.NETWORK_TIMEOUT, "Timed out", {
        environmentUrl: "https://contoso.crm.dynamics.com",
      });

      expect(() => handleCommandError(coreErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload.error.code).toBe("ERROR_NETWORK");
      expect(payload.error.context?.environmentUrl).toBe("https://contoso.crm.dynamics.com");
    });

    it("emits JSON for a SolutionError with context", () => {
      const coreErr = new SolutionError(ErrorCode.SOLUTION_NOT_FOUND, "Solution missing", {
        solutionName: "MyCopilot",
      });

      expect(() => handleCommandError(coreErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload.error.code).toBe("ERROR_SOLUTION_NOT_FOUND");
      expect(payload.error.context?.solutionName).toBe("MyCopilot");
    });

    it("emits JSON for a plain Error (fallback shape)", () => {
      const err = new Error("Something went wrong unexpectedly");

      expect(() => handleCommandError(err)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload).toHaveProperty("error");
      // plain Error falls through to formatError which sets code + message
      expect(typeof payload.error.message).toBe("string");
      // Must not include stack traces — stack frames look like "    at Object.<anonymous> (file:..."
      expect(JSON.stringify(payload)).not.toMatch(/at Object\.|at new |at async /);
    });

    it("emits JSON for a ZodError (duck-typed)", () => {
      // Construct a ZodError-shaped object without importing zod directly,
      // since zod is not a direct CLI dependency.
      const zodLikeErr = Object.assign(new Error("Validation failed"), {
        name: "ZodError",
        errors: [
          { path: ["tenantId"], message: "Required" },
          { path: ["environmentUrl"], message: "Invalid url" },
        ],
      });

      expect(() => handleCommandError(zodLikeErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload.error.code).toBe("ERROR_VALIDATION");
      expect(Array.isArray(payload.error.causes)).toBe(true);
      expect(payload.error.causes).toContain("tenantId: Required");
    });

    it("emits JSON for a CliError and exits with its exitCode", () => {
      const cliErr = new CliError("Config path is wrong", 1);

      expect(() => handleCommandError(cliErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload).toHaveProperty("error");
      expect(typeof payload.error.message).toBe("string");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("emits JSON for a UsageError and exits with code 2", () => {
      const usageErr = new UsageError("Missing required --solution flag");

      expect(() => handleCommandError(usageErr)).toThrow("process.exit called");

      const payload = capturedJson() as any;
      expect(payload).toHaveProperty("error");
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("emits valid JSON (parseable without error)", () => {
      const err = new Error("any error");
      expect(() => handleCommandError(err)).toThrow("process.exit called");

      expect(() => capturedJson()).not.toThrow();
    });
  });
});
