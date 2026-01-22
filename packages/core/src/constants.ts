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
