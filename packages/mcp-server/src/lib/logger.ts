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

import winston from "winston";

/**
 * Logger for MCP server
 *
 * IMPORTANT: Logs to stderr only, never stdout
 * MCP protocol uses stdio for communication, so stdout must remain clean
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
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
if (process.env.LOG_FORMAT === "pretty") {
  logger.add(
    new winston.transports.Stream({
      stream: process.stderr,
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

export default logger;
