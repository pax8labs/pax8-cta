import { NextAuthOptions, Profile } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';

// Check if demo mode is enabled
const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';

/**
 * Extended Azure AD profile with optional roles claim
 * Azure AD can be configured to include app roles in the token
 */
interface AzureADProfile extends Profile {
  roles?: string[];
}

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles?: string[];
    };
  }

  interface JWT {
    accessToken?: string;
    roles?: string[];
  }
}

// Demo mode provider that auto-authenticates
const demoProvider = CredentialsProvider({
  id: 'demo',
  name: 'Demo Mode',
  credentials: {},
  async authorize() {
    return {
      id: 'demo-user',
      name: 'Demo User',
      email: 'demo@agentsync.local',
      roles: ['Admin'],
    };
  },
});

// Production Azure AD provider
// SECURITY: No default values - these MUST be set explicitly in production
if (!isDemoMode && (!process.env.AZURE_AD_CLIENT_ID || !process.env.AZURE_AD_CLIENT_SECRET || !process.env.AZURE_AD_TENANT_ID)) {
  throw new Error(
    'CRITICAL: Azure AD credentials not configured. Set AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID environment variables. ' +
    'For development/testing only, you can enable DEMO_MODE=true (NOT for production use).'
  );
}

const azureProvider = !isDemoMode ? AzureADProvider({
  clientId: process.env.AZURE_AD_CLIENT_ID!,
  clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
  tenantId: process.env.AZURE_AD_TENANT_ID!,
  authorization: {
    params: {
      scope: 'openid email profile User.Read',
    },
  },
}) : null;

export const authOptions: NextAuthOptions = {
  providers: isDemoMode ? [demoProvider] : (azureProvider ? [azureProvider] : [demoProvider]),
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        // Extract roles from Azure AD token if available
        const azureProfile = profile as AzureADProfile | undefined;
        token.roles = azureProfile?.roles || [];
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (session.user) {
        session.user.id = token.sub!;
        session.user.roles = token.roles as string[];
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after sign-in
      // This prevents redirect issues with directory listings
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
      }
      if (url.startsWith(baseUrl)) {
        return url;
      }
      // Default to dashboard
      return baseUrl;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: (() => {
    if (isDemoMode) {
      console.warn('⚠️  WARNING: Running in DEMO MODE - Authentication is bypassed! DO NOT use in production.');
      return 'demo-secret-for-local-testing-only';
    }
    if (!process.env.NEXTAUTH_SECRET) {
      throw new Error(
        'CRITICAL: NEXTAUTH_SECRET is not set. Generate a secure secret with: openssl rand -base64 32'
      );
    }
    if (process.env.NEXTAUTH_SECRET.length < 32) {
      throw new Error(
        'CRITICAL: NEXTAUTH_SECRET is too short (minimum 32 characters). Generate a secure secret with: openssl rand -base64 32'
      );
    }
    return process.env.NEXTAUTH_SECRET;
  })(),
};

// Role-based access control helper
export function hasRole(roles: string[] | undefined, requiredRole: string): boolean {
  return roles?.includes(requiredRole) || roles?.includes('Admin') || false;
}

// Defined roles for the application
export const AppRoles = {
  ADMIN: 'Admin',
  DEPLOYER: 'Deployer',
  VIEWER: 'Viewer',
} as const;

export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];
