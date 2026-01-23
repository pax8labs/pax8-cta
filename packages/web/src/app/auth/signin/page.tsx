'use client';

import { signIn, getProviders } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Providers = Awaited<ReturnType<typeof getProviders>>;

function SignInContent() {
  const [providers, setProviders] = useState<Providers>(null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Copilot Studio Deployer
          </h1>
          <p className="mt-2 text-center text-gray-600">
            Multi-tenant deployment automation for MSPs
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            <p className="text-sm">
              {error === 'OAuthSignin' && 'Error starting sign in flow'}
              {error === 'OAuthCallback' && 'Error during sign in callback'}
              {error === 'OAuthCreateAccount' && 'Error creating account'}
              {error === 'Callback' && 'Error during callback'}
              {error === 'AccessDenied' && 'Access denied'}
              {error === 'Configuration' && 'Server configuration error'}
              {!['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'Callback', 'AccessDenied', 'Configuration'].includes(error) && 'An error occurred during sign in'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {providers &&
            Object.values(providers).map((provider) => (
              <button
                key={provider.id}
                onClick={() => signIn(provider.id, { callbackUrl })}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                {provider.id === 'azure-ad' && (
                  <svg className="w-5 h-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                )}
                <span className="text-sm font-medium text-gray-700">
                  Sign in with {provider.name}
                </span>
              </button>
            ))}
        </div>

        <p className="text-xs text-center text-gray-500">
          By signing in, you agree to access this system only for authorized purposes.
        </p>
      </div>
    </div>
  );
}

function SignInLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h1 className="text-3xl font-bold text-center text-gray-900">
            Copilot Studio Deployer
          </h1>
          <p className="mt-2 text-center text-gray-600">
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
