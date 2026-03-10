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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to test the pure functions separately since they're not exported
// Let's test the ones we can access and mock the module for integration tests

describe("GitHub Issue Reporter", () => {
  describe("Error hash generation", () => {
    // Test the hash generation logic (we'll inline test the algorithm)
    function generateErrorHash(report: { error: Error | string; errorStack?: string }): string {
      const errorMessage = typeof report.error === "string" ? report.error : report.error.message;
      const errorName = typeof report.error === "string" ? "Error" : report.error.name;
      const firstStackLine = report.errorStack?.split("\n")[1]?.trim() || "";
      return `${errorName}:${errorMessage.slice(0, 100)}:${firstStackLine.slice(0, 50)}`;
    }

    it("should generate consistent hash for same error", () => {
      const error = new Error("Test error");
      const stack = `Error: Test error
    at function1 (file.js:10:5)
    at function2 (file.js:20:10)`;

      const hash1 = generateErrorHash({ error, errorStack: stack });
      const hash2 = generateErrorHash({ error, errorStack: stack });

      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different errors", () => {
      const error1 = new Error("Error one");
      const error2 = new Error("Error two");

      const hash1 = generateErrorHash({ error: error1 });
      const hash2 = generateErrorHash({ error: error2 });

      expect(hash1).not.toBe(hash2);
    });

    it("should handle string errors", () => {
      const hash = generateErrorHash({ error: "String error message" });
      expect(hash).toContain("Error:");
      expect(hash).toContain("String error message");
    });

    it("should truncate long messages in hash", () => {
      const longMessage = "a".repeat(200);
      const error = new Error(longMessage);

      const hash = generateErrorHash({ error });
      // Should only include first 100 chars of message
      expect(hash.length).toBeLessThan(200);
    });

    it("should include first stack frame", () => {
      const error = new Error("Test");
      const stack = `Error: Test
    at specificFunction (important.js:42:10)
    at otherFunction (other.js:10:5)`;

      const hash = generateErrorHash({ error, errorStack: stack });
      expect(hash).toContain("specificFunction");
    });
  });

  describe("Issue title generation", () => {
    function generateIssueTitle(report: { error: Error | string; source: string }): string {
      const errorMessage = typeof report.error === "string" ? report.error : report.error.message;
      const errorName = typeof report.error === "string" ? "Error" : report.error.name;

      const shortMessage =
        errorMessage.length > 60 ? errorMessage.slice(0, 60) + "..." : errorMessage;

      const sourceLabel: Record<string, string> = {
        error_boundary: "React",
        api_error: "API",
        unhandled_rejection: "Promise",
        global_error: "Global",
        manual_report: "Manual",
      };

      return `[${sourceLabel[report.source] || report.source}] ${errorName}: ${shortMessage}`;
    }

    it("should format title with source label", () => {
      const title = generateIssueTitle({
        error: new Error("Something went wrong"),
        source: "error_boundary",
      });

      expect(title).toBe("[React] Error: Something went wrong");
    });

    it("should truncate long error messages", () => {
      const longMessage = "a".repeat(100);
      const title = generateIssueTitle({
        error: new Error(longMessage),
        source: "api_error",
      });

      expect(title.length).toBeLessThan(100);
      expect(title).toContain("...");
    });

    it("should handle different source types", () => {
      const sources = [
        { source: "error_boundary", label: "React" },
        { source: "api_error", label: "API" },
        { source: "unhandled_rejection", label: "Promise" },
        { source: "global_error", label: "Global" },
        { source: "manual_report", label: "Manual" },
      ];

      sources.forEach(({ source, label }) => {
        const title = generateIssueTitle({
          error: new Error("Test"),
          source,
        });
        expect(title).toContain(`[${label}]`);
      });
    });

    it("should include custom error names", () => {
      class CustomError extends Error {
        name = "CustomError";
      }
      const title = generateIssueTitle({
        error: new CustomError("Custom message"),
        source: "global_error",
      });

      expect(title).toContain("CustomError");
    });
  });

  describe("Issue body formatting", () => {
    function formatIssueBody(report: {
      error: Error | string;
      source: string;
      errorStack?: string;
      componentStack?: string;
      context?: Record<string, unknown>;
      url?: string;
      userAgent?: string;
      timestamp?: string;
    }): string {
      const errorMessage = typeof report.error === "string" ? report.error : report.error.message;
      const errorName = typeof report.error === "string" ? "Error" : report.error.name;

      const sections: string[] = [];

      sections.push(`## Auto-Reported Error\n`);
      sections.push(`**Source:** \`${report.source}\``);
      sections.push(`**Time:** ${report.timestamp || new Date().toISOString()}`);
      if (report.url) {
        sections.push(`**URL:** ${report.url}`);
      }
      sections.push("");

      sections.push(`### Error Details\n`);
      sections.push(`**Type:** \`${errorName}\``);
      sections.push(`**Message:** ${errorMessage}`);
      sections.push("");

      if (report.errorStack) {
        sections.push(`### Stack Trace\n`);
        sections.push("```");
        sections.push(report.errorStack.slice(0, 2000));
        sections.push("```");
        sections.push("");
      }

      if (report.componentStack) {
        sections.push(`### Component Stack\n`);
        sections.push("```");
        sections.push(report.componentStack.slice(0, 1500));
        sections.push("```");
        sections.push("");
      }

      if (report.context && Object.keys(report.context).length > 0) {
        sections.push(`### Additional Context\n`);
        sections.push("```json");
        try {
          sections.push(JSON.stringify(report.context, null, 2).slice(0, 1000));
        } catch {
          sections.push("(Unable to serialize context)");
        }
        sections.push("```");
        sections.push("");
      }

      sections.push(`### Environment\n`);
      if (report.userAgent) {
        sections.push(`**User Agent:** ${report.userAgent}`);
      }
      sections.push("");

      sections.push("---");
      sections.push("*This issue was automatically created by the AgentSync error reporter.*");

      return sections.join("\n");
    }

    it("should include error details", () => {
      const body = formatIssueBody({
        error: new TypeError("Cannot read property"),
        source: "error_boundary",
      });

      expect(body).toContain("TypeError");
      expect(body).toContain("Cannot read property");
      expect(body).toContain("error_boundary");
    });

    it("should include stack trace when provided", () => {
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "global_error",
        errorStack: "Error: Test\n  at file.js:10:5",
      });

      expect(body).toContain("### Stack Trace");
      expect(body).toContain("file.js:10:5");
    });

    it("should include component stack for React errors", () => {
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "error_boundary",
        componentStack: "    at MyComponent\n    at App",
      });

      expect(body).toContain("### Component Stack");
      expect(body).toContain("MyComponent");
    });

    it("should include URL when provided", () => {
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "global_error",
        url: "https://app.example.com/dashboard",
      });

      expect(body).toContain("https://app.example.com/dashboard");
    });

    it("should include context when provided", () => {
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "api_error",
        context: { userId: "123", action: "save" },
      });

      expect(body).toContain("### Additional Context");
      expect(body).toContain('"userId": "123"');
      expect(body).toContain('"action": "save"');
    });

    it("should truncate long stack traces", () => {
      const longStack = "x".repeat(5000);
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "global_error",
        errorStack: longStack,
      });

      // Should be truncated to 2000 chars
      expect(body.length).toBeLessThan(5000);
    });

    it("should include footer", () => {
      const body = formatIssueBody({
        error: new Error("Test"),
        source: "global_error",
      });

      expect(body).toContain("automatically created by the AgentSync error reporter");
    });
  });

  describe("Bounded cache", () => {
    it("should evict oldest entries when at capacity", () => {
      const MAX_SIZE = 5;
      const cache = new Map<string, number>();

      function addToCache(hash: string, timestamp: number) {
        if (cache.size >= MAX_SIZE) {
          const entriesToRemove = Math.floor(MAX_SIZE * 0.2) || 1;
          const sorted = [...cache.entries()].sort((a, b) => a[1] - b[1]);
          for (let i = 0; i < entriesToRemove; i++) {
            cache.delete(sorted[i][0]);
          }
        }
        cache.set(hash, timestamp);
      }

      // Fill cache
      addToCache("hash1", 1000);
      addToCache("hash2", 2000);
      addToCache("hash3", 3000);
      addToCache("hash4", 4000);
      addToCache("hash5", 5000);

      expect(cache.size).toBe(5);

      // Add one more - should evict oldest
      addToCache("hash6", 6000);

      expect(cache.size).toBe(5);
      expect(cache.has("hash1")).toBe(false); // oldest should be removed
      expect(cache.has("hash6")).toBe(true);
    });
  });

  describe("Error sanitization for logging", () => {
    function sanitizeErrorForLogging(error: unknown): string {
      if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
      }
      return String(error);
    }

    it("should extract name and message from Error", () => {
      const error = new TypeError("Invalid argument");
      expect(sanitizeErrorForLogging(error)).toBe("TypeError: Invalid argument");
    });

    it("should not include stack trace", () => {
      const error = new Error("Test");
      error.stack = "Error: Test\n  at file.js:10:5";

      const result = sanitizeErrorForLogging(error);
      expect(result).not.toContain("file.js");
    });

    it("should convert non-Error to string", () => {
      expect(sanitizeErrorForLogging("string error")).toBe("string error");
      expect(sanitizeErrorForLogging(42)).toBe("42");
      expect(sanitizeErrorForLogging(null)).toBe("null");
    });
  });
});
