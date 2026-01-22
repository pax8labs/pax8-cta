export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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

// Console transport with JSON output for production
class ConsoleTransport implements LogTransport {
  private structured: boolean;
  private colors: boolean;

  constructor(options?: { structured?: boolean; colors?: boolean }) {
    this.structured = options?.structured ?? process.env.NODE_ENV === 'production';
    this.colors = options?.colors ?? process.env.NODE_ENV !== 'production';
  }

  log(entry: LogEntry): void {
    if (this.structured) {
      console.log(JSON.stringify(entry));
    } else {
      const levelColors: Record<LogLevel, string> = {
        debug: '\x1b[90m',
        info: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
      };
      const reset = '\x1b[0m';
      const color = this.colors ? levelColors[entry.level] : '';
      const resetCode = this.colors ? reset : '';

      let output = `${entry.timestamp} ${color}${entry.level.toUpperCase().padEnd(5)}${resetCode}`;
      if (entry.service) {
        output += ` [${entry.service}]`;
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
  private static traceId?: string;
  private static spanId?: string;

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
    this.minLevel = options?.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';
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
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      traceId: Logger.traceId,
      spanId: Logger.spanId,
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
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log('warn', message, context, error);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, context, error);
  }

  child(options: { service?: string; context?: LogContext }): Logger {
    return new Logger({
      service: options.service ?? this.service,
      transports: this.transports,
      minLevel: this.minLevel,
      defaultContext: { ...this.defaultContext, ...options.context },
    });
  }

  // Static methods for trace context
  static setTraceContext(traceId: string, spanId?: string): void {
    Logger.traceId = traceId;
    Logger.spanId = spanId;
  }

  static clearTraceContext(): void {
    Logger.traceId = undefined;
    Logger.spanId = undefined;
  }

  static generateTraceId(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }
}

// Pre-configured loggers for different services
export const coreLogger = new Logger({ service: 'core' });
export const authLogger = new Logger({ service: 'auth' });
export const deploymentLogger = new Logger({ service: 'deployment' });
export const workerLogger = new Logger({ service: 'worker' });
export const apiLogger = new Logger({ service: 'api' });

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
