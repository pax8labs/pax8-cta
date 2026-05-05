/**
 * Copyright 2024 Pax8, Inc.
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

import chalk from "chalk";

/**
 * Shared formatting utilities for CLI output
 */

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format a date string as a human-readable "time ago" string
 */
export function formatTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return "just now";
}

/**
 * Format a duration in milliseconds as a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Calculate and format duration between two date strings
 */
export function calculateDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return "-";

  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;

  return formatDuration(durationMs);
}

// ============================================================================
// Status Formatting
// ============================================================================

/**
 * Deployment status type
 */
export type DeploymentStatus =
  | "completed"
  | "failed"
  | "in_progress"
  | "pending"
  | "scheduled"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "rolling_back"
  | "rolled_back";

/**
 * Format a deployment status with color and icon
 * @param status - The deployment status
 * @param style - 'default' for standard labels, 'tracking' for the per-deployment
 *               tracking view (slightly different verbiage / icons for the
 *               progress-oriented status table)
 */
export function formatStatus(status: string, style: "default" | "tracking" = "default"): string {
  if (style === "tracking") {
    switch (status) {
      case "completed":
        return chalk.green("✓ Completed");
      case "failed":
        return chalk.red("✗ Failed");
      case "in_progress":
        return chalk.yellow("● In Progress");
      case "pending":
        return chalk.gray("○ Queued");
      case "scheduled":
        return chalk.cyan("◷ Scheduled");
      case "awaiting_approval":
        return chalk.magenta("⊙ Awaiting Approval");
      case "approved":
        return chalk.green("✓ Approved");
      case "rejected":
        return chalk.red("✗ Rejected");
      case "cancelled":
        return chalk.gray("⊘ Cancelled");
      case "rolling_back":
        return chalk.yellow("↩ Rolling Back");
      case "rolled_back":
        return chalk.blue("↩ Rolled Back");
      default:
        return status;
    }
  }

  // Default style
  switch (status) {
    case "completed":
      return chalk.green("✓ Completed");
    case "failed":
      return chalk.red("✗ Failed");
    case "in_progress":
      return chalk.yellow("● In Progress");
    case "pending":
      return chalk.gray("○ Pending");
    case "scheduled":
      return chalk.cyan("◷ Scheduled");
    case "awaiting_approval":
      return chalk.magenta("⊙ Awaiting Approval");
    case "approved":
      return chalk.green("✓ Approved");
    case "rejected":
      return chalk.red("✗ Rejected");
    case "cancelled":
      return chalk.gray("⊘ Cancelled");
    case "rolling_back":
      return chalk.yellow("↩ Rolling Back");
    case "rolled_back":
      return chalk.blue("↩ Rolled Back");
    default:
      return status;
  }
}

// ============================================================================
// String Truncation
// ============================================================================

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Truncate an ID string (defaults to 15 chars for UUIDs)
 */
export function truncateId(id: string, maxLength: number = 15): string {
  if (id.length <= maxLength) return id;
  return id.slice(0, maxLength) + "...";
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Safely format an error to a string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
