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

/**
 * Centralized constants for the AgentSync application
 *
 * All magic numbers, timeouts, and configuration values should be defined here
 * to ensure consistency and maintainability across the codebase.
 */

// ============================================================================
// TIME CONSTANTS (in milliseconds)
// ============================================================================

/** One second in milliseconds */
export const ONE_SECOND_MS = 1000;

/** One minute in milliseconds */
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;

/** One hour in milliseconds */
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** One day in milliseconds */
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** One week in milliseconds */
export const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/** One month in milliseconds (approximate: 30 days) */
export const ONE_MONTH_MS = 30 * ONE_DAY_MS;

// ============================================================================
// AZURE AD / GDAP ROLE IDS
// ============================================================================

/** Power Platform Administrator role definition ID (Azure AD built-in role) */
export const POWER_PLATFORM_ADMIN_ROLE_ID = "11648597-926c-4cf3-9c36-bcebb0ba8dcc";

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/** Buffer time before token expiry to trigger a refresh (5 minutes) */
export const TOKEN_REFRESH_BUFFER_MS = 5 * ONE_MINUTE_MS;

/** Default cache TTL for secrets manager (5 minutes) */
export const DEFAULT_SECRETS_CACHE_TTL_MS = 5 * ONE_MINUTE_MS;

// ============================================================================
// SCHEDULER
// ============================================================================

/** Maximum iterations when searching for next cron match (~1 year of minutes) */
export const MAX_SCHEDULE_ITERATIONS = 366 * 24 * 60;

// ============================================================================
// DEPLOYMENT
// ============================================================================

/** Default max concurrent tenant deployments */
export const DEFAULT_DEPLOYMENT_CONCURRENCY = 3;

// ============================================================================
// HEALTH CHECK
// ============================================================================

/** Duration to cache health check results (15 minutes) */
export const HEALTH_CHECK_CACHE_DURATION_MS = 15 * ONE_MINUTE_MS;

/** Default number of retries for health check endpoint requests */
export const DEFAULT_HEALTH_CHECK_RETRIES = 3;

/** Default expected HTTP status for health check endpoints */
export const DEFAULT_HEALTH_CHECK_EXPECTED_STATUS = 200;

// ============================================================================
// WEBHOOK
// ============================================================================

/** Default number of retries for webhook delivery */
export const DEFAULT_WEBHOOK_RETRIES = 3;

// ============================================================================
// MEMORY QUEUE
// ============================================================================

/** Default concurrency for in-memory queue processing */
export const DEFAULT_MEMORY_QUEUE_CONCURRENCY = 5;

/** Default max retries for in-memory queue jobs */
export const DEFAULT_MEMORY_QUEUE_RETRIES = 3;

/** Default retry delay for in-memory queue jobs (5 seconds) */
export const DEFAULT_MEMORY_QUEUE_RETRY_DELAY_MS = 5 * ONE_SECOND_MS;

// ============================================================================
// DATABASE
// ============================================================================

/** Default max retries for SQLite busy/locked errors */
export const DEFAULT_DB_RETRY_COUNT = 3;

/** Base delay for exponential backoff on database retries (100ms) */
export const DB_RETRY_BASE_DELAY_MS = 100;

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

/** Initial delay before retrying failed jobs (10 seconds) */
export const JOB_RETRY_INITIAL_DELAY_MS = 10 * ONE_SECOND_MS;

/** How long to keep completed jobs in the queue (24 hours) */
export const COMPLETED_JOB_RETENTION_MS = ONE_DAY_MS;

/** Maximum number of completed jobs to keep */
export const COMPLETED_JOB_MAX_COUNT = 1000;

/** How long to keep failed jobs in the queue (7 days) */
export const FAILED_JOB_RETENTION_MS = ONE_WEEK_MS;

/** How long to keep scheduled job records (7 days) */
export const SCHEDULED_JOB_RETENTION_MS = ONE_WEEK_MS;

/** Maximum scheduled jobs to keep */
export const SCHEDULED_JOB_MAX_COUNT = 100;

/** How long to keep failed scheduled job records (30 days) */
export const SCHEDULED_FAILED_JOB_RETENTION_MS = ONE_MONTH_MS;

/** Default number of retry attempts for deployment jobs */
export const DEFAULT_JOB_ATTEMPTS = 3;

// ============================================================================
// SOLUTION IMPORT/EXPORT
// ============================================================================

/** Default polling interval when checking import status (5 seconds) */
export const SOLUTION_IMPORT_POLL_INTERVAL_MS = 5 * ONE_SECOND_MS;

/** Default timeout for solution import operations (5 minutes) */
export const SOLUTION_IMPORT_TIMEOUT_MS = 5 * ONE_MINUTE_MS;

/** Extended timeout for large solution imports (10 minutes) */
export const SOLUTION_IMPORT_EXTENDED_TIMEOUT_MS = 10 * ONE_MINUTE_MS;

/** Default timeout for rollback operations (10 minutes) */
export const ROLLBACK_TIMEOUT_MS = 10 * ONE_MINUTE_MS;

// ============================================================================
// HEALTH CHECK
// ============================================================================

/** Default timeout for health check operations (30 seconds) */
export const HEALTH_CHECK_TIMEOUT_MS = 30 * ONE_SECOND_MS;

/** Default number of retries for health checks */
export const HEALTH_CHECK_DEFAULT_RETRIES = 2;

// ============================================================================
// APPROVAL WORKFLOW
// ============================================================================

/** Default window for approval (24 hours) */
export const DEFAULT_APPROVAL_WINDOW_MS = ONE_DAY_MS;

// ============================================================================
// AUDIT LOG
// ============================================================================

/** Maximum number of audit entries to keep in memory */
export const AUDIT_LOG_MAX_ENTRIES = 10000;

// ============================================================================
// API RATE LIMITING
// ============================================================================

/** Default rate limit - max requests per duration */
export const DEFAULT_RATE_LIMIT_MAX = 10;

/** Default rate limit duration (1 minute) */
export const DEFAULT_RATE_LIMIT_DURATION_MS = ONE_MINUTE_MS;

// ============================================================================
// WORKER CONFIGURATION
// ============================================================================

/**
 * Default worker concurrency
 * Set to 3 for SQLite safety - better-sqlite3 can struggle with >3-5 concurrent writes
 * For production with high concurrency needs, use PostgreSQL instead
 */
export const DEFAULT_WORKER_CONCURRENCY = 3;

// ============================================================================
// SSE/LIVE UPDATES
// ============================================================================

/** Minimum time to display a deployment step (for UI legibility) */
export const MIN_STEP_DISPLAY_MS = 600;

/** Delay between starting tenant deployments in live view */
export const TENANT_START_STAGGER_MS = 300;

/** Maximum concurrent tenant deployments in demo mode */
export const MAX_CONCURRENT_DEMO_TENANTS = 2;

/** SSE heartbeat interval to keep connection alive (30 seconds) */
export const SSE_HEARTBEAT_INTERVAL_MS = 30 * ONE_SECOND_MS;

/** SSE connection timeout - max time before stream is closed (10 minutes) */
export const SSE_TIMEOUT_MS = 10 * ONE_MINUTE_MS;

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

/** Default delay between cancellation checks during step processing */
export const CANCELLATION_CHECK_INTERVAL_MS = 200;

// ============================================================================
// TIME DURATIONS (in seconds, for compatibility with parseDuration)
// ============================================================================

/** One hour in seconds (for duration strings like "1h") */
export const ONE_HOUR_SECONDS = 3600;

/** One day in seconds */
export const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;
