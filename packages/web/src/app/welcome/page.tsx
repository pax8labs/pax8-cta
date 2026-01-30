'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SetupWizard } from '@/components/SetupWizard'

type View = 'welcome' | 'setup' | 'how-it-works'

export default function WelcomePage() {
  const [view, setView] = useState<View>('welcome')

  // Show setup wizard
  if (view === 'setup') {
    return (
      <div className="py-6">
        <SetupWizard
          onComplete={() => setView('welcome')}
          onSkip={() => setView('welcome')}
        />
      </div>
    )
  }

  // Show how it works details
  if (view === 'how-it-works') {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <button
          onClick={() => setView('welcome')}
          className="mb-6 text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Prerequisites */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 mb-8">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Before you start
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            To deploy an agent, you&apos;ll need a <strong>solution ZIP file</strong> exported from Microsoft Copilot Studio:
          </p>
          <ol className="text-sm text-slate-600 space-y-2 ml-4">
            <li className="flex gap-2">
              <span className="text-slate-400">1.</span>
              <span>Open your agent in <strong>Copilot Studio</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">2.</span>
              <span>Go to <strong>Settings → Agent details → Export agent</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">3.</span>
              <span>Choose <strong>&quot;Export as solution&quot;</strong> (not &quot;Export bot content&quot;)</span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">4.</span>
              <span>Download the <strong>.zip file</strong> - this contains your agent as a Power Platform solution</span>
            </li>
          </ol>
        </div>

        {/* How it works */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">How AgentSync Works</h2>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-violet-100 rounded-lg">
                  <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">1. Upload or Import Agent</h3>
                <p className="text-sm text-slate-600">
                  Upload a solution ZIP file from Copilot Studio, or connect to Power Platform
                  and import directly from your source environment.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">2. Select Target Tenants</h3>
                <p className="text-sm text-slate-600">
                  Choose which customer tenants to deploy to. AgentSync can automatically discover
                  your GDAP-connected tenants, or you can manually add them.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-emerald-100 rounded-lg">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">3. Configure & Deploy</h3>
                <p className="text-sm text-slate-600">
                  Configure tenant-specific settings like connection references and environment variables.
                  Deploy to all selected tenants simultaneously with real-time progress tracking.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-10 h-10 bg-amber-100 rounded-lg">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">4. Monitor & Manage</h3>
                <p className="text-sm text-slate-600">
                  Track deployment status across all tenants from a single dashboard.
                  View logs, retry failed deployments, and manage the agent lifecycle.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => setView('setup')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Connect to Power Platform
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Main welcome view
  return (
    <div className="max-w-3xl mx-auto py-12">
      {/* Welcome header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Welcome to AgentSync</h1>
        <p className="text-lg text-slate-600 max-w-xl mx-auto">
          Deploy and manage Copilot Studio agents across all your Microsoft 365 tenants from one place.
        </p>
      </div>

      {/* Two path options */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Setup Wizard Path */}
        <div className="bg-white rounded-xl border-2 border-blue-200 p-6 hover:border-blue-400 transition-colors">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Connect to Power Platform</h2>
            <p className="text-sm text-slate-600 mb-4">
              Set up your Azure AD credentials to enable automatic tenant discovery,
              direct agent import from Dataverse, and multi-tenant deployments.
            </p>
          </div>
          <button
            onClick={() => setView('setup')}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Setup Wizard
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">
            Recommended for production use
          </p>
        </div>

        {/* Demo Mode Path */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 transition-colors">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-lg mb-3">
              <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Try Demo Mode</h2>
            <p className="text-sm text-slate-600 mb-4">
              Explore AgentSync with sample tenants and demo agents.
              You can upload your own solution files and test the deployment flow.
            </p>
          </div>
          <Link
            href="/"
            className="block w-full px-4 py-3 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors text-center"
          >
            Continue to Dashboard
          </Link>
          <p className="text-xs text-slate-400 text-center mt-2">
            No credentials required
          </p>
        </div>
      </div>

      {/* How it works link */}
      <div className="text-center mb-8">
        <button
          onClick={() => setView('how-it-works')}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Learn how AgentSync works →
        </button>
      </div>

      {/* Quick features list */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">What you can do with AgentSync:</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Deploy agents to multiple tenants at once
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Auto-discover GDAP-connected tenants
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Import agents directly from Power Platform
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Configure connections per tenant
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Track deployment status in real-time
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Manage agent lifecycle across tenants
          </div>
        </div>
      </div>

      {/* Back to dashboard */}
      <div className="text-center mt-6">
        <Link
          href="/"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
