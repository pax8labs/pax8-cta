import { withAuth } from 'next-auth/middleware';
import { NextResponse, NextRequest } from 'next/server';

// Check if demo mode is enabled
const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  return response;
}

// Demo mode middleware - bypasses auth entirely
function demoMiddleware(_req: NextRequest) {
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

// Production middleware with auth
const authMiddleware = withAuth(
  function middleware(_req) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to auth pages without token
        if (req.nextUrl.pathname.startsWith('/auth/')) {
          return true;
        }

        // Allow access to health check endpoints
        if (req.nextUrl.pathname.startsWith('/api/health')) {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
