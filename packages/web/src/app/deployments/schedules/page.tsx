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

import React, { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { toast } from "sonner";
import { trackEvent, trackError } from "@/lib/posthog-client";
import { FlaskSpinner } from "@/components/ui/flask-spinner";
import { ScheduleForm } from "@/components/schedules/ScheduleForm";
import { Clock, Plus, Trash2, Edit, Play, Pause, Calendar } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Schedule {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  nextRun: string | null;
  enabled?: boolean;
  lastRun?: string | null;
  status?: "active" | "paused";
}

interface SchedulesResponse {
  enabled: boolean;
  cron?: string;
  cronDescription?: string;
  timezone?: string;
  nextRuns?: string[];
  registeredSchedules: Schedule[];
  message?: string;
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatRelativeTime(dateString: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 0) return "Past due";
  if (diffMins < 60) return `in ${diffMins}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays < 7) return `in ${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SchedulesPage() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { data, error, mutate, isLoading } = useSWR<SchedulesResponse>("/api/schedules", fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  const handleDeleteSchedule = async (scheduleId: string, scheduleName: string) => {
    if (!confirm(`Are you sure you want to delete schedule "${scheduleName}"?`)) {
      return;
    }

    try {
      const res = await fetch("/api/schedules", {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete schedule");
      }

      toast.success(`Schedule "${scheduleName}" deleted`);
      trackEvent("schedule_deleted" as any);
      mutate();
    } catch (error) {
      console.error("Delete schedule error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete schedule");
      trackError(error instanceof Error ? error : String(error), {
        action: "delete_schedule",
        scheduleId,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FlaskSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="text-red-600 dark:text-red-400">Failed to load schedules</div>
        <button
          onClick={() => mutate()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const schedules = data?.registeredSchedules || [];
  const hasSchedules = schedules.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Calendar className="w-8 h-8 text-blue-600" />
            Scheduled Deployments
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Automate deployments with recurring schedules
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Schedule
        </button>
      </div>

      {/* Empty State */}
      {!hasSchedules && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="flex justify-center mb-4">
            <Clock className="w-16 h-16 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No scheduled deployments
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Create a schedule to automate deployments at specific times
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Your First Schedule
          </button>
        </div>
      )}

      {/* Schedules List */}
      {hasSchedules && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Schedule Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cron Expression
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Next Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {schedules.map((schedule) => (
                <tr
                  key={schedule.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {schedule.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {schedule.timezone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="px-2 py-1 bg-gray-100 dark:bg-gray-900 rounded text-xs font-mono text-gray-700 dark:text-gray-300">
                      {schedule.cron}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatDateTime(schedule.nextRun)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(schedule.nextRun)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {schedule.lastRun ? formatDateTime(schedule.lastRun) : "Never"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        schedule.enabled !== false
                          ? "bg-emerald-50 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
                          : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          schedule.enabled !== false ? "bg-emerald-500" : "bg-gray-400"
                        }`}
                      />
                      {schedule.enabled !== false ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {}}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="Edit schedule"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id, schedule.name || "")}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Delete schedule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showCreateForm && (
        <ScheduleForm
          onClose={() => setShowCreateForm(false)}
          onSave={() => {
            mutate();
            setShowCreateForm(false);
          }}
        />
      )}

      {/* Info Card */}
      {data?.enabled && data.cronDescription && (
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Global Schedule Configuration
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Cron:</strong>{" "}
                <code className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded">
                  {data.cron}
                </code>
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                {data.cronDescription}
              </p>
              {data.nextRuns && data.nextRuns.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                    Next 5 runs:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.nextRuns.map((run, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded"
                      >
                        {formatDateTime(run)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
