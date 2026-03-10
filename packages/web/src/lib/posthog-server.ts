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

// PostHog Server-side Analytics
// This file should ONLY be imported in server components and API routes
// Do NOT import this in 'use client' components

import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "./posthog-client";

// ============================================================================
// Configuration
// ============================================================================

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// Check if PostHog is configured
export const isPostHogEnabled = () => Boolean(POSTHOG_KEY);

// ============================================================================
// Server-side PostHog Client
// ============================================================================

let serverClient: PostHog | null = null;

export function getServerPostHog(): PostHog | null {
  if (!isPostHogEnabled()) return null;

  if (!serverClient) {
    serverClient = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Flush events every 10 seconds or when 20 events are queued
      flushAt: 20,
      flushInterval: 10000,
    });
  }

  return serverClient;
}

// Graceful shutdown - call this on server shutdown
export async function shutdownPostHog() {
  if (serverClient) {
    await serverClient.shutdown();
    serverClient = null;
  }
}

// ============================================================================
// Server-side tracking helpers
// ============================================================================

interface ServerTrackOptions {
  distinctId: string;
  properties?: Record<string, unknown>;
}

/**
 * Track an event from server-side code (API routes, server actions)
 */
export function serverTrackEvent(event: AnalyticsEvent, options: ServerTrackOptions) {
  const client = getServerPostHog();
  if (!client) return;

  const { distinctId, properties = {} } = options;

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      timestamp: new Date().toISOString(),
      source: "server",
    },
  });
}

/**
 * Track a server-side deployment event
 */
export function serverTrackDeployment(
  event: "deployment_created" | "deployment_completed" | "deployment_failed" | "deployment_retried",
  deployment: {
    deploymentId: string;
    solutionName?: string;
    tenantCount?: number;
    status?: string;
    error?: string;
  },
  userId?: string
) {
  serverTrackEvent(event, {
    distinctId: userId || `server-${deployment.deploymentId}`,
    properties: {
      deployment_id: deployment.deploymentId,
      solution_name: deployment.solutionName,
      tenant_count: deployment.tenantCount,
      status: deployment.status,
      error: deployment.error,
    },
  });
}

/**
 * Track a server-side error
 */
export function serverTrackError(
  error: Error | string,
  context: {
    endpoint?: string;
    method?: string;
    userId?: string;
    [key: string]: unknown;
  }
) {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : undefined;

  serverTrackEvent("api_error", {
    distinctId: context.userId || "anonymous",
    properties: {
      error_message: errorMessage,
      error_stack: errorStack,
      ...context,
    },
  });
}
