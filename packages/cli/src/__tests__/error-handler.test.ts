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
import {
  AuthError,
  GdapError,
  DataverseApiError,
  SolutionError,
  AgentResolutionError,
  ConfigValidationError,
  NetworkError,
  ErrorCode,
} from "@agentsync/core";

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
      expect(formatted.recovery.join(" ")).toContain("agentsync solutions list");
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
      expect(formatted.recovery.join(" ")).toContain("agentsync init");
    });

    it("should map legacy queue connection errors", () => {
      const error = new Error("Redis connection refused");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_QUEUE_CONNECTION");
      expect(formatted.message).toContain("open-source CLI");
      expect(formatted.recovery.join(" ")).toContain("agentsync deploy --direct");
      expect(formatted.recovery.join(" ")).not.toContain("--redis");
    });
    it("should handle generic errors", () => {
      const error = new Error("Some unexpected error");
      const formatted = formatError(error);

      expect(formatted.code).toBe("ERROR_UNKNOWN");
      expect(formatted.message).toBe("Some unexpected error");
      expect(formatted.causes).toContain("An unexpected error occurred");
      expect(formatted.recovery.join(" ")).toContain(
        "https://github.com/pax8labs/agentsync/issues"
      );
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
});
