# E2E Test Suite Review

**Date:** 2026-03-12
**Scope:** `packages/web/e2e/` (8 spec files, ~56 API routes total)

---

## Executive Summary

The e2e test suite provides reasonable coverage of core API endpoints and basic UI flows in demo mode. However, there are **significant gaps in coverage** (only ~20 of 56 API routes are tested), **flaky test patterns**, **overly permissive assertions** that mask real failures, and **CI/config mismatches** that could cause inconsistent results between local and CI runs.

**Priority breakdown:**

- **Critical (fix now):** 3 issues — CI secret mismatch, overly permissive status assertions, flaky `waitForTimeout`
- **High (fix soon):** 4 issues — missing coverage for 35+ API routes, known pre-existing failures, Firefox CI gap, potential assertion bug in `claude-skill.spec.ts`
- **Medium (improve):** 4 issues — duplicate coverage, empty `beforeEach`, SSE test weakness, demo-mode-only testing
- **Low (nice-to-have):** 3 issues — missing negative/security tests, no performance tests, no test timeout config

---

## Critical Issues

### 1. CI vs Playwright Config Secret Mismatch

**Files:** `.github/workflows/ci.yml:222`, `playwright.config.ts:35`

The CI workflow sets `NEXTAUTH_SECRET: test-secret` but `playwright.config.ts` webServer sets `NEXTAUTH_SECRET: test-secret-for-e2e-testing`. This means:

- Locally, Playwright starts the server with `test-secret-for-e2e-testing`
- In CI, the environment variable `test-secret` may override or conflict

**Fix:** Align both to the same value, preferably in `playwright.config.ts` only (since it controls the webServer env).

### 2. Overly Permissive Status Code Assertions

**File:** `deployments.spec.ts`

Several tests accept server errors (500) as passing:

```typescript
// Line 154 — cancel endpoint
expect([200, 400, 500]).toContain(response.status());

// Line 168 — retry endpoint
expect([200, 400, 404, 500]).toContain(response.status());
```

A 500 response indicates an unhandled server error and should **never** be treated as acceptable. These tests will pass silently even when the server is broken.

**Fix:** Remove 500 from accepted status arrays. If the endpoint legitimately returns different codes, test each scenario separately.

### 3. Flaky `waitForTimeout` Usage

**File:** `auth.spec.ts:23,33`, `sse.spec.ts:47`

Hardcoded `page.waitForTimeout(1000)` is a known anti-pattern that causes flaky tests:

- Too short on slow CI runners → test fails
- Too long on fast machines → wastes time
- Doesn't actually wait for the condition you care about

```typescript
// auth.spec.ts:23
await page.waitForTimeout(1000);
await expect(page.getByRole("button", { name: /Sign in with Demo Mode/i })).toBeVisible();
```

**Fix:** Replace with `expect(...).toBeVisible()` directly (Playwright auto-waits) or use `page.waitForSelector()`.

---

## High Priority Issues

### 4. Major API Coverage Gaps

**35+ of 56 API routes have zero e2e test coverage.** Here are the untested routes grouped by domain:

| Domain          | Untested Routes                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agents**      | `/api/agents/[id]`, `/api/agents/[id]/status`, `/api/agents/[id]/tags`                                                                                                                                 |
| **Deployments** | `/api/deployments/analyze`, `/api/deployments/process`, `/api/deployments/[id]/rollback`                                                                                                               |
| **Solutions**   | `/api/solutions/export`, `/api/solutions/from-url`, `/api/solutions/diff`, `/api/solutions/source`, `/api/solutions/import-from-environment`, `/api/solutions/upload`, `/api/solutions/upload/resolve` |
| **Tenants**     | `/api/tenants/[id]/connections`, `/api/tenants/[id]/environments`, `/api/tenants/[id]/health`, `/api/tenants/[id]/solutions`, `/api/tenants/health`                                                    |
| **Webhooks**    | `/api/webhooks/deploy`, `/api/webhooks/invocations`, `/api/webhooks/manage`, `/api/webhooks/status`                                                                                                    |
| **Settings**    | `/api/settings`, `/api/settings/test-notification`, `/api/settings/test-connection`                                                                                                                    |
| **Other**       | `/api/bots`, `/api/chat`, `/api/environments`, `/api/errors/report`, `/api/health/live`, `/api/openapi`, `/api/schedules`, `/api/staging-auth`, `/api/telemetry/404`                                   |

**Priority for new tests:** Webhooks (security-critical), Solutions (core workflow), Deployments rollback/analyze (operational), Settings (configuration).

### 5. Known Pre-Existing Test Failures

From `TESTING_GUIDE.md`:

> "Some approval route tests failing (not related to our changes)"
> "Some health check tests failing (not related to our changes)"
> "These should be addressed separately in #148"

These acknowledged failures erode confidence in the test suite and should be resolved.

### 6. Firefox Not Installed in CI

**Files:** `playwright.config.ts:24-26`, `.github/workflows/ci.yml:213`

`playwright.config.ts` configures both `chromium` and `firefox` projects, but CI only installs chromium:

```yaml
run: pnpm exec playwright install --with-deps chromium
```

This means Firefox tests either silently skip or fail in CI while passing locally.

**Fix:** Either install Firefox in CI or remove the Firefox project from the config.

### 7. Potential Assertion Bug in `claude-skill.spec.ts`

**File:** `claude-skill.spec.ts:27`

