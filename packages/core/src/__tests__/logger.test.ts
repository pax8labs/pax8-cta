import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Logger,
  timedOperation,
  withTraceContext,
  withTraceContextAsync,
  configureLogging,
  resetLogging,
} from "../services/logger.js";
import type { LogTransport, LogEntry } from "../services/logger.js";
import * as loggerModule from "../services/logger.js";

describe("Logger", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, "log">>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("constructor", () => {
    it("should create a logger with default settings", () => {
      const logger = new Logger();
      logger.info("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should create a logger with custom service name", () => {
      const logger = new Logger({ service: "test-service" });
      logger.info("test message");

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain("test-service");
    });
  });

  describe("log levels", () => {
    it("should log debug messages when minLevel is debug", () => {
      const logger = new Logger({ minLevel: "debug" });
      logger.debug("debug message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should not log debug messages when minLevel is info", () => {
      const logger = new Logger({ minLevel: "info" });
      logger.debug("debug message");
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should log info messages", () => {
      const logger = new Logger({ minLevel: "info" });
      logger.info("info message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log warn messages", () => {
      const logger = new Logger({ minLevel: "info" });
      logger.warn("warn message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log error messages with error object", () => {
      const logger = new Logger({ minLevel: "info" });
      const error = new Error("test error");
      logger.error("error message", error);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("context", () => {
    it("should include context in log output", () => {
      const logger = new Logger({ minLevel: "info" });
      logger.info("test message", { key: "value" });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain("key");
      expect(logOutput).toContain("value");
    });

    it("should merge default context with call context", () => {
      const logger = new Logger({
        minLevel: "info",
        defaultContext: { default: "context" },
      });
      logger.info("test message", { extra: "data" });

      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain("default");
      expect(logOutput).toContain("extra");
    });
  });

  describe("child logger", () => {
    it("should create a child logger with inherited settings", () => {
      const parent = new Logger({ service: "parent", minLevel: "info" });
      const child = parent.child({ service: "child" });

      child.info("child message");
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain("child");
    });

    it("should merge parent context with child context", () => {
      const parent = new Logger({
        minLevel: "info",
        defaultContext: { parent: "value" },
      });
      const child = parent.child({ context: { child: "value" } });

      child.info("test");
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain("parent");
      expect(logOutput).toContain("child");
    });
  });

  describe("trace context with AsyncLocalStorage", () => {
    it("should include trace ID in logs when run with trace context", () => {
      const logger = new Logger({ minLevel: "info" });

      withTraceContext(() => {
        logger.info("test message");
      }, "abcd1234efgh5678");

      const logOutput = consoleSpy.mock.calls[0][0];
      // The console transport shows first 8 chars of trace ID
      expect(logOutput).toContain("abcd1234");
    });

    it("should isolate trace context between concurrent calls", async () => {
      const logger = new Logger({ minLevel: "info" });
      const capturedTraceIds: (string | undefined)[] = [];

      // Simulate concurrent requests with different trace IDs
      const req1 = withTraceContextAsync(async () => {
        await new Promise((r) => setTimeout(r, 10));
        capturedTraceIds.push(Logger.getTraceContext()?.traceId);
        logger.info("request 1");
      }, "trace-aaa");

      const req2 = withTraceContextAsync(async () => {
        capturedTraceIds.push(Logger.getTraceContext()?.traceId);
        logger.info("request 2");
      }, "trace-bbb");

      await Promise.all([req1, req2]);

      // Each request should have its own trace ID
      expect(capturedTraceIds).toContain("trace-aaa");
      expect(capturedTraceIds).toContain("trace-bbb");
    });

    it("should generate trace ID", () => {
      const traceId = Logger.generateTraceId();
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should generate span ID", () => {
      const spanId = Logger.generateSpanId();
      expect(spanId).toHaveLength(16);
    });

    it("should return undefined when no trace context is set", () => {
      expect(Logger.getTraceContext()).toBeUndefined();
    });

    it("should return trace context inside withTraceContext", () => {
      withTraceContext(() => {
        const ctx = Logger.getTraceContext();
        expect(ctx).toBeDefined();
        expect(ctx?.traceId).toBeDefined();
        expect(ctx?.spanId).toBeDefined();
      });
    });
  });
});

describe("timedOperation", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn<typeof console, "log">>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("should log start and completion of operation", async () => {
    const logger = new Logger({ minLevel: "debug" });

    const result = await timedOperation(logger, "test operation", async () => {
      return "result";
    });

    expect(result).toBe("result");
    expect(consoleSpy).toHaveBeenCalledTimes(2); // debug + info
  });

  it("should log error on failure", async () => {
    const logger = new Logger({ minLevel: "debug" });

    await expect(
      timedOperation(logger, "failing operation", async () => {
        throw new Error("test error");
      })
    ).rejects.toThrow("test error");

    expect(consoleSpy).toHaveBeenCalled();
  });

  it("should include duration in log", async () => {
    const logger = new Logger({ minLevel: "info" });

    await timedOperation(logger, "timed operation", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "done";
    });

    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain("durationMs");
  });
});

describe("withTraceContext helpers", () => {
  it("should auto-generate trace and span IDs when not provided", () => {
    let capturedCtx;
    withTraceContext(() => {
      capturedCtx = Logger.getTraceContext();
    });

    expect(capturedCtx).toBeDefined();
    expect((capturedCtx as { traceId?: string })?.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect((capturedCtx as { spanId?: string })?.spanId).toBeDefined();
  });

  it("async version should work correctly", async () => {
    let capturedCtx;
    await withTraceContextAsync(async () => {
      await new Promise((r) => setTimeout(r, 1));
      capturedCtx = Logger.getTraceContext();
    }, "my-trace");

    expect((capturedCtx as { traceId?: string })?.traceId).toBe("my-trace");
  });
});

describe("configureLogging / resetLogging", () => {
  afterEach(() => {
    resetLogging();
  });

  it("should replace singleton transports via configureLogging", () => {
    const entries: LogEntry[] = [];
    const capture: LogTransport = { log: (e) => entries.push(e) };

    configureLogging({ transports: [capture] });

    // ESM live bindings: loggerModule.coreLogger reflects the reassigned export
    loggerModule.coreLogger.info("hello from reconfigured logger");

    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("hello from reconfigured logger");
    expect(entries[0].service).toBe("core");
  });

  it("should allow setting a custom minLevel", () => {
    const entries: LogEntry[] = [];
    const capture: LogTransport = { log: (e) => entries.push(e) };

    configureLogging({ transports: [capture], minLevel: "error" });

    loggerModule.coreLogger.info("should be suppressed");
    loggerModule.coreLogger.error("should appear");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
  });

  it("resetLogging should restore default behaviour", () => {
    const entries: LogEntry[] = [];
    const capture: LogTransport = { log: (e) => entries.push(e) };

    configureLogging({ transports: [capture] });
    resetLogging();

    // After reset, the capture transport should no longer receive logs.
    // coreLogger is now a fresh Logger with the default ConsoleTransport.
    loggerModule.coreLogger.info("after reset");
    expect(entries).toHaveLength(0);
  });
});
