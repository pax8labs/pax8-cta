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

        {/* Import Options */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6 mb-8">
          <h2 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Two Ways to Import Agents
          </h2>

          <div className="space-y-4">
            {/* Option 1: Direct Import (Recommended) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 dark:bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">
                    Direct Import from Power Platform <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-2">Recommended</span>
                  </h3>
                  <p className="text-sm text-slate-600 mb-2">
                    Connect AgentSync to your Power Platform environment and import agents directly—no manual export needed!
                  </p>
                  <ul className="text-xs text-slate-500 space-y-1 ml-4">
                    <li>• Automatic discovery of available solutions</li>
                    <li>• One-click import with version tracking</li>
                    <li>• No manual ZIP file management</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Option 2: Manual ZIP Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-slate-400 dark:bg-slate-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-1">Manual ZIP Upload</h3>
                  <p className="text-sm text-slate-600 mb-2">
                    Export your agent as a solution ZIP from Copilot Studio and upload it manually.
                  </p>
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer hover:text-slate-700 font-medium mb-1">View export instructions</summary>
                    <ol className="space-y-1 ml-4 mt-2">
                      <li>1. Open your agent in Copilot Studio</li>
                      <li>2. Go to Settings → Agent details → Export agent</li>
                      <li>3. Choose "Export as solution" (not "Export bot content")</li>
                      <li>4. Download the .zip file</li>
                    </ol>
                  </details>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">How AgentSync Works</h2>

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
            className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300 font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
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
      {/* Header with Setup Wizard CTA */}
      <div className="flex items-start justify-between mb-10">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Welcome to AgentSync</h1>
          </div>
          <p className="text-base text-slate-600 dark:text-slate-400">
            Deploy and manage Copilot Studio agents across all your Microsoft 365 tenants from one place.
          </p>
        </div>
        <button
          onClick={() => setView('setup')}
          className="flex-shrink-0 ml-6 inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Start Setup Wizard
        </button>
      </div>

      {/* Quick Start Guide */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-6 mb-8">
        <h2 className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Quick Start: Deploy to Multiple Tenants
        </h2>

        <div className="space-y-4">
          {/* One-time Setup */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 dark:bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                  One-Time Setup <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(5-10 minutes)</span>
                </h3>
                <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">a.</span>
                    <span>
                      <strong>Create GDAP relationships</strong> in{' '}
                      <a
                        href="https://partner.microsoft.com/en-us/dashboard/customers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Partner Center
                      </a>
                      {' '}(external Microsoft portal)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">b.</span>
                    <span>
                      <strong>Create Azure AD app registration</strong> in{' '}
                      <a
                        href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        Azure Portal
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">c.</span>
                    <span><strong>Enter credentials</strong> in AgentSync → <a href="/settings" className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300">/settings</a></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-bold">d.</span>
                    <span><strong>Test connection</strong> to verify everything works ✓</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* Per-Agent Deployment */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-green-600 dark:bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                  Per-Agent Deployment <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(2-3 minutes each)</span>
                </h3>
                <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-bold">a.</span>
                    <span><strong>Upload ZIP</strong> or import from source environment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-bold">b.</span>
                    <span><strong>Select target tenants</strong> (auto-discovered via GDAP)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-bold">c.</span>
                    <span><strong>Click Deploy</strong> → deploys to all tenants simultaneously</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 font-bold">d.</span>
                    <span><strong>Monitor progress</strong> with real-time updates</span>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Note:</strong> Step 1a (GDAP relationships) must be done in{' '}
            <a
              href="https://partner.microsoft.com/en-us/dashboard/customers"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-900 dark:hover:text-amber-200"
            >
              Microsoft Partner Center
            </a>
            . All other steps are done in AgentSync. Once setup is complete, deploying to 50 tenants takes the same time as deploying to 1!
          </p>
        </div>
      </div>

      {/* Demo Mode Option */}
      <div className="mb-8 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Try Demo Mode</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">Explore with sample data, no credentials required</p>
            </div>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm"
          >
            Go to Dashboard
          </Link>
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
      <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">What you can do with AgentSync:</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Deploy agents to multiple tenants at once
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Auto-discover GDAP-connected tenants
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Import agents directly from Power Platform
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Configure connections per tenant
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Track deployment status in real-time
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
