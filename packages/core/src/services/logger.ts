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

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  traceId?: string;
  spanId?: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogTransport {
  log(entry: LogEntry): void;
}

/** Trace context stored in AsyncLocalStorage */
interface TraceContext {
  traceId: string;
  spanId?: string;
}

/**
 * AsyncLocalStorage for trace context.
 * This ensures each async context (e.g., HTTP request) has its own trace IDs
 * without leaking between concurrent requests.
 */
const traceStorage = new AsyncLocalStorage<TraceContext>();

// Console transport with JSON output for production
class ConsoleTransport implements LogTransport {
  private structured: boolean;
  private colors: boolean;

  constructor(options?: { structured?: boolean; colors?: boolean }) {
    this.structured = options?.structured ?? process.env.NODE_ENV === "production";
    this.colors = options?.colors ?? process.env.NODE_ENV !== "production";
  }

  log(entry: LogEntry): void {
    if (this.structured) {
      console.log(JSON.stringify(entry));
    } else {
      const levelColors: Record<LogLevel, string> = {
        debug: "\x1b[90m",
        info: "\x1b[32m",
        warn: "\x1b[33m",
        error: "\x1b[31m",
      };
      const reset = "\x1b[0m";
      const color = this.colors ? levelColors[entry.level] : "";
      const resetCode = this.colors ? reset : "";

      let output = `${entry.timestamp} ${color}${entry.level.toUpperCase().padEnd(5)}${resetCode}`;
      if (entry.service) {
        output += ` [${entry.service}]`;
      }
      if (entry.traceId) {
        output += ` [${entry.traceId.slice(0, 8)}]`;
      }
      output += ` ${entry.message}`;

      if (entry.context && Object.keys(entry.context).length > 0) {
        output += ` ${JSON.stringify(entry.context)}`;
      }

      if (entry.error) {
        output += `\n  Error: ${entry.error.message}`;
        if (entry.error.stack) {
          output += `\n${entry.error.stack}`;
        }
      }

      console.log(output);
    }
  }
}

export class Logger {
  private service?: string;
  private transports: LogTransport[] = [];
  private minLevel: LogLevel;
  private defaultContext: LogContext = {};

  private static levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options?: {
    service?: string;
    transports?: LogTransport[];
    minLevel?: LogLevel;
    defaultContext?: LogContext;
  }) {
    this.service = options?.service;
    this.transports = options?.transports ?? [new ConsoleTransport()];
    this.minLevel = options?.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.defaultContext = options?.defaultContext ?? {};
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.levelOrder[level] >= Logger.levelOrder[this.minLevel];
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    // Get trace context from AsyncLocalStorage
    const traceCtx = traceStorage.getStore();

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      traceId: traceCtx?.traceId,
      spanId: traceCtx?.spanId,
      context: { ...this.defaultContext, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, message, context, error);
    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log("warn", message, context, error);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log("error", message, context, error);
  }

  child(options: { service?: string; context?: LogContext }): Logger {
    return new Logger({
      service: options.service ?? this.service,
      transports: this.transports,
      minLevel: this.minLevel,
      defaultContext: { ...this.defaultContext, ...options.context },
    });
  }

  /**
   * Run a function with trace context.
   * All logs within the callback (and any async operations it spawns)
   * will automatically include the traceId and spanId.
   */
  static runWithTrace<T>(traceId: string, spanId: string | undefined, fn: () => T): T {
    return traceStorage.run({ traceId, spanId }, fn);
  }

  /**
   * Run an async function with trace context.
   */
  static async runWithTraceAsync<T>(
    traceId: string,
    spanId: string | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    return traceStorage.run({ traceId, spanId }, fn);
  }

  /**
   * Get the current trace context (if any).
   */
  static getTraceContext(): TraceContext | undefined {
    return traceStorage.getStore();
  }

  /**
   * Generate a new trace ID.
   */
  static generateTraceId(): string {
    return randomUUID().replace(/-/g, "");
  }

  /**
   * Generate a new span ID.
   */
  static generateSpanId(): string {
    return randomUUID().slice(0, 16);
  }
}

// Pre-configured loggers for different services.
// These are mutable so they can be reconfigured via configureLogging().
export let coreLogger = new Logger({ service: "core" });
export let authLogger = new Logger({ service: "auth" });
export let deploymentLogger = new Logger({ service: "deployment" });
export let workerLogger = new Logger({ service: "worker" });
export let apiLogger = new Logger({ service: "api" });

/**
 * Reconfigure the singleton loggers at runtime.
 * Useful for testing (e.g., swapping in a silent transport) or changing
 * log levels / transports without vi.mock().
 *
 * Only the keys you provide are replaced; the rest keep their current value.
 *
 * @example
 * // Silence all loggers in tests
 * const noop: LogTransport = { log: () => {} };
 * configureLogging({ transports: [noop] });
 *
 * // Restore defaults after tests
 * resetLogging();
 */
export function configureLogging(
  options: {
    transports?: LogTransport[];
    minLevel?: LogLevel;
  } = {}
): void {
  const rebind = (service: string) =>
    new Logger({ service, transports: options.transports, minLevel: options.minLevel });

  coreLogger = rebind("core");
  authLogger = rebind("auth");
  deploymentLogger = rebind("deployment");
  workerLogger = rebind("worker");
  apiLogger = rebind("api");
}

/**
 * Reset all singleton loggers to their defaults (ConsoleTransport, LOG_LEVEL from env).
 */
export function resetLogging(): void {
  coreLogger = new Logger({ service: "core" });
  authLogger = new Logger({ service: "auth" });
  deploymentLogger = new Logger({ service: "deployment" });
  workerLogger = new Logger({ service: "worker" });
  apiLogger = new Logger({ service: "api" });
}

// Request logging middleware helper
export function createRequestLogger(
  logger: Logger
): (req: { method: string; url: string }, res: { statusCode: number }, duration: number) => void {
  return (req, res, duration) => {
    const context = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: duration,
    };

    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.url}`, undefined, context);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.url}`, context);
    } else {
      logger.info(`${req.method} ${req.url}`, context);
    }
  };
}

// Timed operation helper
export async function timedOperation<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = Date.now();
  logger.debug(`Starting: ${operation}`, context);

  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.info(`Completed: ${operation}`, { ...context, durationMs: duration });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`Failed: ${operation}`, error as Error, { ...context, durationMs: duration });
    throw error;
  }
}

/**
 * Middleware helper to wrap request handlers with trace context.
 * Use this in your HTTP framework to automatically trace all requests.
 *
 * @example
 * // Express middleware
 * app.use((req, res, next) => {
 *   withTraceContext(() => next());
 * });
 */
export function withTraceContext<T>(fn: () => T, traceId?: string, spanId?: string): T {
  const effectiveTraceId = traceId ?? Logger.generateTraceId();
  const effectiveSpanId = spanId ?? Logger.generateSpanId();
  return Logger.runWithTrace(effectiveTraceId, effectiveSpanId, fn);
}

/**
 * Async version of withTraceContext.
 */
export async function withTraceContextAsync<T>(
  fn: () => Promise<T>,
  traceId?: string,
  spanId?: string
): Promise<T> {
  const effectiveTraceId = traceId ?? Logger.generateTraceId();
  const effectiveSpanId = spanId ?? Logger.generateSpanId();
  return Logger.runWithTraceAsync(effectiveTraceId, effectiveSpanId, fn);
}
