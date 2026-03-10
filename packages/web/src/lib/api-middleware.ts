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
import { getServerSession, Session } from "next-auth";
import { authOptions, hasRole, AppRole, AppRoles } from "./auth";
import { hasUserTenantAccess } from "./repositories/user-tenant-repository";
import { writeAuditLog } from "./repositories/audit-repository";

/**
 * Result type for authentication/authorization checks
 * Either returns a session (success) or an error response (failure)
 */
export type AuthResult = Session | NextResponse;

/**
 * Validates that the request has a valid session.
 * Returns the session on success, or a 401 response on failure.
 *
 * In DEMO_MODE, authentication is bypassed for easier local development and
 * Claude Code integration. A mock admin session is returned instead.
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const session = await requireAuth();
 *   if (session instanceof NextResponse) return session;
 *   // session is valid, proceed with operation
 * }
 */
export async function requireAuth(): Promise<AuthResult> {
  // In demo mode, bypass authentication for Claude Code integration
  if (process.env.DEMO_MODE === "true") {
    const mockSession: Session = {
      user: {
        id: "demo-user",
        email: "demo@agentsync.local",
        name: "Demo User",
        roles: [AppRoles.ADMIN, AppRoles.DEPLOYER, AppRoles.VIEWER],
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    return mockSession;
  }

  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "You must be authenticated to access this resource",
      },
      { status: 401 }
    );
  }

  return session;
}

/**
 * Validates that the request has a valid session AND the user has a specific role.
 * Returns the session on success, or an error response (401/403) on failure.
 *
 * @param requiredRole - The role required to access this resource
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const session = await requireRole(AppRoles.ADMIN);
 *   if (session instanceof NextResponse) return session;
 *   // user has admin role, proceed with operation
 * }
 */
export async function requireRole(requiredRole: AppRole): Promise<AuthResult> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session; // Auth failed

  if (!hasRole(session.user.roles, requiredRole)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: `This action requires the ${requiredRole} role`,
        requiredRole,
        userRoles: session.user.roles || [],
      },
      { status: 403 }
    );
  }

  return session;
}

/**
 * Validates that the request has a valid session AND the user has at least one of the specified roles.
 * Returns the session on success, or an error response (401/403) on failure.
 *
 * @param allowedRoles - Array of roles, user must have at least one
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const session = await requireRoles([AppRoles.ADMIN, AppRoles.DEPLOYER]);
 *   if (session instanceof NextResponse) return session;
 *   // user has admin or deployer role, proceed
 * }
 */
export async function requireRoles(allowedRoles: AppRole[]): Promise<AuthResult> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session; // Auth failed

  const userRoles = session.user.roles || [];
  const hasAnyRole = allowedRoles.some((role) => hasRole(userRoles, role));

  if (!hasAnyRole) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}`,
        allowedRoles,
        userRoles,
      },
      { status: 403 }
    );
  }

  return session;
}

/**
 * Validates that the authenticated user's email matches one of the allowed approver emails.
 * This is used for approval workflows where specific users are authorized.
 *
 * @param allowedApprovers - Array of email addresses that are authorized
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const session = await requireApproverEmail(['alice@company.com', 'bob@company.com']);
 *   if (session instanceof NextResponse) return session;
 *   // user's email is in the approver list
 * }
 */
export async function requireApproverEmail(allowedApprovers: string[]): Promise<AuthResult> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session; // Auth failed

  const userEmail = session.user.email;

  if (!userEmail || !allowedApprovers.includes(userEmail)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You are not authorized to approve deployments",
        allowedApprovers: allowedApprovers.length > 0 ? allowedApprovers : undefined,
      },
      { status: 403 }
    );
  }

  return session;
}

/**
 * Validates that the authenticated user has permission to access a specific tenant.
 *
 * Access is granted if:
 * - User has the ADMIN role (access to all tenants), OR
 * - User has a specific assignment to this tenant
 *
 * In DEMO_MODE, all users have access to all tenants.
 * In soft-enforcement mode (TENANT_ACCESS_SOFT_ENFORCE=true), violations are logged but allowed.
 *
 * @param tenantId - The tenant ID to check access for
 * @param options - Configuration options
 *
 * @example
 * export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
 *   const session = await requireTenantAccess(params.id);
 *   if (session instanceof NextResponse) return session;
 *   // user has access to this tenant
 * }
 */
export async function requireTenantAccess(
  tenantId: string,
  options: { softEnforce?: boolean } = {}
): Promise<AuthResult> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session; // Auth failed

  const userId = session.user.id;
  const softEnforce = options.softEnforce ?? process.env.TENANT_ACCESS_SOFT_ENFORCE === "true";

  // In demo mode, allow all access
  if (process.env.DEMO_MODE === "true") {
    return session;
  }

  // Admins have access to all tenants
  if (hasRole(session.user.roles, AppRoles.ADMIN)) {
    return session;
  }

  // Check user-tenant assignments
  const hasAccess = hasUserTenantAccess(userId, tenantId);

  if (!hasAccess) {
    // Log the access violation
    logAuthFailure(userId, `/tenant/${tenantId}`, "forbidden", {
      tenantId,
      userRoles: session.user.roles,
      reason: "No tenant assignment found",
    });

    // In soft enforcement mode, log but allow
    if (softEnforce) {
      console.warn("[TENANT ACCESS] Soft enforcement: allowing access despite missing assignment", {
        userId,
        tenantId,
        userEmail: session.user.email,
      });
      return session;
    }

    // Hard enforcement: deny access
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You do not have access to this tenant",
        tenantId,
      },
      { status: 403 }
    );
  }

  return session;
}

/**
 * Helper to get the current session without enforcing authentication.
 * Useful for optional authentication or to get user context for logging.
 *
 * @returns Session if authenticated, null otherwise
 */
export async function getSession(): Promise<Session | null> {
  return await getServerSession(authOptions);
}

/**
 * Type guard to check if an auth result is a session (success case)
 */
export function isSession(result: AuthResult): result is Session {
  return !(result instanceof NextResponse);
}

/**
 * Logs authentication/authorization failures for audit purposes
 */
export function logAuthFailure(
  userId: string | undefined,
  endpoint: string,
  reason: "unauthorized" | "forbidden",
  details?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString();

  console.warn("[AUTH FAILURE]", {
    userId,
    endpoint,
    reason,
    timestamp,
    ...details,
  });

  // Write to audit log system
  try {
    writeAuditLog({
      timestamp,
      action: `AUTH_FAILURE_${reason.toUpperCase()}`,
      userId,
      userEmail: details?.userEmail as string | undefined,
      resourceType: "access_control",
      resourceId: details?.tenantId as string | undefined,
      resourceName: endpoint,
      details: {
        reason,
        ...details,
      },
      success: false,
      errorMessage: `${reason} access to ${endpoint}`,
    });
  } catch (error) {
    console.error("[AUTH FAILURE] Failed to write audit log:", error);
  }
}