```typescript
const data = await response.json();
expect(data).toHaveProperty("totalDeployments");
```

The `/api/stats` endpoint returns `activeDeployments`, `completedToday`, `failedToday`, `totalTenants`, `enabledTenants` — but the test checks for `totalDeployments` which may not exist on the response. This test may be silently failing or the property was renamed.

---

## Medium Priority Issues

### 8. Duplicate Test Coverage

Several endpoints are tested redundantly across multiple spec files:

| Endpoint               | Tested In                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/stats`       | `dashboard.spec.ts`, `demo-mode.spec.ts`, `claude-skill.spec.ts` (3x)                                           |
| `GET /api/tenants`     | `dashboard.spec.ts`, `demo-mode.spec.ts`, `tenants.spec.ts`, `claude-skill.spec.ts`, `deployments.spec.ts` (5x) |
| `GET /api/deployments` | `demo-mode.spec.ts`, `deployments.spec.ts`, `claude-skill.spec.ts` (3x)                                         |
| `GET /api/solutions`   | `dashboard.spec.ts`, `demo-mode.spec.ts` (2x)                                                                   |

While some overlap is intentional (testing from different angles), this adds CI time. Consider consolidating or making roles clearer (e.g., `demo-mode.spec.ts` focuses on demo flag presence, `dashboard.spec.ts` on data consistency).

### 9. Empty `beforeEach` in `demo-mode.spec.ts`

**File:** `demo-mode.spec.ts:9-12`

```typescript
test.beforeEach(async ({ page }) => {
  // Set demo mode cookie or navigate to demo mode enabled instance
  // In demo mode, auth is bypassed
});
```

This is a no-op that adds confusion. Either implement the setup or remove it.

### 10. SSE Tests Don't Verify Actual Streaming

**File:** `sse.spec.ts`

The SSE tests only verify response headers (`content-type: text/event-stream`, `cache-control: no-cache`) but never verify that actual events are streamed. The code acknowledges this:

```typescript
// Note: Playwright's request doesn't fully support SSE,
// but we can check the response headers
```

**Fix:** Use `page.evaluate()` with `EventSource` or parse the response body for event format (`data:`, `event:`, `id:`).

### 11. All Tests Run Exclusively in Demo Mode

Every test relies on `DEMO_MODE=true`. There are no tests for:

- Real authentication flows (OAuth, session management)
- Real database interactions
- Behavior when demo mode is disabled
- Edge cases around demo/production mode transitions

This is understandable for CI but limits confidence in production behavior.

---

## Low Priority / Nice-to-Have

### 12. No Negative/Security Testing

Missing tests for:

- Rate limiting (mentioned in `TESTING_GUIDE.md` but not automated)
- Malformed JSON payloads
- Oversized request bodies
- Invalid content types
- SQL injection / XSS attempts in input fields
- Expired/invalid session handling

### 13. No Performance Assertions

No tests verify response times. Consider adding soft assertions:

```typescript
const start = Date.now();
const response = await request.get("/api/stats");
expect(Date.now() - start).toBeLessThan(500);
```

### 14. Missing Test Timeout Configuration

**File:** `playwright.config.ts`

No `timeout` or `expect.timeout` is configured. Defaults to 30s per test and 5s per assertion, which may be too long for API tests and too short for complex page interactions.

---

## Recommendations Summary

| Priority     | Action                                                   | Effort    |
| ------------ | -------------------------------------------------------- | --------- |
| **Critical** | Fix CI/config secret mismatch                            | 5 min     |
| **Critical** | Remove 500 from accepted statuses in deployment tests    | 15 min    |
| **Critical** | Replace `waitForTimeout` with proper waits               | 30 min    |
| **High**     | Add e2e tests for webhook endpoints                      | 2-3 hours |
| **High**     | Add e2e tests for solution management endpoints          | 2-3 hours |
| **High**     | Fix or skip known failing approval/health tests (#148)   | 1-2 hours |
| **High**     | Align Firefox config between CI and playwright.config.ts | 10 min    |
| **High**     | Fix `totalDeployments` assertion in claude-skill.spec.ts | 10 min    |
| **Medium**   | Clean up duplicate test coverage                         | 1-2 hours |
| **Medium**   | Implement real SSE event verification                    | 1 hour    |
| **Medium**   | Remove empty `beforeEach` in demo-mode.spec.ts           | 5 min     |
| **Low**      | Add basic security/negative tests                        | 2-3 hours |
| **Low**      | Add performance assertions to key endpoints              | 1 hour    |

---

## Appendix: Test File Summary

| File                   | Tests  | Focus                                                |
| ---------------------- | ------ | ---------------------------------------------------- |
| `auth.spec.ts`         | 7      | Sign-in page UI, error pages, branding               |
| `health.spec.ts`       | 2      | Liveness and readiness probes                        |
| `dashboard.spec.ts`    | 6      | Stats API, demo solutions, solutions list            |
| `demo-mode.spec.ts`    | 5      | Demo data structure validation                       |
| `deployments.spec.ts`  | 15     | CRUD, filtering, approval workflow, tenant scoping   |
| `tenants.spec.ts`      | 14     | CRUD, tags, status, filtering, agent removal         |
| `sse.spec.ts`          | 4      | SSE headers and basic connectivity                   |
| `claude-skill.spec.ts` | 11     | Skill workflow integration (agents, deploy, monitor) |
| **Total**              | **64** |                                                      |
