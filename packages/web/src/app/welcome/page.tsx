'use client'

import Link from 'next/link'

export default function WelcomePage() {
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
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-6 text-center">How it works</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-violet-100 rounded-lg mb-4">
              <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900 mb-1">1. Upload Agent</div>
            <p className="text-xs text-slate-500">Upload your solution ZIP file to AgentSync</p>
          </div>

          {/* Step 2 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900 mb-1">2. Select Tenants</div>
            <p className="text-xs text-slate-500">Choose which tenants to deploy to, with URL configuration per tenant</p>
          </div>

          {/* Step 3 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-lg mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900 mb-1">3. Deploy</div>
            <p className="text-xs text-slate-500">Deploy to all selected tenants simultaneously with real-time progress</p>
          </div>

          {/* Step 4 */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-100 rounded-lg mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-slate-900 mb-1">4. Monitor</div>
            <p className="text-xs text-slate-500">Track deployment status across tenants and manage agent lifecycle</p>
          </div>
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex justify-center gap-4">
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload Your First Agent
        </Link>
        <Link
          href="/deployments/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
        >
          Try with Demo Agents
        </Link>
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

      {/* Demo mode note */}
      <p className="text-center text-xs text-slate-400 mt-6">
        Running in demo mode with sample tenants. Connect to real tenants in settings.
      </p>
    </div>
  )
}
