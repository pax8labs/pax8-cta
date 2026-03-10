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
import { X, RefreshCw, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { TenantHealthDetail } from "@agentsync/core";

interface TenantHealthDetailProps {
  tenantId: string;
  onClose: () => void;
}

export function TenantHealthDetail({ tenantId, onClose }: TenantHealthDetailProps) {
  const [data, setData] = useState<TenantHealthDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async (refresh = false) => {
    try {
      setError(null);
      if (refresh) setRefreshing(true);

      const url = `/api/tenants/${tenantId}/health`;
      const response = await fetch(url, {
        method: refresh ? "POST" : "GET",
      });

      if (!response.ok) throw new Error("Failed to fetch health data");

      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [tenantId]);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>

          {loading && (
            <div className="p-12 text-center">
              <div className="animate-spin inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading health data...</p>
            </div>
          )}

          {error && (
            <div className="p-12">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                  Failed to Load
                </h3>
                <p className="text-red-700 dark:text-red-300">{error}</p>
                <button
                  onClick={() => fetchHealth()}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="overflow-y-auto max-h-[90vh]">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {data.tenantName}
                    </h2>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">
                        {data.healthScore}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">Health Score</span>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          data.status === "healthy"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                            : data.status === "warning"
                              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => fetchHealth(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      GDAP Status
                    </h3>
                    <div
                      className={`text-lg font-semibold ${
                        data.gdap.status === "valid"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {data.gdap.status.replace("_", " ").toUpperCase()}
                    </div>
                    {data.gdap.roles && (
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {data.gdap.roles.length} roles assigned
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Connections
                    </h3>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {data.connections.length}
                    </div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {data.connections.filter((c) => c.status === "valid").length} valid
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Recent Deployments
                    </h3>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {Math.round(data.recentSuccessRate * 100)}%
                    </div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      {data.recentDeployments.successful} / {data.recentDeployments.total}{" "}
                      successful
                    </div>
                  </div>
                </div>

                {data.issues.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Issues ({data.issues.length})
                    </h3>
                    <div className="space-y-3">
                      {data.issues.map((issue, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-lg border ${
                            issue.severity === "critical" || issue.severity === "error"
                              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                              : issue.severity === "warning"
                                ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          }`}
                        >
                          <div className="font-medium text-gray-900 dark:text-white mb-1">
                            {issue.message}
                          </div>
                          {issue.resolution && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                              💡 {issue.resolution}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.recommendations.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Recommendations
                    </h3>
                    <ul className="space-y-2">
                      {data.recommendations.map((rec, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-gray-700 dark:text-gray-300"
                        >
                          <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.recentDeploymentHistory.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Recent Deployment History
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                      <div className="space-y-2">
                        {data.recentDeploymentHistory.slice(0, 5).map((deployment) => (
                          <div
                            key={deployment.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {deployment.status === "success" ? (
                                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                              )}
                              <span className="text-gray-700 dark:text-gray-300">
                                {new Date(deployment.timestamp).toLocaleString()}
                              </span>
                            </div>
                            {deployment.duration && (
                              <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                                <Clock className="h-3 w-3" />
                                {deployment.duration}m
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
