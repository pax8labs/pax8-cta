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
} from './posthog-client'

// Note: Server-side functions must be imported directly from '@/lib/posthog-server'
// to avoid bundling posthog-node in client bundles.
// Example: import { serverTrackEvent } from '@/lib/posthog-server'
