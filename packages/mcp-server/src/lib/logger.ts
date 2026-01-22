import winston from 'winston';

/**
 * Logger for MCP server
 *
 * IMPORTANT: Logs to stderr only, never stdout
 * MCP protocol uses stdio for communication, so stdout must remain clean
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Stream({
      stream: process.stderr,
    }),
  ],
});

/**
 * Development-friendly console logger
 * Only active when LOG_FORMAT=pretty
 */
if (process.env.LOG_FORMAT === 'pretty') {
  logger.add(
    new winston.transports.Stream({
      stream: process.stderr,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;
