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

// PostHog Analytics - Main Entry Point
//
// IMPORTANT: Import guidelines
// - Client components ('use client'): import from '@/lib/posthog-client'
// - Server components / API routes: import from '@/lib/posthog-server'
//
// This file re-exports client functions for convenience,
// but server-side functions must be imported from posthog-server directly.

// Re-export all client-side functions (safe for both client and server)
export {
  initPostHogClient,
  posthog,
  isPostHogEnabled,
  trackEvent,
  trackDeployment,
  trackError,
  identifyUser,
  resetUser,
  type AnalyticsEvent,
} from "./posthog-client";

// Note: Server-side functions must be imported directly from '@/lib/posthog-server'
// to avoid bundling posthog-node in client bundles.
// Example: import { serverTrackEvent } from '@/lib/posthog-server'
