import { describe, it, expect, beforeEach, vi } from "vitest";
import { metrics, trackRequest } from "../../lib/metrics.js";

vi.mock("../../lib/logger.js");

describe("Metrics", () => {
  beforeEach(() => {
    metrics.reset();
  });

  describe("startRequest and endRequest", () => {
    it("should track successful request", () => {
      metrics.startRequest("req-1", "test_operation");
      metrics.endRequest("req-1", "test_operation");

      const metric = metrics.getMetrics("test_operation");
      expect(metric).toBeDefined();
      expect(metric?.count).toBe(1);
      expect(metric?.errors).toBe(0);
      expect(metric?.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should track multiple requests", () => {
      metrics.startRequest("req-1", "test_operation");
      metrics.endRequest("req-1", "test_operation");

      metrics.startRequest("req-2", "test_operation");
      metrics.endRequest("req-2", "test_operation");

      const metric = metrics.getMetrics("test_operation");
      expect(metric?.count).toBe(2);
      expect(metric?.errors).toBe(0);
    });

    it("should track different operations separately", () => {
      metrics.startRequest("req-1", "operation_a");
      metrics.endRequest("req-1", "operation_a");

      metrics.startRequest("req-2", "operation_b");
      metrics.endRequest("req-2", "operation_b");

      const metricA = metrics.getMetrics("operation_a");
      const metricB = metrics.getMetrics("operation_b");

      expect(metricA?.count).toBe(1);
      expect(metricB?.count).toBe(1);
    });
  });

  describe("recordError", () => {
    it("should track failed request", () => {
      metrics.startRequest("req-1", "test_operation");
      metrics.recordError("req-1", "test_operation", "Test error");

      const metric = metrics.getMetrics("test_operation");
      expect(metric?.count).toBe(1);
      expect(metric?.errors).toBe(1);
      expect(metric?.lastError).toBe("Test error");
      expect(metric?.lastErrorTime).toBeInstanceOf(Date);
    });

    it("should track error without prior startRequest", () => {
      metrics.recordError("req-1", "test_operation", "Test error");

      const metric = metrics.getMetrics("test_operation");
      expect(metric?.errors).toBe(1);
      expect(metric?.lastError).toBe("Test error");
    });

    it("should track multiple errors", () => {
      metrics.startRequest("req-1", "test_operation");
      metrics.recordError("req-1", "test_operation", "Error 1");

      metrics.startRequest("req-2", "test_operation");
      metrics.recordError("req-2", "test_operation", "Error 2");

      const metric = metrics.getMetrics("test_operation");
      expect(metric?.count).toBe(2);
      expect(metric?.errors).toBe(2);
      expect(metric?.lastError).toBe("Error 2");
    });
  });

  describe("getAllMetrics", () => {
    it("should return all metrics with calculated values", () => {
      metrics.startRequest("req-1", "op_a");
      metrics.endRequest("req-1", "op_a");

      metrics.startRequest("req-2", "op_b");
      metrics.recordError("req-2", "op_b", "Error");

      const allMetrics = metrics.getAllMetrics();

      expect(allMetrics).toHaveProperty("op_a");
      expect(allMetrics).toHaveProperty("op_b");
      expect(allMetrics.op_a.avgDurationMs).toBeGreaterThanOrEqual(0);
      expect(allMetrics.op_a.errorRate).toBe(0);
      expect(allMetrics.op_b.errorRate).toBe(100);
    });

    it("should return empty object when no metrics", () => {
      const allMetrics = metrics.getAllMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(0);
    });
  });

  describe("getSummary", () => {
    it("should return summary statistics", () => {
      metrics.startRequest("req-1", "op_a");
      metrics.endRequest("req-1", "op_a");

      metrics.startRequest("req-2", "op_a");
      metrics.recordError("req-2", "op_a", "Error");

      metrics.startRequest("req-3", "op_b");
      metrics.endRequest("req-3", "op_b");

      const summary = metrics.getSummary();

      expect(summary.totalRequests).toBe(3);
      expect(summary.totalErrors).toBe(1);
      expect(summary.overallErrorRate).toBeCloseTo(33.33, 1);
      expect(summary.operations).toContain("op_a");
      expect(summary.operations).toContain("op_b");
    });

    it("should handle zero requests", () => {
      const summary = metrics.getSummary();

      expect(summary.totalRequests).toBe(0);
      expect(summary.totalErrors).toBe(0);
      expect(summary.overallErrorRate).toBe(0);
      expect(summary.operations).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("should clear all metrics", () => {
      metrics.startRequest("req-1", "test_operation");
      metrics.endRequest("req-1", "test_operation");

      expect(metrics.getMetrics("test_operation")).toBeDefined();

      metrics.reset();

      expect(metrics.getMetrics("test_operation")).toBeUndefined();
    });
  });

  describe("trackRequest", () => {
    it("should track successful async operation", async () => {
      const result = await trackRequest("test_op", "req-1", async () => {
        return "success";
      });

      expect(result).toBe("success");

      const metric = metrics.getMetrics("test_op");
      expect(metric?.count).toBe(1);
      expect(metric?.errors).toBe(0);
    });

    it("should track failed async operation", async () => {
      await expect(
        trackRequest("test_op", "req-1", async () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");

      const metric = metrics.getMetrics("test_op");
      expect(metric?.errors).toBe(1);
      expect(metric?.lastError).toBe("Test error");
    });

    it("should track duration of async operation", async () => {
      await trackRequest("test_op", "req-1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "done";
      });

      const metric = metrics.getMetrics("test_op");
      expect(metric?.totalDurationMs).toBeGreaterThanOrEqual(10);
    });
  });

  describe("getMetrics", () => {
    it("should return undefined for non-existent operation", () => {
      const metric = metrics.getMetrics("non_existent");
      expect(metric).toBeUndefined();
    });

    it("should return metric data for existing operation", () => {
      metrics.startRequest("req-1", "test_op");
      metrics.endRequest("req-1", "test_op");

      const metric = metrics.getMetrics("test_op");
      expect(metric).toBeDefined();
      expect(metric).toHaveProperty("count");
      expect(metric).toHaveProperty("totalDurationMs");
      expect(metric).toHaveProperty("errors");
    });
  });

  describe("logMetrics", () => {
    it("should log metrics without errors", () => {
      metrics.startRequest("req-1", "test_op");
      metrics.endRequest("req-1", "test_op");

      // Should not throw
      expect(() => metrics.logMetrics()).not.toThrow();
    });
  });
});
