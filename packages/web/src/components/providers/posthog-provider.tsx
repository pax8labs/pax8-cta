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

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHogClient, posthog, isPostHogEnabled } from "@/lib/posthog-client";

/**
 * Internal component that uses useSearchParams
 * Must be wrapped in Suspense to avoid hydration issues
 */
function PostHogPageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track page views on route change
  useEffect(() => {
    if (!isPostHogEnabled()) return;
    if (typeof window === "undefined") return;

    // Build the full URL for tracking
    const url = window.origin + pathname;
    const search = searchParams.toString();
    const fullUrl = search ? `${url}?${search}` : url;

    // Capture pageview with current URL
    posthog.capture("$pageview", {
      $current_url: fullUrl,
    });
  }, [pathname, searchParams]);

  return null;
}

/**
 * PostHog Provider Component
 *
 * Initializes PostHog on the client and tracks page views.
 * Wrap your app with this provider to enable analytics.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Initialize PostHog on mount
  useEffect(() => {
    initPostHogClient();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageTracker />
      </Suspense>
      {children}
    </>
  );
}

/**
 * PostHog PageView component (alternative to provider-based tracking)
 * Use this if you need more control over when page views are tracked
 */
export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isPostHogEnabled()) return;
    if (typeof window === "undefined") return;

    const url = window.origin + pathname;
    const search = searchParams.toString();
    const fullUrl = search ? `${url}?${search}` : url;

    posthog.capture("$pageview", {
      $current_url: fullUrl,
    });
  }, [pathname, searchParams]);

  return null;
}
