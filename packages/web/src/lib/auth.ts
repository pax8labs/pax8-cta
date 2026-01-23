import { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

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

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid email profile User.Read',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        // Extract roles from Azure AD token if available
        token.roles = (profile as any)?.roles || [];
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
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
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
