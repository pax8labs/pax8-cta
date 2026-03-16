/**
 * MSW handlers for replaying recorded Dataverse Web API responses.
 *
 * Usage: import a scenario and pass handlers to server.use() in your test.
 * Each scenario loads sanitized fixtures modeled on real Dataverse API responses.
 */

import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures/dataverse-recordings");

function loadFixture(filename: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, filename), "utf-8"));
}

// Match any Dataverse environment URL
const ENV_URL = "https://org60b532ae.crm.dynamics.com";
const API_BASE = `${ENV_URL}/api/data/v9.2`;

// Token handler — intercept MSAL token requests
const tokenHandler = http.post(
  "https://login.microsoftonline.com/:tenantId/oauth2/v2.0/token",
  () => {
    return HttpResponse.json({
      token_type: "Bearer",
      expires_in: 3600,
      access_token: "msw-dataverse-test-token",
    });
  }
);

// ============================================================================
// Solution query scenarios
// ============================================================================

/**
 * Happy path: environment with 4 solutions (2 managed, 2 unmanaged)
 */
export function solutionsListHandlers() {
  const data = loadFixture("solutions-list.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/solutions`, () => {
      return HttpResponse.json(data);
    }),
  ];
}

/**
 * Solution found by unique name (with publisher expanded)
 */
export function solutionByNameHandlers() {
  const found = loadFixture("solution-by-name.json");
  const notFound = loadFixture("solution-not-found.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/solutions`, ({ request }) => {
      const url = new URL(request.url);
      const filter = url.searchParams.get("$filter") || "";
      if (filter.includes("CustomerServiceAgent")) {
        return HttpResponse.json(found);
      }
      return HttpResponse.json(notFound);
    }),
  ];
}

// ============================================================================
// Export scenarios
// ============================================================================

/**
 * Successful solution export returning base64 zip
 */
export function exportSolutionHandlers() {
  const solutionData = loadFixture("solution-by-name.json");
  const exportData = loadFixture("export-solution.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/solutions`, () => {
      return HttpResponse.json(solutionData);
    }),
    http.post(`${API_BASE}/ExportSolution`, () => {
      return HttpResponse.json(exportData);
    }),
  ];
}

// ============================================================================
// Import scenarios
// ============================================================================

/**
 * Successful synchronous import (no error thrown)
 */
export function importSolutionSuccessHandlers() {
  return [
    tokenHandler,
    http.post(`${API_BASE}/ImportSolution`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

/**
 * Failed synchronous import (Dataverse returns error)
 */
export function importSolutionFailureHandlers() {
  return [
    tokenHandler,
    http.post(`${API_BASE}/ImportSolution`, () => {
      return HttpResponse.json(
        {
          error: {
            code: "0x80048540",
            message:
              "Solution import failed: missing dependency 'mscrm.SharePointIntegration' (version 9.0.0.0 or higher).",
            innererror: {
              message: "Missing required component dependency",
              type: "Microsoft.Crm.CrmException",
              stacktrace: "",
            },
          },
        },
        { status: 400 }
      );
    }),
  ];
}

/**
 * Async import: job in progress then completed successfully
 */
export function importAsyncProgressHandlers() {
  const progress = loadFixture("import-job-progress.json");
  const success = loadFixture("import-job-success.json");
  let pollCount = 0;

  return [
    tokenHandler,
    http.post(`${API_BASE}/ImportSolutionAsync`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API_BASE}/importjobs`, () => {
      pollCount++;
      if (pollCount <= 2) {
        return HttpResponse.json(progress);
      }
      return HttpResponse.json(success);
    }),
  ];
}

/**
 * Async import: job completes with failure
 */
export function importAsyncFailureHandlers() {
  const failure = loadFixture("import-job-failure.json");
  return [
    tokenHandler,
    http.post(`${API_BASE}/ImportSolutionAsync`, () => {
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API_BASE}/importjobs`, () => {
      return HttpResponse.json(failure);
    }),
  ];
}

// ============================================================================
// Solution history
// ============================================================================

/**
 * Solution history with successful and failed imports
 */
export function solutionHistoryHandlers() {
  const data = loadFixture("solution-history.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/msdyn_solutionhistories`, () => {
      return HttpResponse.json(data);
    }),
  ];
}

// ============================================================================
// WhoAmI
// ============================================================================

/**
 * Successful WhoAmI response
 */
export function whoAmIHandlers() {
  const data = loadFixture("whoami.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/WhoAmI`, () => {
      return HttpResponse.json(data);
    }),
  ];
}

// ============================================================================
// Error scenarios
// ============================================================================

/**
 * 401 Unauthorized — bad/expired token
 */
export function unauthorizedHandlers() {
  const data = loadFixture("error-unauthorized.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/*`, () => {
      return HttpResponse.json(data, { status: 401 });
    }),
    http.post(`${API_BASE}/*`, () => {
      return HttpResponse.json(data, { status: 401 });
    }),
  ];
}

/**
 * 403 Forbidden — missing privileges
 */
export function forbiddenHandlers() {
  const data = loadFixture("error-forbidden.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/*`, () => {
      return HttpResponse.json(data, { status: 403 });
    }),
  ];
}

/**
 * 403 with "not a member" error — app user not registered
 */
export function notMemberHandlers() {
  const data = loadFixture("error-not-member.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/*`, () => {
      return HttpResponse.json(data, { status: 403 });
    }),
  ];
}

/**
 * 429 Throttled
 */
export function throttledHandlers(retryAfterSeconds = 0) {
  const data = loadFixture("error-throttled.json");
  return [
    tokenHandler,
    http.get(`${API_BASE}/*`, () => {
      return HttpResponse.json(data, {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }),
  ];
}

/**
 * Transient 503 then recovery on solutions endpoint
 */
export function transientFailureHandlers() {
  const data = loadFixture("solutions-list.json");
  let callCount = 0;
  return [
    tokenHandler,
    http.get(`${API_BASE}/solutions`, () => {
      callCount++;
      if (callCount === 1) {
        return HttpResponse.json(
          { error: { code: "ServiceUnavailable", message: "Temporary failure" } },
          { status: 503 }
        );
      }
      return HttpResponse.json(data);
    }),
  ];
}
