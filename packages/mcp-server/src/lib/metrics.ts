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

import { logger } from "./logger.js";

/**
 * Performance metrics collector
 * Tracks request counts, durations, and error rates
 */

interface MetricData {
  count: number;
  totalDurationMs: number;
  errors: number;
  lastError?: string;
  lastErrorTime?: Date;
}

class MetricsCollector {
  private metrics: Map<string, MetricData> = new Map();
  private startTimes: Map<string, number> = new Map();

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, operation: string): void {
    this.startTimes.set(requestId, Date.now());

    // Initialize metric if it doesn't exist
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalDurationMs: 0,
        errors: 0,
      });
    }
  }

  /**
   * End tracking a successful request
   */
  endRequest(requestId: string, operation: string): void {
    const startTime = this.startTimes.get(requestId);
    if (!startTime) return;

    const durationMs = Date.now() - startTime;
    this.startTimes.delete(requestId);

    const metric = this.metrics.get(operation);
    if (metric) {
      metric.count++;
      metric.totalDurationMs += durationMs;

      logger.debug("Request completed", {
        operation,
        durationMs,
        avgDurationMs: Math.round(metric.totalDurationMs / metric.count),
      });
    }
  }

  /**
   * Record a failed request
   */
  recordError(requestId: string, operation: string, error: string): void {
    // Initialize metric if it doesn't exist
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, {
        count: 0,
        totalDurationMs: 0,
        errors: 0,
      });
    }

    const startTime = this.startTimes.get(requestId);
    if (startTime) {
      const durationMs = Date.now() - startTime;
      this.startTimes.delete(requestId);

      const metric = this.metrics.get(operation)!;
      metric.count++;
      metric.totalDurationMs += durationMs;
    }

    const metric = this.metrics.get(operation)!;
    metric.errors++;
    metric.lastError = error;
    metric.lastErrorTime = new Date();

    logger.warn("Request failed", {
      operation,
      error,
      errorRate: metric.count > 0 ? (metric.errors / metric.count) * 100 : 100,
    });
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(operation: string): MetricData | undefined {
    return this.metrics.get(operation);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, MetricData & { avgDurationMs: number; errorRate: number }> {
    const result: Record<string, MetricData & { avgDurationMs: number; errorRate: number }> = {};

    for (const [operation, metric] of this.metrics.entries()) {
      result[operation] = {
        ...metric,
        avgDurationMs: metric.count > 0 ? Math.round(metric.totalDurationMs / metric.count) : 0,
        errorRate: metric.count > 0 ? (metric.errors / metric.count) * 100 : 0,
      };
    }

    return result;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalRequests: number;
    totalErrors: number;
    overallErrorRate: number;
    operations: string[];
  } {
    let totalRequests = 0;
    let totalErrors = 0;

    for (const metric of this.metrics.values()) {
      totalRequests += metric.count;
      totalErrors += metric.errors;
    }

    return {
      totalRequests,
      totalErrors,
      overallErrorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      operations: Array.from(this.metrics.keys()),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.startTimes.clear();
    logger.info("Metrics reset");
  }

  /**
   * Log current metrics
   */
  logMetrics(): void {
    const summary = this.getSummary();
    const allMetrics = this.getAllMetrics();

    logger.info("Performance metrics", {
      summary,
      operations: allMetrics,
    });
  }
}

/**
 * Global metrics instance
 */
export const metrics = new MetricsCollector();

/**
 * Helper to track request execution
 */
export async function trackRequest<T>(
  operation: string,
  requestId: string,
  fn: () => Promise<T>
): Promise<T> {
  metrics.startRequest(requestId, operation);

  try {
    const result = await fn();
    metrics.endRequest(requestId, operation);
    return result;
  } catch (error) {
    metrics.recordError(
      requestId,
      operation,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}
