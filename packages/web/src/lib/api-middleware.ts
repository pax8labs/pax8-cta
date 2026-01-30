import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, Session } from 'next-auth';
import { authOptions, hasRole, AppRole, AppRoles } from './auth';
import { isDemoMode } from '@agentsync/core';

/**
 * Result type for authentication/authorization checks
 * Either returns a session (success) or an error response (failure)
 */
export type AuthResult = Session | NextResponse;

/**
 * Validates that the request has a valid session.
 * Returns the session on success, or a 401 response on failure.
 * In DEMO_MODE, returns a mock session if no real session exists (for E2E testing).
 *
 * @example
 * export async function POST(req: NextRequest) {
 *   const session = await requireAuth();
 *   if (session instanceof NextResponse) return session;
 *   // session is valid, proceed with operation
 * }
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    // In DEMO_MODE, allow requests without authentication for E2E testing
    if (isDemoMode()) {
      return {
        user: {
          email: 'demo@agentsync.test',
          name: 'Demo User',
          roles: ['Admin'],
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } as Session;
    }

    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'You must be authenticated to access this resource'
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
        error: 'Forbidden',
        message: `This action requires the ${requiredRole} role`,
        requiredRole,
        userRoles: session.user.roles || []
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
  const hasAnyRole = allowedRoles.some(role => hasRole(userRoles, role));

  if (!hasAnyRole) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        allowedRoles,
        userRoles
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
        error: 'Forbidden',
        message: 'You are not authorized to approve deployments',
        allowedApprovers: allowedApprovers.length > 0 ? allowedApprovers : undefined
      },
      { status: 403 }
    );
  }

  return session;
}

/**
 * Validates that the authenticated user has permission to access a specific tenant.
 * Currently checks if user is an Admin (has access to all tenants) or if tenant filtering is implemented.
 *
 * TODO: Implement tenant-scoped access control based on user assignments
 *
 * @param tenantId - The tenant ID to check access for
 *
 * @example
 * export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
 *   const session = await requireTenantAccess(params.id);
 *   if (session instanceof NextResponse) return session;
 *   // user has access to this tenant
 * }
 */
export async function requireTenantAccess(tenantId: string): Promise<AuthResult> {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session; // Auth failed

  // Admins have access to all tenants
  if (hasRole(session.user.roles, AppRoles.ADMIN)) {
    return session;
  }

  // TODO: Implement tenant-scoped access control
  // For now, non-admins can access all tenants (viewers, deployers)
  // In the future, this should check user-tenant assignments

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
  reason: 'unauthorized' | 'forbidden',
  details?: Record<string, unknown>
) {
  console.warn('[AUTH FAILURE]', {
    userId,
    endpoint,
    reason,
    timestamp: new Date().toISOString(),
    ...details
  });

  // TODO: Send to audit log system
}
