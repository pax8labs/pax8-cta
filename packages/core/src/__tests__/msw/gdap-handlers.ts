/**
 * MSW handlers for replaying recorded GDAP Graph API responses.
 *
 * Usage: import a scenario and pass it to setupServer() in your test.
 * Each scenario loads sanitized fixtures recorded from real Graph API responses.
 */

import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "../fixtures/gdap-recordings");

function loadFixture(filename: string): unknown {
  return JSON.parse(readFileSync(resolve(fixturesDir, filename), "utf-8"));
}

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const RELATIONSHIPS_URL = `${GRAPH_BASE}/tenantRelationships/delegatedAdminRelationships`;

// Also intercept MSAL token endpoint so TokenManager works
const tokenHandler = http.post(
  "https://login.microsoftonline.com/:tenantId/oauth2/v2.0/token",
  () => {
    return HttpResponse.json({
      token_type: "Bearer",
      expires_in: 3600,
      access_token: "msw-replayed-access-token",
    });
  }
);

/**
 * Happy path: 3 active relationships with Power Platform Admin role
 */
export function activeRelationshipsHandlers() {
  const data = loadFixture("active-relationships.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data);
    }),
    http.get(`${RELATIONSHIPS_URL}/:id`, ({ params }) => {
      const relationships = (data as any).value;
      const rel = relationships.find((r: any) => r.id === params.id);
      if (rel) {
        return HttpResponse.json(rel);
      }
      return HttpResponse.json(
        { error: { code: "NotFound", message: "Resource not found" } },
        { status: 404 }
      );
    }),
  ];
}

/**
 * No relationships found
 */
export function emptyRelationshipsHandlers() {
  const data = loadFixture("empty-relationships.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data);
    }),
  ];
}

/**
 * Mix of active, expired, pending, terminated relationships
 */
export function mixedStatusHandlers() {
  const data = loadFixture("mixed-status.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data);
    }),
  ];
}

/**
 * Active relationship expiring within 30 days
 */
export function expiringSoonHandlers() {
  // Dynamically patch the endDateTime to be 15 days from now
  const data = loadFixture("expiring-soon.json") as any;
  const fifteenDaysFromNow = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  data.value[0].endDateTime = fifteenDaysFromNow.toISOString();
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data);
    }),
  ];
}

/**
 * Active relationship but missing Power Platform Administrator role
 */
export function noPowerPlatformRoleHandlers() {
  const data = loadFixture("no-power-platform-role.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data);
    }),
  ];
}

/**
 * 401 Unauthorized error
 */
export function unauthorizedHandlers() {
  const data = loadFixture("error-unauthorized.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data, { status: 401 });
    }),
  ];
}

/**
 * 403 Forbidden error
 */
export function forbiddenHandlers() {
  const data = loadFixture("error-forbidden.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data, { status: 403 });
    }),
  ];
}

/**
 * 429 Throttled error with Retry-After header
 * @param retryAfterSeconds - Retry-After value in seconds (default: 0 for fast tests)
 */
export function throttledHandlers(retryAfterSeconds = 0) {
  const data = loadFixture("error-throttled.json");
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
      return HttpResponse.json(data, {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }),
  ];
}

/**
 * Paginated response: page 1 has nextLink, page 2 is final
 */
export function paginatedHandlers() {
  const page1 = loadFixture("paginated-page1.json") as any;
  const page2 = loadFixture("paginated-page2.json");
  const nextLinkUrl = page1["@odata.nextLink"];

  return [
    tokenHandler,
    // First page (filtered URL)
    http.get(RELATIONSHIPS_URL, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.has("$skiptoken")) {
        return HttpResponse.json(page2);
      }
      return HttpResponse.json(page1);
    }),
  ];
}

/**
 * Transient failure then recovery: first request returns 503, subsequent succeed
 */
export function transientFailureHandlers() {
  const data = loadFixture("active-relationships.json");
  let callCount = 0;
  return [
    tokenHandler,
    http.get(RELATIONSHIPS_URL, () => {
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
