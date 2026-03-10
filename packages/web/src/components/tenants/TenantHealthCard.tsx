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

import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import type { TenantHealth } from "@agentsync/core";

interface TenantHealthCardProps {
  tenant: TenantHealth;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle,
    iconColor: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    label: "Healthy",
    labelColor: "text-green-700 dark:text-green-300",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-200 dark:border-yellow-800",
    label: "Warning",
    labelColor: "text-yellow-700 dark:text-yellow-300",
  },
  critical: {
    icon: AlertCircle,
    iconColor: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    label: "Critical",
    labelColor: "text-red-700 dark:text-red-300",
  },
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
};

export function TenantHealthCard({ tenant, onClick }: TenantHealthCardProps) {
  const config = STATUS_CONFIG[tenant.status];
  const Icon = config.icon;

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 hover:shadow-lg dark:hover:shadow-gray-900/70 transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-200 dark:hover:border-blue-700 p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {tenant.tenantName}
          </h3>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.border} border`}
          >
            <Icon className={`h-4 w-4 ${config.iconColor}`} />
            <span className={`text-sm font-medium ${config.labelColor}`}>{config.label}</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${getScoreColor(tenant.healthScore)}`}>
            {tenant.healthScore}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Health Score</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4 py-4 border-t border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div
            className={`text-sm font-medium ${
              tenant.gdapStatus === "valid"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {tenant.gdapStatus === "valid" ? "✓" : "✗"}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">GDAP</div>
        </div>
        <div className="text-center">
          <div
            className={`text-sm font-medium ${
              tenant.connectionsStatus === "valid"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {tenant.connectionsStatus === "valid" ? "✓" : "✗"}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Connections</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {Math.round(tenant.recentSuccessRate * 100)}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Success</div>
        </div>
      </div>

      {tenant.issues.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {tenant.issues.length} Issue{tenant.issues.length > 1 ? "s" : ""}
          </div>
          {tenant.issues.slice(0, 2).map((issue, idx) => (
            <div
              key={idx}
              className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2"
            >
              <span className="text-yellow-600 dark:text-yellow-400 mt-0.5">•</span>
              <span className="line-clamp-1">{issue.message}</span>
            </div>
          ))}
          {tenant.issues.length > 2 && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              +{tenant.issues.length - 2} more
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          No issues detected
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div>Last checked: {new Date(tenant.lastChecked).toLocaleTimeString()}</div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
        >
          View Details →
        </button>
      </div>
    </div>
  );
}
