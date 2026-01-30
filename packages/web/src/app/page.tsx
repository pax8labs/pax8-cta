'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { DeploymentCard } from '@/components/DeploymentCard'
import { StatsCard } from '@/components/StatsCard'
import { FlaskSpinner } from '@/components/ui/flask-spinner'
import type { DeploymentJob } from '@agentsync/core'
import type { Agent } from '@/types/agent'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// Delay before showing loading spinner to avoid flash on fast loads
const LOADING_DELAY_MS = 200

export default function Dashboard() {
  const [showSpinner, setShowSpinner] = useState(false)
  const [dismissedWelcome, setDismissedWelcome] = useState(false)

  const { data: stats, error: statsError, isLoading: statsLoading } = useSWR('/api/stats', fetcher, {
    refreshInterval: 5000,
  })

  const { data: recentDeployments, error: deploymentsError, isLoading: deploymentsLoading } = useSWR(
    '/api/deployments?limit=5',
    fetcher,
    { refreshInterval: 5000 }
  )

  const { data: agentsData, isLoading: agentsLoading } = useSWR('/api/agents', fetcher)

  // Fetch pending approvals - deployments awaiting approval
  const { data: pendingApprovals } = useSWR('/api/deployments?status=awaiting_approval', fetcher, {
    refreshInterval: 5000,
  })

  const deployments = recentDeployments?.deployments ?? []

  // Check if user has any custom agents (indicates they've actually used the app)
  const hasCustomAgents = agentsData?.agents?.some((a: Agent) => a.isCustom) ?? false

  // Check if there are any real (non-demo-hist) deployments
  const hasRealDeployments = deployments.some((d: DeploymentJob) => !d.id?.startsWith('demo-hist-'))

  // Wait for all data to load before deciding on welcome banner
  const isLoading = statsLoading || deploymentsLoading || agentsLoading

  // Delay showing spinner to avoid flash on fast loads
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowSpinner(true), LOADING_DELAY_MS)
      return () => clearTimeout(timer)
    } else {
      setShowSpinner(false)
    }
  }, [isLoading])

  // Show welcome banner if no custom agents and no real deployments
  const isNewUser = !isLoading && !hasCustomAgents && !hasRealDeployments && !statsError && !deploymentsError

  // Load dismissed state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('welcomeBannerDismissed')
    if (dismissed === 'true') {
      setDismissedWelcome(true)
    }
  }, [])

  // Handle dismissing welcome banner
  const handleDismissWelcome = () => {
    setDismissedWelcome(true)
    localStorage.setItem('welcomeBannerDismissed', 'true')
  }

  // Show loading state while data is being fetched (only after delay)
  if (isLoading && showSpinner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <FlaskSpinner size="lg" message="Loading dashboard..." />
      </div>
    )
  }

  // Show nothing during initial load delay (prevents flash)
  if (isLoading) {
    return <div className="min-h-[60vh]" />
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
        <Link
          href="/welcome"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Getting started
        </Link>
      </div>

      {/* Welcome Banner for New Users */}
      {isNewUser && !dismissedWelcome && (
        <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 relative">
          <button
            onClick={handleDismissWelcome}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Welcome to AgentSync!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Deploy Copilot Studio agents to multiple Microsoft 365 tenants simultaneously.
                Set up takes 5-10 minutes, then each deployment is just 2-3 minutes.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/welcome"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Get Started
                </Link>
                <Link
                  href="/welcome"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300 font-medium rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  Learn More
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Total Tenants"
          value={stats?.totalTenants ?? '-'}
          color="blue"
          href="/tenants"
        />
        <StatsCard
          title="Active Deployments"
          value={stats?.activeDeployments ?? '-'}
          color="yellow"
          href="/deployments?filter=active"
        />
        <StatsCard
          title="Completed Today"
          value={stats?.completedToday ?? '-'}
          color="green"
          href="/deployments"
        />
        <StatsCard
          title="Issues"
          value={stats?.batchesWithFailures ?? '-'}
          color="red"
          href="/deployments?filter=issues"
        />
      </div>

      {/* Pending Approvals Alert */}
      {pendingApprovals?.deployments?.length > 0 && (
        <div className="mb-6 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-purple-900 dark:text-purple-100">
                  {pendingApprovals.deployments.length} deployment{pendingApprovals.deployments.length !== 1 ? 's' : ''} awaiting approval
                </h3>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  Review and approve these deployments to continue
                </p>
              </div>
            </div>
            <Link
              href="/deployments?status=awaiting_approval"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
            >
              Review Approvals
            </Link>
          </div>
          {/* List first 3 pending approvals */}
          <div className="mt-4 space-y-2">
            {pendingApprovals.deployments.slice(0, 3).map((d: DeploymentJob) => (
              <Link
                key={d.id}
                href={`/deployments/${d.id}`}
                className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg border border-purple-100 dark:border-purple-900 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{d.solutionName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {d.totalTenants} tenant{d.totalTenants !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="text-xs text-purple-600 dark:text-purple-400">Review →</span>
              </Link>
            ))}
            {pendingApprovals.deployments.length > 3 && (
              <p className="text-xs text-purple-600 dark:text-purple-400 text-center">
                +{pendingApprovals.deployments.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/agents/new"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">+</span>
            <span className="font-medium">New Agent</span>
          </Link>
          <Link
            href="/deployments/new"
            className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">+</span>
            <span className="font-medium">New Deployment</span>
          </Link>
          <Link
            href="/tenants"
            className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg p-4 text-center transition-colors"
          >
            <span className="text-2xl block mb-2">&#9881;</span>
            <span className="font-medium">Manage Tenants</span>
          </Link>
        </div>
      </div>

      {/* Recent Deployments */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Recent Deployments
          </h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {deploymentsError ? (
            <p className="p-4 text-red-600 dark:text-red-400">Failed to load deployments</p>
          ) : !recentDeployments ? (
            <p className="p-4 text-gray-500 dark:text-gray-400">Loading...</p>
          ) : deployments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">No deployments yet</p>
              <Link
                href="/welcome"
                className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                Get started with your first deployment →
              </Link>
            </div>
          ) : (
            deployments.map((deployment: DeploymentJob) => (
              <DeploymentCard key={deployment.id} deployment={deployment} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
