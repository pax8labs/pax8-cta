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

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { FlaskSpinner } from "@/components/ui/flask-spinner";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Delay before showing loading spinner to avoid flash on fast loads
const LOADING_DELAY_MS = 200;

interface DeployedAgent {
  solutionName: string;
  version: string;
  deployedAt: string;
  status: "active" | "failed" | "updating";
}

interface Tenant {
  name: string;
  tenantId: string;
  environmentUrl: string;
  tags?: string[];
  enabled: boolean;
  metadata?: Record<string, unknown>;
  deployedAgents?: DeployedAgent[];
}

export default function TenantsPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR("/api/tenants", fetcher);
  const { data: tagsData } = useSWR("/api/tenants/tags", fetcher);

  const [tagFilter, setTagFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);
  const [showDisableWarning, setShowDisableWarning] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<string | null>(null);
  const [showSpinner, setShowSpinner] = useState(false);

  // Delay showing spinner to avoid flash on fast loads
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowSpinner(true), LOADING_DELAY_MS);
      return () => clearTimeout(timer);
    } else {
      setShowSpinner(false);
    }
  }, [isLoading]);

  const allTags: string[] = tagsData?.tags ?? [];
  const tenants: Tenant[] = data?.tenants ?? [];

  // Apply filters
  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      // Tag filter
      if (tagFilter !== "all" && !tenant.tags?.includes(tagFilter)) {
        return false;
      }

      // Status filter
      if (statusFilter === "enabled" && !tenant.enabled) return false;
      if (statusFilter === "disabled" && tenant.enabled) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = tenant.name.toLowerCase().includes(query);
        const matchesId = tenant.tenantId.toLowerCase().includes(query);
        const matchesUrl = tenant.environmentUrl.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesUrl) return false;
      }

      return true;
    });
  }, [tenants, tagFilter, statusFilter, searchQuery]);

  const enabledCount = tenants.filter((t) => t.enabled).length;
  const totalCount = tenants.length;

  const handleRowClick = (tenantId: string) => {
    router.push(`/tenants/${tenantId}`);
  };

  const handleToggleExpand = (e: React.MouseEvent, tenantId: string) => {
    e.stopPropagation();
    setExpandedTenantId(expandedTenantId === tenantId ? null : tenantId);
  };

  const handleToggleEnabled = async (tenant: Tenant) => {
    if (tenant.enabled) {
      setShowDisableWarning(tenant.tenantId);
    } else {
      confirmToggleEnabled(tenant);
    }
  };

  const confirmToggleEnabled = async (tenant: Tenant) => {
    setIsTogglingStatus(tenant.tenantId);
    try {
      const response = await fetch(`/api/tenants/${tenant.tenantId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !tenant.enabled }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      toast.success(`Tenant ${tenant.enabled ? "disabled" : "enabled"}`);
      mutate("/api/tenants");
      setShowDisableWarning(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update tenant status");
    } finally {
      setIsTogglingStatus(null);
    }
  };

  if (error) {
    return (
      <div className="bg-rose-50 dark:bg-rose-900 border border-rose-200 dark:border-rose-700 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-100 dark:bg-rose-800 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-rose-600 dark:text-rose-300"
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
            <p className="text-rose-700 dark:text-rose-300 font-medium">
              Failed to load tenant configuration
            </p>
            <p className="text-rose-600 dark:text-rose-400 text-sm">
              Make sure the config file exists.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state only after delay (prevents flash on fast loads)
  if (isLoading && showSpinner) {
    return (
      <div className="flex items-center justify-center py-12">
        <FlaskSpinner size="md" message="Loading tenants..." />
      </div>
    );
  }

  // Show nothing during initial load delay (prevents flash)
  if (isLoading) {
    return <div className="py-12" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Tenants</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-1">
            Manage your customer tenant configurations
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 shadow-sm">
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {enabledCount}
          </span>
          <span className="text-slate-400 dark:text-gray-400 text-lg"> / {totalCount}</span>
          <p className="text-xs text-slate-500 dark:text-gray-400">enabled tenants</p>
        </div>
      </div>

      {/* Source Environment */}
      <div className="bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-700 dark:text-gray-200">
              Source Environment
            </h2>
            <p className="text-slate-500 dark:text-gray-400 text-xs mt-0.5">
              Agents are deployed from this environment to customer tenants
            </p>
          </div>
          <code className="text-sm text-slate-600 dark:text-gray-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-mono">
            {data?.source?.environmentUrl}
          </code>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tag Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-gray-300">Tag:</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm font-medium text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-gray-300">Status:</span>
            <div className="flex gap-1">
              {[
                { value: "all", label: "All" },
                { value: "enabled", label: "Enabled" },
                { value: "disabled", label: "Disabled" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value as typeof statusFilter)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === option.value
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      : "bg-slate-50 dark:bg-gray-900 text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter summary */}
        {(tagFilter !== "all" || statusFilter !== "all" || searchQuery) && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-gray-700 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-gray-400">
              Showing{" "}
              <span className="font-medium text-slate-900 dark:text-white">
                {filteredTenants.length}
              </span>{" "}
              of {totalCount} tenants
            </span>
            <button
              onClick={() => {
                setTagFilter("all");
                setStatusFilter("all");
                setSearchQuery("");
              }}
              className="text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Tenant List */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
          <thead className="bg-slate-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Tenant
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Tenant ID
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Environment
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
            {filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-slate-400 dark:text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                  </div>
                  <p className="text-slate-500 dark:text-gray-400 font-medium">
                    No tenants match your filters
                  </p>
                  <p className="text-slate-400 dark:text-gray-500 text-sm mt-1">
                    Try adjusting your search or filter criteria
                  </p>
                </td>
              </tr>
            ) : (
              filteredTenants.map((tenant) => {
                const isExpanded = expandedTenantId === tenant.tenantId;
                return (
                  <React.Fragment key={tenant.tenantId}>
                    <tr
                      onClick={() => handleRowClick(tenant.tenantId)}
                      className="hover:bg-slate-50 dark:hover:bg-gray-900 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => handleToggleExpand(e, tenant.tenantId)}
                            className="text-slate-400 dark:text-gray-400 hover:text-slate-600 dark:hover:text-gray-300 transition-transform"
                            style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                          >
                            <svg
                              className="w-4 h-4"
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
                          </button>
                          <div className="w-8 h-8 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center group-hover:from-blue-100 group-hover:to-blue-200 dark:group-hover:from-blue-900 dark:group-hover:to-blue-800 transition-colors">
                            <span className="text-sm font-semibold text-slate-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-300">
                              {tenant.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {tenant.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm text-slate-600 dark:text-gray-300 bg-slate-100 dark:bg-gray-800 px-2.5 py-1 rounded-md font-mono">
                          {tenant.tenantId.slice(0, 8)}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-gray-300">
                        {new URL(tenant.environmentUrl).hostname}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1.5 flex-wrap">
                          {tenant.tags?.map((tag: string) => (
                            <span
                              key={tag}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-200"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {tenant.enabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full"></span>
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
                            <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-gray-500 rounded-full"></span>
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(tenant.tenantId);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-lg transition-colors"
                        >
                          Manage
                          <svg
                            className="w-4 h-4"
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
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Row */}
                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-gray-900">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="ml-7 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Quick Actions */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                              <h4 className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-3">
                                Quick Actions
                              </h4>
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleEnabled(tenant);
                                  }}
                                  disabled={isTogglingStatus === tenant.tenantId}
                                  className={`w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left ${
                                    tenant.enabled
                                      ? "bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800"
                                      : "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800"
                                  } disabled:opacity-50`}
                                >
                                  {isTogglingStatus === tenant.tenantId
                                    ? "Processing..."
                                    : tenant.enabled
                                      ? "Disable Tenant"
                                      : "Enable Tenant"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/deployments/new?tenants=${tenant.tenantId}`);
                                  }}
                                  className="w-full px-3 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg transition-colors text-left"
                                >
                                  Deploy Agent
                                </button>
                              </div>
                            </div>

                            {/* Deployed Agents */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                              <h4 className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-3">
                                Deployed Agents
                                {tenant.deployedAgents && (
                                  <span className="ml-2 text-xs text-slate-400 dark:text-gray-400">
                                    ({tenant.deployedAgents.length})
                                  </span>
                                )}
                              </h4>
                              {tenant.deployedAgents && tenant.deployedAgents.length > 0 ? (
                                <div className="space-y-2">
                                  {tenant.deployedAgents.slice(0, 3).map((agent) => (
                                    <div
                                      key={agent.solutionName}
                                      className="flex items-center justify-between text-sm"
                                    >
                                      <span className="text-slate-700 dark:text-gray-200">
                                        {agent.solutionName}
                                      </span>
                                      <span
                                        className={`text-xs ${
                                          agent.status === "active"
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : agent.status === "updating"
                                              ? "text-amber-600 dark:text-amber-400"
                                              : "text-rose-600 dark:text-rose-400"
                                        }`}
                                      >
                                        {agent.status === "active"
                                          ? "Active"
                                          : agent.status === "updating"
                                            ? "Updating"
                                            : "Failed"}
                                      </span>
                                    </div>
                                  ))}
                                  {tenant.deployedAgents.length > 3 && (
                                    <p className="text-xs text-slate-400 dark:text-gray-400">
                                      +{tenant.deployedAgents.length - 3} more
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-slate-400 dark:text-gray-400">
                                  No agents deployed
                                </p>
                              )}
                            </div>

                            {/* Metadata Preview */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                              <h4 className="text-sm font-medium text-slate-700 dark:text-gray-200 mb-3">
                                Info
                              </h4>
                              <div className="space-y-2 text-sm">
                                {(() => {
                                  const meta = tenant.metadata as
                                    | Record<string, string | number | undefined>
                                    | undefined;
                                  const hasContent =
                                    meta?.industry || meta?.contractTier || meta?.employees;
                                  if (!hasContent)
                                    return (
                                      <p className="text-slate-400 dark:text-gray-400">
                                        No metadata
                                      </p>
                                    );
                                  return (
                                    <>
                                      {meta?.industry && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500 dark:text-gray-400">
                                            Industry
                                          </span>
                                          <span className="text-slate-700 dark:text-gray-200">
                                            {String(meta.industry)}
                                          </span>
                                        </div>
                                      )}
                                      {meta?.contractTier && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500 dark:text-gray-400">
                                            Tier
                                          </span>
                                          <span className="text-slate-700 dark:text-gray-200">
                                            {String(meta.contractTier)}
                                          </span>
                                        </div>
                                      )}
                                      {meta?.employees && (
                                        <div className="flex justify-between">
                                          <span className="text-slate-500 dark:text-gray-400">
                                            Employees
                                          </span>
                                          <span className="text-slate-700 dark:text-gray-200">
                                            {String(meta.employees)}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-400 dark:text-gray-400 text-center">
        Click a row to view tenant details and deployed agents
      </div>

      {/* Disable Warning Modal */}
      {showDisableWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-6 h-6 text-amber-600 dark:text-amber-300"
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
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Disable Tenant
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    This will affect deployments
                  </p>
                </div>
              </div>

              {(() => {
                const tenant = tenants.find((t) => t.tenantId === showDisableWarning);
                if (!tenant) return null;
                return (
                  <>
                    <div className="bg-amber-50 dark:bg-amber-900 rounded-lg p-4 mb-4 border border-amber-100 dark:border-amber-800">
                      <p className="text-sm text-slate-700 dark:text-gray-200">
                        You are about to disable{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {tenant.name}
                        </span>
                        .
                      </p>
                      <ul className="mt-3 text-sm text-slate-600 dark:text-gray-300 space-y-1.5">
                        <li className="flex items-start gap-2">
                          <svg
                            className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0"
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
                          This tenant will be excluded from future deployments
                        </li>
                        <li className="flex items-start gap-2">
                          <svg
                            className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          You can re-enable this tenant at any time
                        </li>
                      </ul>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-gray-300">
                      Are you sure you want to disable this tenant?
                    </p>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-3 p-4 bg-slate-50 dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700">
              <button
                onClick={() => setShowDisableWarning(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const tenant = tenants.find((t) => t.tenantId === showDisableWarning);
                  if (tenant) confirmToggleEnabled(tenant);
                }}
                disabled={isTogglingStatus !== null}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 dark:bg-amber-700 rounded-lg hover:bg-amber-700 dark:hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {isTogglingStatus ? "Disabling..." : "Yes, Disable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
