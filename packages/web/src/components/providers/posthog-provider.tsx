'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHogClient, posthog, isPostHogEnabled } from '@/lib/posthog-client'

/**
 * PostHog Provider Component
 *
 * Initializes PostHog on the client and tracks page views.
 * Wrap your app with this provider to enable analytics.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Initialize PostHog on mount
  useEffect(() => {
    initPostHogClient()
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (!isPostHogEnabled()) return
    if (typeof window === 'undefined') return

    // Build the full URL for tracking
    const url = window.origin + pathname
    const search = searchParams.toString()
    const fullUrl = search ? `${url}?${search}` : url

    // Capture pageview with current URL
    posthog.capture('$pageview', {
      $current_url: fullUrl,
    })
  }, [pathname, searchParams])

  return <>{children}</>
}

/**
 * PostHog PageView component (alternative to provider-based tracking)
 * Use this if you need more control over when page views are tracked
 */
export function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isPostHogEnabled()) return
    if (typeof window === 'undefined') return

    const url = window.origin + pathname
    const search = searchParams.toString()
    const fullUrl = search ? `${url}?${search}` : url

    posthog.capture('$pageview', {
      $current_url: fullUrl,
    })
  }, [pathname, searchParams])

  return null
}
