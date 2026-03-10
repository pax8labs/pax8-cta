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
 * Request Context Utilities
 *
 * Provides utilities for accessing request-scoped metadata like correlation IDs
 * for distributed tracing and request correlation across logs.
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";

/**
 * Get the correlation ID for the current request.
 *
 * The correlation ID is set by middleware and can be used to trace
 * a single request through multiple API calls and log entries.
 *
 * @param req - Optional NextRequest object (for API routes)
 * @returns The correlation ID for this request, or undefined if not available
 *
 * @example
 * // In API route
 * export async function GET(req: NextRequest) {
 *   const correlationId = getCorrelationId(req);
 *   logger.info('Processing request', { correlationId });
 * }
 *
 * @example
 * // In server component
 * const correlationId = await getCorrelationId();
 * logger.info('Rendering component', { correlationId });
 */
export function getCorrelationId(req?: NextRequest): string | undefined {
  if (req) {
    // API route: Get from request headers
    return req.headers.get("x-correlation-id") || undefined;
  }

  // Server component: Get from headers()
  try {
    const headersList = headers();
    return headersList.get("x-correlation-id") || undefined;
  } catch {
    // Headers not available (client-side or build time)
    return undefined;
  }
}

/**
 * Get full request context including correlation ID, method, path, and user info.
 * Use this for enriching log entries with request metadata.
 *
 * @param req - NextRequest object
 * @returns Object containing request metadata
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const context = getRequestContext(req);
 *   logger.info('API request received', context);
 *   // Logs: { correlationId: '...', method: 'POST', path: '/api/users', ... }
 * }
 */
export function getRequestContext(req: NextRequest): {
  correlationId?: string;
  method: string;
  path: string;
  userAgent?: string;
  ip?: string;
} {
  return {
    correlationId: getCorrelationId(req),
    method: req.method,
    path: req.nextUrl.pathname,
    userAgent: req.headers.get("user-agent") || undefined,
    ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
  };
}

/**
 * Generate a new correlation ID.
 * Use this on the client side to create a correlation ID for a request chain.
 *
 * @returns A new UUID to use as a correlation ID
 *
 * @example
 * // Client-side fetch wrapper
 * async function apiCall(endpoint: string, options: RequestInit = {}) {
 *   const correlationId = generateCorrelationId();
 *   const response = await fetch(endpoint, {
 *     ...options,
 *     headers: {
 *       ...options.headers,
 *       'x-correlation-id': correlationId,
 *     },
 *   });
 *   return response;
 * }
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
