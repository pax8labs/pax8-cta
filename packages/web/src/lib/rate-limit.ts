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

import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory store (use Redis in production for multi-instance)
const store = new Map<string, RateLimitStore>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
}, 60000); // Clean up every minute

export function rateLimit(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    req: NextRequest,
    identifier?: string
  ): Promise<{ success: boolean; remaining: number; reset: number } | null> {
    const key = identifier || getClientIdentifier(req);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let record = store.get(key);

    // Reset if window has passed
    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + config.windowMs,
      };
    }

    record.count++;
    store.set(key, record);

    const remaining = Math.max(0, config.maxRequests - record.count);
    const reset = record.resetTime;

    if (record.count > config.maxRequests) {
      return { success: false, remaining: 0, reset };
    }

    return { success: true, remaining, reset };
  };
}

function getClientIdentifier(req: NextRequest): string {
  // Try to get the real IP from various headers
  const forwardedFor = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");

  return (
    cfConnectingIp ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    realIp ||
    "unknown"
  );
}

// Pre-configured rate limiters
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
});

export const deploymentRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
});

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // Lower limit for LLM costs
});

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
});

// Helper to create rate limit response
export function createRateLimitResponse(reset: number): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests",
      retryAfter: Math.ceil((reset - Date.now()) / 1000),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(reset),
      },
    }
  );
}
