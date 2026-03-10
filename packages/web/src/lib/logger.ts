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

/**
 * Structured Logger with Sensitive Data Redaction
 *
 * Provides structured logging with configurable log levels.
 * Automatically redacts sensitive data like passwords, tokens, and API keys.
 * Logs are output as JSON for easy parsing by log aggregation systems.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  component?: string;
  [key: string]: unknown;
}

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /bearer/i,
  /connectionstring/i,
  /connection[_-]?string/i,
  /credentials?/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /client[_-]?secret/i,
  /azure[_-]?ad/i,
  /github[_-]?token/i,
  /webhook[_-]?url/i,
];

/**
 * Redact sensitive data from an object
 * Recursively walks the object and masks values for sensitive keys
 */
function redactSensitiveData(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return "[max depth]";

  // Handle null/undefined
  if (obj === null || obj === undefined) return obj;

  // Handle primitives
  if (typeof obj !== "object") {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  // Handle Error objects specially to preserve stack traces
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: redactSensitiveString(obj.message),
      stack: obj.stack ? redactSensitiveString(obj.stack) : undefined,
    };
  }

  // Handle objects
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key matches sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      // Redact the value
      if (typeof value === "string" && value.length > 0) {
        redacted[key] = "***"; // Mask entire value
      } else if (value !== null && value !== undefined) {
        redacted[key] = "***";
      } else {
        redacted[key] = value;
      }
    } else {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(value, depth + 1);
    }
  }

  return redacted;
}

/**
 * Redact sensitive patterns from a string
 * Handles common patterns like "password=xxx", "Bearer xxx", etc.
 */
function redactSensitiveString(str: string): string {
  if (typeof str !== "string") return str;

  let redacted = str;

  // Redact Bearer tokens first (most specific pattern)
  redacted = redacted.replace(/Bearer\s+[\w\-_.]+/gi, "Bearer ***");

  // Redact Azure AD client secrets
  redacted = redacted.replace(
    /AZURE_AD_CLIENT_SECRET\s*[=:]\s*["']?[^"'\s]+["']?/gi,
    "AZURE_AD_CLIENT_SECRET=***"
  );

  // Redact GITHUB tokens
  redacted = redacted.replace(/GITHUB_TOKEN\s*[=:]\s*["']?[^"'\s]+["']?/gi, "GITHUB_TOKEN=***");

  // Redact connection strings
  redacted = redacted.replace(
    /(Server|Data Source|Password|Pwd|User Id|UID)\s*=\s*[^;]+/gi,
    "$1=***"
  );

  // Redact key=value patterns - do this last and match word boundaries
  // This matches: password=xxx, secret=yyy, token=zzz, apiKey=aaa, api_key=bbb, etc.
  // Matches after: start of string, whitespace, comma, semicolon, or opening parenthesis
  // Value stops at: whitespace, quote, comma, semicolon, or closing parenthesis
  const sensitiveKeyPattern =
    /(^|[\s,;(])([\w]*?(?:password|secret|token|apikey|api[_-]?key|credential)[\w]*?)\s*[=:]\s*["']?([^\s"',;)]+)["']?/gi;
  redacted = redacted.replace(sensitiveKeyPattern, (match, prefix, key, value) => {
    // Don't redact if value is already redacted
    if (value === "***" || value.includes("***")) {
      return match;
    }
    return `${prefix}${key}=***`;
  });

  return redacted;
}

class Logger {
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    // Default to 'info' in production, 'debug' in development
    this.isDevelopment = process.env.NODE_ENV === "development";
    const envLogLevel = process.env.LOG_LEVEL as LogLevel;
    this.logLevel = envLogLevel || (this.isDevelopment ? "debug" : "info");
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext): LogEntry {
    // Redact sensitive data from message and context
    const redactedMessage = redactSensitiveString(message);
    const redactedContext = context ? (redactSensitiveData(context) as LogContext) : undefined;

    return {
      level,
      message: redactedMessage,
      timestamp: new Date().toISOString(),
      ...redactedContext,
    };
  }

  private output(level: LogLevel, entry: LogEntry): void {
    const formatted = JSON.stringify(entry);

    // In development, also output a human-readable version
    if (this.isDevelopment) {
      const emoji = {
        debug: "🔍",
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
      }[level];

      const contextStr = Object.keys(entry)
        .filter((k) => !["level", "message", "timestamp"].includes(k))
        .map((k) => `${k}=${JSON.stringify(entry[k])}`)
        .join(" ");

      console[level](
        `${emoji} [${entry.level.toUpperCase()}] ${entry.message}${contextStr ? " " + contextStr : ""}`
      );
    } else {
      // In production, output structured JSON
      console[level](formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog("debug")) {
      this.output("debug", this.formatLog("debug", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog("info")) {
      this.output("info", this.formatLog("info", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog("warn")) {
      this.output("warn", this.formatLog("warn", message, context));
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog("error")) {
      const errorContext =
        error instanceof Error
          ? {
              error: redactSensitiveString(error.message),
              errorName: error.name,
              stack: error.stack ? redactSensitiveString(error.stack) : undefined,
              ...context,
            }
          : {
              error: String(error),
              ...context,
            };
      this.output("error", this.formatLog("error", message, errorContext));
    }
  }

  /**
   * Create a child logger with a fixed component context
   */
  child(component: string): Logger {
    const childLogger = new Logger();
    const originalFormatLog = childLogger.formatLog.bind(childLogger);
    childLogger.formatLog = (level: LogLevel, message: string, context?: LogContext) => {
      return originalFormatLog(level, message, { component, ...context });
    };
    return childLogger;
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience function for creating component-specific loggers
export function createLogger(component: string): Logger {
  return logger.child(component);
}
