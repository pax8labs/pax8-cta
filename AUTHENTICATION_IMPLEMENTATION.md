# Authentication & Authorization Implementation

**Issue:** #12 - Implement RBAC enforcement and session validation on all API routes

**Status:** ✅ Completed

**Date:** 2026-01-30

## Summary

Implemented comprehensive authentication and authorization across all API routes to address critical security vulnerabilities where API routes lacked proper session validation and role enforcement.

## Critical Security Fix

### Deployment Approval Vulnerability (CRITICAL)
**Before:** The `/api/deployments/[id]/approve` endpoint accepted an `approver` parameter from the request body, allowing any authenticated user to approve deployments using someone else's email address.

**After:** The endpoint now:
- Uses the authenticated user's email from the session (not from request body)
- Validates that the user's email is in the allowed approvers list
- Prevents impersonation attacks

## Implementation Details

### 1. Authentication Middleware (`src/lib/api-middleware.ts`)

Created reusable middleware helpers for API route protection:

#### Core Functions:
- **`requireAuth()`** - Validates that a request has a valid session
  - Returns session on success, 401 response on failure

- **`requireRole(role)`** - Validates user has a specific role
  - Checks session and role, returns 403 if unauthorized

- **`requireRoles(roles[])`** - Validates user has at least one of multiple roles
  - Useful for endpoints accessible by Admin OR Deployer

- **`requireApproverEmail(allowedApprovers[])`** - Validates user is an authorized approver
  - Used for approval workflows

- **`requireTenantAccess(tenantId)`** - Validates user can access a tenant
  - Currently allows Admin access to all, foundation for future tenant-scoping

#### Helper Functions:
- **`getSession()`** - Optional authentication, returns null if not authenticated
- **`logAuthFailure()`** - Logs authentication/authorization failures for audit
- **`isSession()`** - Type guard for auth result checking

### 2. Protected API Routes

#### Admin-Only Routes:
| Route | Method | Description |
|-------|--------|-------------|
| `/api/settings` | GET, PUT | Integration settings management |
| `/api/deployments/[id]/rollback` | POST | Rollback deployments (critical operation) |
| `/api/schedules` | DELETE | Remove scheduled deployments |
| `/api/tenants` | POST | Refresh tenant discovery cache |

#### Admin or Deployer Routes:
| Route | Method | Description |
|-------|--------|-------------|
| `/api/deployments/create` | POST | Create new deployments |
| `/api/deployments/[id]/cancel` | POST | Cancel running deployments |
| `/api/deployments/[id]/retry` | POST | Retry failed deployments |
| `/api/agents` | POST | Create custom agents |
| `/api/solutions/upload` | POST | Upload solution files |
| `/api/schedules` | POST | Register scheduled deployments |

#### Approver-Only Routes:
| Route | Method | Description |
|-------|--------|-------------|
| `/api/deployments/[id]/approve` | POST | Approve/reject deployments |

#### Authenticated Routes (All Roles):
| Route | Method | Description |
|-------|--------|-------------|
| `/api/settings` | GET | View integration settings |
| `/api/deployments` | GET | List deployments |
| `/api/deployments/[id]` | GET | View deployment details |
| `/api/deployments/[id]/approve` | GET | View approval status |
| `/api/agents` | GET | List agents |
| `/api/stats` | GET | Dashboard statistics |
| `/api/tenants` | GET | List tenants |
| `/api/tenants/[id]` | GET | View tenant details |
| `/api/schedules` | GET | View scheduled deployments |

### 3. Role Definitions

Defined in `src/lib/auth.ts`:

```typescript
export const AppRoles = {
  ADMIN: 'Admin',        // Full system access
  DEPLOYER: 'Deployer',  // Can create and manage deployments
  VIEWER: 'Viewer',      // Read-only access
} as const;
```

Roles are extracted from Azure AD tokens during authentication and stored in the user session.

### 4. Audit Logging

All authentication and authorization failures are logged with:
- User ID (if available)
- Endpoint accessed
- Reason for failure (unauthorized vs forbidden)
- Additional context (action attempted, tenant ID, etc.)

