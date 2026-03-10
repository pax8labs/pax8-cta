/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { DeploymentCard } from "@/components/DeploymentCard";
import { StatsCard } from "@/components/StatsCard";
import { FlaskSpinner } from "@/components/ui/flask-spinner";
import { AgentUploadModal } from "@/components/agents/AgentUploadModal";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { DeploymentJob } from "@agentsync/core";
import type { Agent } from "@/types/agent";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
};

// Delay before showing loading spinner to avoid flash on fast loads
const LOADING_DELAY_MS = 200;

export default function Dashboard() {
  const [showSpinner, setShowSpinner] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dismissedWelcome, setDismissedWelcome, welcomeHydrated] = useLocalStorage(
    "welcomeBannerDismissed",
    false
  );
  const [dismissedClaudeBanner, setDismissedClaudeBanner, claudeHydrated] = useLocalStorage(
    "claudeBannerDismissed",
    false
  );

  const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
  } = useSWR("/api/stats", fetcher, {
    refreshInterval: 5000,
  });

  const {
    data: recentDeployments,
    error: deploymentsError,
    isLoading: deploymentsLoading,
  } = useSWR("/api/deployments?limit=5", fetcher, { refreshInterval: 5000 });

  const { data: agentsData, isLoading: agentsLoading } = useSWR("/api/agents", fetcher);

  // Fetch pending approvals - deployments awaiting approval
  const { data: pendingApprovals } = useSWR("/api/deployments?status=awaiting_approval", fetcher, {
    refreshInterval: 5000,
  });

  const deployments = recentDeployments?.deployments ?? [];

  // Check if user has any custom agents (indicates they've actually used the app)
  const hasCustomAgents = agentsData?.agents?.some((a: Agent) => a.isCustom) ?? false;

  // Check if there are any real (non-demo-hist) deployments
  const hasRealDeployments = deployments.some(
    (d: DeploymentJob) => !d.id?.startsWith("demo-hist-")
  );

  // Wait for all data to load before deciding on welcome banner
  const isLoading = statsLoading || deploymentsLoading || agentsLoading;

  // Mount flag to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Delay showing spinner to avoid flash on fast loads
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowSpinner(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(false);
    }
  }, [isLoading]);

  // Show welcome banner if no custom agents and no real deployments
  const isNewUser =
    !isLoading && !hasCustomAgents && !hasRealDeployments && !statsError && !deploymentsError;

  // Both banners are now hydrated - ready to render
  const isBannersReady = welcomeHydrated && claudeHydrated;

  // Show loading state while data is being fetched (only after delay)
  if (isLoading && showSpinner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <FlaskSpinner size="lg" message="Loading dashboard..." />
      </div>
    );
  }

  // Show nothing during initial load delay (prevents flash)
  if (isLoading) {
    return <div className="min-h-[60vh]" />;
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Getting started
        </Link>
      </div>

      {/* Claude Code Integration Banner */}
      {isBannersReady && !dismissedClaudeBanner && (
        <div className="mb-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800/50 rounded-lg p-3 relative">
          <button
            onClick={() => setDismissedClaudeBanner(true)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="flex items-start gap-2 pr-6">
            <div className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded flex items-center justify-center">
              <svg
                className="w-4 h-4 text-purple-600 dark:text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-white">
                  Claude Code Integration
                </h3>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                  NEW
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                Use natural language to manage deployments. Try{" "}
                <span className="font-mono text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                  "Show failed deployments"
                </span>
              </p>
              <a
                href="https://github.com/pax8labs/agentsync#-claude-code-integration"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
              >
                Learn more →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Banner for New Users */}
      {isBannersReady && isNewUser && !dismissedWelcome && (
        <div className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 relative">
          <button
            onClick={() => setDismissedWelcome(true)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                Welcome to AgentSync!
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                Deploy Copilot Studio agents to multiple Microsoft 365 tenants simultaneously. Set
                up takes 5-10 minutes, then each deployment is just 2-3 minutes.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/welcome"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
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
          value={mounted ? (stats?.totalTenants ?? "-") : "-"}
          color="blue"
          href="/tenants"
        />
        <StatsCard
          title="Active Deployments"
          value={mounted ? (stats?.activeDeployments ?? "-") : "-"}
          color="yellow"
          href="/deployments?filter=active&view=tenants"
        />
        <StatsCard
          title="Completed Today"
          value={mounted ? (stats?.completedToday ?? "-") : "-"}
          color="green"
          href="/deployments"
        />
        <StatsCard
          title="Issues"
          value={mounted ? (stats?.batchesWithFailures ?? "-") : "-"}
          color="red"
          href="/deployments?filter=issues&view=tenants"
        />
      </div>

      {/* Consolidated Attention Required Section */}
      {mounted &&
        (stats?.versionDriftCount > 0 ||
          stats?.dependencyIssuesCount > 0 ||
          pendingApprovals?.deployments?.length > 0) && (
          <div className="mb-6 bg-white dark:bg-gray-800 shadow-md rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <h2 className="font-semibold text-gray-900 dark:text-white">Attention Required</h2>
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-full">
                  {(stats?.versionDriftCount || 0) +
                    (stats?.dependencyIssuesCount || 0) +
                    (pendingApprovals?.deployments?.length || 0)}
                </span>
              </div>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {/* Version Drift */}
              {stats?.versionDriftCount > 0 && (
                <Link
                  href="/tenants?health=version_drift"
                  className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-amber-600 dark:text-amber-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {stats.versionDriftCount} tenant{stats.versionDriftCount !== 1 ? "s" : ""}{" "}
                        with outdated agents
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Not running expected version
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}

              {/* Dependency Issues */}
              {stats?.dependencyIssuesCount > 0 && (
                <Link
                  href="/tenants?health=dependency_issues"
                  className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-red-600 dark:text-red-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {stats.dependencyIssuesCount} tenant
                        {stats.dependencyIssuesCount !== 1 ? "s" : ""} with missing dependencies
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Missing connection references or environment variables
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}

              {/* Pending Approvals */}
              {pendingApprovals?.deployments?.length > 0 && (
                <Link
                  href="/deployments?status=awaiting_approval"
                  className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-4 h-4 text-purple-600 dark:text-purple-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {pendingApprovals.deployments.length} deployment
                        {pendingApprovals.deployments.length !== 1 ? "s" : ""} awaiting approval
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Review and approve to continue
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}
            </div>
          </div>
        )}

      {/* Legacy Pending Approvals Alert - Remove this whole block */}
      {false && pendingApprovals?.deployments?.length > 0 && (
        <div className="mb-6 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-purple-600 dark:text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-purple-900 dark:text-purple-100">
                  {pendingApprovals.deployments.length} deployment
                  {pendingApprovals.deployments.length !== 1 ? "s" : ""} awaiting approval
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
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {d.solutionName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {d.totalTenants} tenant{d.totalTenants !== 1 ? "s" : ""}
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
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-4 text-center transition-colors cursor-pointer"
          >
            <span className="text-2xl block mb-2">+</span>
            <span className="font-medium">New Agent</span>
          </button>
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
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Recent Deployments</h2>
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

      {/* Agent Upload Modal */}
      <AgentUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          setShowUploadModal(false);
          // Refresh agents list
          window.location.href = "/agents";
        }}
      />
    </div>
  );
}
