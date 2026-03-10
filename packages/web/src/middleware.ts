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

import { withAuth } from "next-auth/middleware";
import { NextResponse, NextRequest } from "next/server";

// Check if demo mode is enabled
const isDemoMode = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";

// Check if staging password protection is enabled
const stagingPassword = process.env.STAGING_PASSWORD;
const STAGING_AUTH_COOKIE = "staging-auth";
const VISITED_COOKIE = "agentsync-visited";

// Log warning if demo mode is enabled
if (isDemoMode) {
  console.warn("⚠️  WARNING: DEMO MODE ENABLED - All authentication is bypassed!");
  console.warn("⚠️  This mode should NEVER be used in production environments.");
  console.warn("⚠️  Set DEMO_MODE=false and configure Azure AD credentials for production.");
}

function addSecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  // Generate a unique nonce for this request
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Set nonce header for use in components
  response.headers.set("x-nonce", nonce);

  // Generate or extract correlation ID for request tracing
  // Check if client sent a correlation ID, otherwise generate one
  const correlationId = request.headers.get("x-correlation-id") || crypto.randomUUID();

  // Set correlation ID header for:
  // - Client to use in subsequent requests
  // - Server-side components to access for logging
  response.headers.set("x-correlation-id", correlationId);

  // Also set as a request header for API routes to access
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);

  // Store correlation ID in response for logging
  (response as any).__correlationId = correlationId;

  // Content Security Policy - relaxed for development
  const isDev = process.env.NODE_ENV === "development";
  const cspHeader = isDev
    ? [
        "default-src 'self'",
        `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.posthog.com`,
        `style-src 'self' 'unsafe-inline'`,
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws://localhost:* https://*.posthog.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    : [
        "default-src 'self'",
        // Use unsafe-inline for demo deployments without HTTPS
        // TODO: Re-enable nonce-based CSP when HTTPS is configured
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.posthog.com`,
        `style-src 'self' 'unsafe-inline'`,
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.posthog.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        // Note: upgrade-insecure-requests removed for HTTP deployments
      ].join("; ");

  response.headers.set("Content-Security-Policy", cspHeader);

  // Core security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Strict Transport Security (HSTS)
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Cross-Origin headers for enhanced isolation
  // Note: COEP require-corp disabled - it blocks subresources without crossorigin attribute
  // TODO: Re-enable when all resources have proper CORS headers
  // response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  // Permissions Policy - restrict browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
  );

  return response;
}

// Check if staging auth is required and valid
function checkStagingAuth(req: NextRequest): NextResponse | null {
  // If no staging password configured, allow access
  if (!stagingPassword) {
    return null;
  }

  // Allow access to staging auth page and API
  if (
    req.nextUrl.pathname.startsWith("/staging-auth") ||
    req.nextUrl.pathname.startsWith("/api/staging-auth")
  ) {
    return null;
  }

  // Allow access to health check endpoints (for ALB health checks)
  if (req.nextUrl.pathname.startsWith("/api/health")) {
    return null;
  }

  // Allow static assets
  if (req.nextUrl.pathname.startsWith("/_next/") || req.nextUrl.pathname.includes(".")) {
    return null;
  }

  // Check for staging auth cookie
  const stagingAuthCookie = req.cookies.get(STAGING_AUTH_COOKIE);

  if (!stagingAuthCookie?.value) {
    // Redirect to staging auth page
    const url = req.nextUrl.clone();
    url.pathname = "/staging-auth";
    url.searchParams.set("returnUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Cookie exists, allow access
  return null;
}

// Check if this is a first-time visitor who should be redirected to /welcome
function checkFirstVisit(req: NextRequest): NextResponse | null {
  // Only redirect from the root path
  if (req.nextUrl.pathname !== "/") {
    return null;
  }

  // Check if user has visited before
  const visitedCookie = req.cookies.get(VISITED_COOKIE);
  if (visitedCookie?.value) {
    return null;
  }

  // First-time visitor - redirect to welcome and set cookie
  const url = req.nextUrl.clone();
  url.pathname = "/welcome";
  const response = NextResponse.redirect(url);

  // Set visited cookie (expires in 1 year)
  response.cookies.set(VISITED_COOKIE, "true", {
    httpOnly: false,
    secure: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return response;
}

// Demo mode middleware - bypasses auth entirely
function demoMiddleware(req: NextRequest) {
  // Check staging auth first
  const stagingRedirect = checkStagingAuth(req);
  if (stagingRedirect) {
    return stagingRedirect;
  }

  // Check for first-time visitors and redirect to welcome
  const welcomeRedirect = checkFirstVisit(req);
  if (welcomeRedirect) {
    return welcomeRedirect;
  }

  const response = NextResponse.next();
  addSecurityHeaders(response, req);
  return response;
}

// Production middleware with auth
const authMiddleware = withAuth(
  function middleware(req) {
    const response = NextResponse.next();
    addSecurityHeaders(response, req);
    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to auth pages without token
        if (req.nextUrl.pathname.startsWith("/auth/")) {
          return true;
        }

        // Allow access to health check endpoints
        if (req.nextUrl.pathname.startsWith("/api/health")) {
          return true;
        }

        // Require token for all other routes
        return !!token;
      },
    },
  }
);

// Export the appropriate middleware based on mode
export default isDemoMode ? demoMiddleware : authMiddleware;

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
