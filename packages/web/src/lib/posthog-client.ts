// PostHog Client-side Analytics
// This file is safe to import in client components ('use client')

import posthog from 'posthog-js'
import { createLogger } from './logger'

const logger = createLogger('PostHog')

// ============================================================================
// Configuration
// ============================================================================

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

// Check if PostHog is configured
export const isPostHogEnabled = () => Boolean(POSTHOG_KEY)

// ============================================================================
// Client-side PostHog Initialization
// ============================================================================

let clientInitialized = false

export function initPostHogClient() {
  if (typeof window === 'undefined') return
  if (clientInitialized) return
  if (!isPostHogEnabled()) {
    logger.debug('Not configured - analytics disabled')
    return
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Capture page views automatically
    capture_pageview: true,
    // Capture page leaves for session duration
    capture_pageleave: true,
    // Enable session recording
    enable_recording_console_log: true,
    // Respect Do Not Track
    respect_dnt: true,
    // Disable in development unless explicitly enabled
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_POSTHOG_DEBUG) {
        // Optionally disable in dev - comment out to test locally
        // ph.opt_out_capturing()
      }
    },
  })

  clientInitialized = true
}

// Re-export posthog for direct use
export { posthog }

// ============================================================================
// Analytics Event Types
// ============================================================================

export type AnalyticsEvent =
  // Deployment events
  | 'deployment_created'
  | 'deployment_started'
  | 'deployment_completed'
  | 'deployment_failed'
  | 'deployment_retried'
  | 'deployment_cancelled'
  // Tenant events
  | 'tenant_viewed'
  | 'tenant_enabled'
  | 'tenant_disabled'
  | 'tenants_filtered'
  // Agent events
  | 'agent_viewed'
  | 'agent_selected'
  // Navigation events
  | 'page_viewed'
  | 'tab_changed'
  | 'filter_applied'
  // Error events
  | 'error_occurred'
  | 'api_error'
  // Feature usage
  | 'bulk_action_used'
  | 'search_used'
  | 'export_clicked'

// ============================================================================
// Client-side tracking helpers
// ============================================================================

interface TrackEventOptions {
  // User identification (optional - PostHog will use anonymous ID if not provided)
  distinctId?: string
  // Event properties
  properties?: Record<string, unknown>
}

/**
 * Track an event on the client side
 */
export function trackEvent(event: AnalyticsEvent, options: TrackEventOptions = {}) {
  if (typeof window === 'undefined') return
  if (!isPostHogEnabled()) return

  const { properties = {} } = options

  posthog.capture(event, {
    ...properties,
    // Add standard properties
    timestamp: new Date().toISOString(),
    path: window.location.pathname,
    referrer: document.referrer || undefined,
  })
}

/**
 * Track a deployment event with standard deployment properties
 */
export function trackDeployment(
  event: 'deployment_created' | 'deployment_started' | 'deployment_completed' | 'deployment_failed' | 'deployment_retried',
  deployment: {
    deploymentId: string
    solutionName?: string
    tenantCount?: number
    status?: string
    error?: string
    durationMs?: number
  }
) {
  trackEvent(event, {
    properties: {
      deployment_id: deployment.deploymentId,
      solution_name: deployment.solutionName,
      tenant_count: deployment.tenantCount,
      status: deployment.status,
      error: deployment.error,
      duration_ms: deployment.durationMs,
    },
  })
}

/**
 * Track an error event
 */
export function trackError(error: Error | string, context?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : error
  const errorStack = error instanceof Error ? error.stack : undefined

  trackEvent('error_occurred', {
    properties: {
      error_message: errorMessage,
      error_stack: errorStack,
      ...context,
    },
  })
}

/**
 * Identify a user (call when user logs in or is identified)
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (!isPostHogEnabled()) return

  posthog.identify(userId, properties)
}

/**
 * Reset user identity (call on logout)
 */
export function resetUser() {
  if (typeof window === 'undefined') return
  if (!isPostHogEnabled()) return

  posthog.reset()
}
