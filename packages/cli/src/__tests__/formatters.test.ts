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
import {
  formatTimeAgo,
  formatDuration,
  calculateDuration,
  formatStatus,
  truncate,
  truncateId,
  formatError,
} from "../lib/formatters.js";
import { stripAnsi } from "./test-utils.js";

describe("Formatters", () => {
  describe("formatTimeAgo", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "just now" for very recent times', () => {
      const now = new Date("2025-01-15T12:00:00Z");
      vi.setSystemTime(now);

      const result = formatTimeAgo("2025-01-15T12:00:00Z");
      expect(result).toBe("just now");
    });

    it("should return seconds for times less than a minute ago", () => {
      const now = new Date("2025-01-15T12:00:30Z");
      vi.setSystemTime(now);

      const result = formatTimeAgo("2025-01-15T12:00:00Z");
      expect(result).toBe("30s ago");
    });

    it("should return minutes for times less than an hour ago", () => {
      const now = new Date("2025-01-15T12:15:00Z");
      vi.setSystemTime(now);

      const result = formatTimeAgo("2025-01-15T12:00:00Z");
      expect(result).toBe("15m ago");
    });

    it("should return hours for times less than a day ago", () => {
      const now = new Date("2025-01-15T15:00:00Z");
      vi.setSystemTime(now);

      const result = formatTimeAgo("2025-01-15T12:00:00Z");
      expect(result).toBe("3h ago");
    });

    it("should return days for times more than a day ago", () => {
      const now = new Date("2025-01-17T12:00:00Z");
      vi.setSystemTime(now);

      const result = formatTimeAgo("2025-01-15T12:00:00Z");
      expect(result).toBe("2d ago");
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds for very short durations", () => {
      expect(formatDuration(100)).toBe("100ms");
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    it("should format seconds for durations less than a minute", () => {
      expect(formatDuration(1000)).toBe("1s");
      expect(formatDuration(5000)).toBe("5s");
      expect(formatDuration(30000)).toBe("30s");
      expect(formatDuration(59999)).toBe("60s");
    });

    it("should format minutes and seconds for longer durations", () => {
      expect(formatDuration(60000)).toBe("1m 0s");
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(180000)).toBe("3m 0s");
      expect(formatDuration(3661000)).toBe("61m 1s");
    });
  });

  describe("calculateDuration", () => {
    it('should return "-" when startedAt is undefined', () => {
      expect(calculateDuration(undefined)).toBe("-");
    });

    it("should calculate duration between start and end", () => {
      const result = calculateDuration("2025-01-15T12:00:00Z", "2025-01-15T12:01:30Z");
      expect(result).toBe("1m 30s");
    });

    it("should calculate duration from start to now when end is undefined", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15T12:02:00Z"));

      const result = calculateDuration("2025-01-15T12:00:00Z");
      expect(result).toBe("2m 0s");

      vi.useRealTimers();
    });
  });

  describe("formatStatus", () => {
    describe("default style", () => {
      it("should format completed status", () => {
        const result = stripAnsi(formatStatus("completed"));
        expect(result).toBe("✓ Completed");
      });

      it("should format failed status", () => {
        const result = stripAnsi(formatStatus("failed"));
        expect(result).toBe("✗ Failed");
      });

      it("should format in_progress status", () => {
        const result = stripAnsi(formatStatus("in_progress"));
        expect(result).toBe("● In Progress");
      });

      it("should format pending status", () => {
        const result = stripAnsi(formatStatus("pending"));
        expect(result).toBe("○ Pending");
      });

      it("should format scheduled status", () => {
        const result = stripAnsi(formatStatus("scheduled"));
        expect(result).toBe("◷ Scheduled");
      });

      it("should format awaiting_approval status", () => {
        const result = stripAnsi(formatStatus("awaiting_approval"));
        expect(result).toBe("⊙ Awaiting Approval");
      });

      it("should format approved status", () => {
        const result = stripAnsi(formatStatus("approved"));
        expect(result).toBe("✓ Approved");
      });

      it("should format rejected status", () => {
        const result = stripAnsi(formatStatus("rejected"));
        expect(result).toBe("✗ Rejected");
      });

      it("should format cancelled status", () => {
        const result = stripAnsi(formatStatus("cancelled"));
        expect(result).toBe("⊘ Cancelled");
      });

      it("should format rolling_back status", () => {
        const result = stripAnsi(formatStatus("rolling_back"));
        expect(result).toBe("↩ Rolling Back");
      });

      it("should format rolled_back status", () => {
        const result = stripAnsi(formatStatus("rolled_back"));
        expect(result).toBe("↩ Rolled Back");
      });

      it("should return unknown status as-is", () => {
        const result = stripAnsi(formatStatus("unknown_status"));
        expect(result).toBe("unknown_status");
      });
    });

    describe("shipping style", () => {
      it("should format completed as Delivered", () => {
        const result = stripAnsi(formatStatus("completed", "shipping"));
        expect(result).toBe("✓ Delivered");
      });

      it("should format failed as Failed", () => {
        const result = stripAnsi(formatStatus("failed", "shipping"));
        expect(result).toBe("✗ Failed");
      });

      it("should format in_progress as In Transit", () => {
        const result = stripAnsi(formatStatus("in_progress", "shipping"));
        expect(result).toBe("🚚 In Transit");
      });

      it("should format pending as Queued", () => {
        const result = stripAnsi(formatStatus("pending", "shipping"));
        expect(result).toBe("○ Queued");
      });

      it("should format scheduled", () => {
        const result = stripAnsi(formatStatus("scheduled", "shipping"));
        expect(result).toBe("◷ Scheduled");
      });

      it("should format awaiting_approval as Awaiting Clearance", () => {
        const result = stripAnsi(formatStatus("awaiting_approval", "shipping"));
        expect(result).toBe("⊙ Awaiting Clearance");
      });

      it("should format approved as Cleared", () => {
        const result = stripAnsi(formatStatus("approved", "shipping"));
        expect(result).toBe("✓ Cleared");
      });

      it("should format rejected", () => {
        const result = stripAnsi(formatStatus("rejected", "shipping"));
        expect(result).toBe("✗ Rejected");
      });

      it("should format cancelled", () => {
        const result = stripAnsi(formatStatus("cancelled", "shipping"));
        expect(result).toBe("⊘ Cancelled");
      });

      it("should format rolling_back as Returning", () => {
        const result = stripAnsi(formatStatus("rolling_back", "shipping"));
        expect(result).toBe("↩ Returning");
      });

      it("should format rolled_back as Returned", () => {
        const result = stripAnsi(formatStatus("rolled_back", "shipping"));
        expect(result).toBe("↩ Returned");
      });

      it("should return unknown status as-is", () => {
        const result = stripAnsi(formatStatus("unknown", "shipping"));
        expect(result).toBe("unknown");
      });
    });
  });

  describe("truncate", () => {
    it("should not truncate strings shorter than maxLength", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should not truncate strings equal to maxLength", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("should truncate strings longer than maxLength", () => {
      expect(truncate("hello world", 8)).toBe("hello...");
    });

    it("should handle very short maxLength", () => {
      expect(truncate("hello", 4)).toBe("h...");
    });
  });

  describe("truncateId", () => {
    it("should not truncate short IDs", () => {
      expect(truncateId("abc-123")).toBe("abc-123");
    });

    it("should truncate long IDs with default length", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(truncateId(uuid)).toBe("550e8400-e29b-4...");
    });

    it("should truncate with custom maxLength", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(truncateId(uuid, 8)).toBe("550e8400...");
    });

    it("should not truncate IDs equal to maxLength", () => {
      expect(truncateId("12345678", 8)).toBe("12345678");
    });
  });

  describe("formatError", () => {
    it("should format Error instances", () => {
      const error = new Error("Something went wrong");
      expect(formatError(error)).toBe("Something went wrong");
    });

    it("should return string errors as-is", () => {
      expect(formatError("String error")).toBe("String error");
    });

    it("should convert other types to string", () => {
      expect(formatError(42)).toBe("42");
      expect(formatError({ foo: "bar" })).toBe("[object Object]");
      expect(formatError(null)).toBe("null");
      expect(formatError(undefined)).toBe("undefined");
    });
  });
});