Logged via `logAuthFailure()` function, ready for integration with audit log system.

## What Was NOT Implemented

### Tenant-Scoped Access Control
The `requireTenantAccess()` function is implemented but currently allows all authenticated users to access all tenants (except Admin restriction). Full tenant-scoped access control requires:
- User-tenant assignment table in database
- UI for managing user-tenant assignments
- Enforcement in `requireTenantAccess()` function

**Status:** Foundation in place, marked with TODO comments

### Rate Limiting
API endpoints do not yet have rate limiting implemented. This should be added to prevent:
- Brute force attacks
- Resource exhaustion
- API abuse

**Recommendation:** Implement rate limiting middleware using Redis

### CSRF Protection
State-changing operations (POST/PUT/DELETE) do not have CSRF token validation. The current session-based authentication is vulnerable to CSRF attacks.

**Recommendation:** Add CSRF token generation and validation

## Testing

### Build Verification
✅ TypeScript compilation successful - no type errors
✅ Next.js build completed successfully
✅ All routes properly typed and validated

### Manual Testing Required
Before deploying to production, test:
1. Authentication - verify unauthenticated requests are rejected
2. Role enforcement - verify role-based restrictions work
3. Approver validation - verify only authorized approvers can approve
4. Session validation - verify expired sessions are rejected
5. Error responses - verify proper 401/403 responses with clear messages

## Security Impact

### Before Implementation:
- ❌ Any authenticated user could perform admin actions
- ❌ Any authenticated user could access any tenant data
- ❌ Any authenticated user could approve deployments using someone else's email
- ❌ Any authenticated user could modify integration settings
- ❌ No audit trail of access attempts

### After Implementation:
- ✅ Role-based access control enforced on all sensitive operations
- ✅ Session validation required for all API routes
- ✅ Approver identity verified from session (not request body)
- ✅ Clear separation between Admin, Deployer, and Viewer capabilities
- ✅ Authentication failures logged for audit

## Migration Notes

### Breaking Changes
- **All API routes now require authentication** - Any external integrations or scripts calling the API must provide valid authentication
- **Approval endpoint signature changed** - The `approver` field in the request body is now ignored; the session email is used instead
- **Role requirements enforced** - Users without appropriate roles will receive 403 errors on restricted endpoints

### Backward Compatibility
- Existing user sessions remain valid
- No changes to authentication flow (still using NextAuth with Azure AD)
- Demo mode continues to work with auto-authentication

## Next Steps

1. **Deploy to staging environment** and perform comprehensive testing
2. **Update API documentation** to reflect authentication requirements
3. **Implement tenant-scoped access control** for multi-tenant security
4. **Add rate limiting** to prevent abuse
5. **Implement CSRF protection** for state-changing operations
6. **Set up audit log storage** for security monitoring
7. **Create admin UI** for role and tenant assignment management

## Files Modified

### New Files:
- `src/lib/api-middleware.ts` - Authentication middleware helpers

### Modified Files:
- `src/app/api/settings/route.ts`
- `src/app/api/deployments/create/route.ts`
- `src/app/api/deployments/route.ts`
- `src/app/api/deployments/[id]/route.ts`
- `src/app/api/deployments/[id]/approve/route.ts`
- `src/app/api/deployments/[id]/rollback/route.ts`
- `src/app/api/deployments/[id]/cancel/route.ts`
- `src/app/api/deployments/[id]/retry/route.ts`
- `src/app/api/tenants/route.ts`
- `src/app/api/tenants/[id]/route.ts`
- `src/app/api/agents/route.ts`
- `src/app/api/stats/route.ts`
- `src/app/api/solutions/upload/route.ts`
- `src/app/api/schedules/route.ts`

## Acceptance Criteria

✅ All protected routes call session validation
✅ Role checks implemented on sensitive operations
✅ Unauthorized requests return 401
✅ Forbidden access returns 403 with reason
✅ Failures logged for audit trail
✅ TypeScript compilation successful
⏳ Integration tests pending (manual testing required)

## References

- GitHub Issue: #12
- NextAuth Documentation: https://next-auth.js.org/
- Azure AD Roles: Configured in Azure AD app registration
