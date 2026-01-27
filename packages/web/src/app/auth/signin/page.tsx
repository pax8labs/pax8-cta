'use client';

import { signIn, getProviders } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/Logo';

type Providers = Awaited<ReturnType<typeof getProviders>>;

function SignInContent() {
  const [providers, setProviders] = useState<Providers>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  const handleSignIn = async (providerId: string) => {
    setIsSigningIn(true);
    try {
      // Use redirect: true for all providers - NextAuth handles the flow
      await signIn(providerId, {
        callbackUrl,
        redirect: true,
      });
    } catch (err) {
      console.error('Sign in error:', err);
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo className="h-16 w-16" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            AgentSync
          </h1>
          <p className="mt-2 text-slate-500">
            Multi-tenant Copilot Studio deployment automation
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl">
            <p className="text-sm font-medium">
              {error === 'OAuthSignin' && 'Error starting sign in flow'}
              {error === 'OAuthCallback' && 'Error during sign in callback'}
              {error === 'OAuthCreateAccount' && 'Error creating account'}
              {error === 'Callback' && 'Error during callback'}
              {error === 'AccessDenied' && 'Access denied'}
              {error === 'Configuration' && 'Server configuration error'}
              {error === 'CredentialsSignin' && 'Invalid credentials'}
              {!['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'Callback', 'AccessDenied', 'Configuration', 'CredentialsSignin'].includes(error) && 'An error occurred during sign in'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {!providers ? (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 mx-auto border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <p className="text-sm text-slate-500 mt-2">Loading sign-in options...</p>
            </div>
          ) : (
            Object.values(providers).map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleSignIn(provider.id)}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border border-slate-200 rounded-xl shadow-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {provider.id === 'azure-ad' && (
                  <svg className="w-5 h-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                )}
                {provider.id === 'demo' && (
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className="text-sm font-medium text-slate-700">
                  {isSigningIn ? 'Signing in...' : `Sign in with ${provider.name}`}
                </span>
              </button>
            ))
          )}
        </div>

        {providers && Object.values(providers).some(p => p.id === 'demo') && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">Demo Mode Active</p>
                <p className="text-xs text-amber-700 mt-1">
                  Sign in with demo credentials to explore the application. Changes will not persist.
                </p>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-center text-slate-500">
          By signing in, you agree to access this system only for authorized purposes.
        </p>
      </div>
    </div>
  );
}

function SignInLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 bg-slate-200 rounded-xl animate-pulse"></div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            AgentSync
          </h1>
          <p className="mt-2 text-slate-500">
            Loading...
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
    </Suspense>
  );
}
