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

/**
 * Public PostHog project key for Pax8 CTA telemetry.
 *
 * This key is intentionally checked into source. PostHog client keys
 * (`phc_*`) are public by design — they identify the project on the
 * server side, which handles rate-limiting and scoping. Compare to
 * Stripe publishable keys (`pk_*`) or Sentry DSNs.
 *
 * Override at runtime via the `PAX8_CTA_POSTHOG_KEY` environment variable
 * (useful for local development, staging, or routing telemetry to a
 * private test project).
 *
 * Telemetry is opt-in regardless of whether this key resolves —
 * users must explicitly run `pax8-cta telemetry on` first.
 */
export const POSTHOG_PROJECT_KEY = "phc_XKIa0EPGDACY1p4Cczk6IWXFa3n9E7htSxcVIg70rRp";

/**
 * Identifies which Pax8 CLI is emitting events when the PostHog project
 * is shared across multiple Pax8 products. Set as the `app` property on
 * every captured event so dashboards can filter cleanly across products.
 *
 * Matches the convention used by `@pax8/cli` (the Pax8 Marketplace CLI),
 * which tags its events with `app: "pax8-cli"`.
 */
export const TELEMETRY_APP = "pax8-cta";

/**
 * Resolve the effective PostHog key at runtime, honoring the
 * env-var override before falling back to the baked-in key.
 *
 * Exported for testing — callers should use the resolved `POSTHOG_KEY`
 * from telemetry.ts in normal code paths.
 */
export function resolveTelemetryKey(): string {
  return (
    process.env.PAX8_CTA_POSTHOG_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY || POSTHOG_PROJECT_KEY
  );
}
