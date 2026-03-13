/**
 * GDAP Scenario Simulator
 *
 * Generates realistic Microsoft Graph API response shapes for
 * delegatedAdminRelationships testing. Provides builders for
 * DelegatedAdminRelationship objects and composable fetch mocks
 * for common scenarios (large fleets, mixed statuses, pagination,
 * rate limiting, etc.).
 *
 * @see https://learn.microsoft.com/en-us/graph/api/resources/delegatedadminrelationship
 */

import type { DelegatedAdminRelationship } from "../../auth/gdap-client.js";

// Well-known Azure AD role definition IDs
export const ROLE_IDS = {
  POWER_PLATFORM_ADMIN: "11648597-926c-4cf3-9c36-bcebb0ba8dcc",
  GLOBAL_ADMIN: "62e90394-69f5-4237-9190-012177145e10",
  HELPDESK_ADMIN: "729827e3-9c14-49f7-bb1b-9608f156bbb8",
  EXCHANGE_ADMIN: "29232cdf-9323-42fd-ade2-1d097af3e4de",
  SECURITY_ADMIN: "194ae4cb-b126-40b2-bd5b-6091b380977d",
  USER_ADMIN: "fe930be7-5e62-47db-91af-98c3a49a38b1",
} as const;

// Company name fragments for generating realistic display names
const COMPANY_PREFIXES = [
  "Acme",
  "Contoso",
  "Fabrikam",
  "Northwind",
  "Woodgrove",
  "Proseware",
  "Litware",
  "Tailspin",
  "Wingtip",
  "Adatum",
  "Alpine",
  "Bellows",
  "Coho",
  "Datum",
  "Fourth",
  "Graphic",
  "Humongous",
  "Lamna",
  "Lucerne",
  "Margie",
];

const COMPANY_SUFFIXES = [
  "Corp",
  "Inc",
  "LLC",
  "Ltd",
  "Group",
  "Solutions",
  "Systems",
  "Technologies",
  "Services",
  "Partners",
];

/**
 * Generate a deterministic UUID from a seed number.
 * Produces valid v4-format UUIDs that are stable for the same seed.
 */
function seededUuid(seed: number): string {
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");
  const a = (seed * 2654435761) >>> 0;
  const b = (seed * 2246822519) >>> 0;
  const c = (seed * 3266489917) >>> 0;
  const d = (seed * 668265263) >>> 0;
  return [
    hex(a, 8),
    hex(b & 0xffff, 4),
    "4" + hex((b >>> 16) & 0xfff, 3),
    hex(0x8000 | (c & 0x3fff), 4),
    hex(d, 8) + hex((c >>> 16) & 0xffff, 4),
  ].join("-");
}

function companyName(index: number): string {
  const prefix = COMPANY_PREFIXES[index % COMPANY_PREFIXES.length];
  const suffix =
    COMPANY_SUFFIXES[Math.floor(index / COMPANY_PREFIXES.length) % COMPANY_SUFFIXES.length];
  return `${prefix} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Relationship Builder
// ---------------------------------------------------------------------------

export interface RelationshipBuilderOptions {
  id?: string;
  displayName?: string;
  customerTenantId?: string;
  customerDisplayName?: string;
  status?: DelegatedAdminRelationship["status"];
  roles?: string[];
  duration?: string;
  /** ISO 8601 end date; helpers like expiresInDays() set this */
  endDateTime?: string;
}

/**
 * Build a single DelegatedAdminRelationship with realistic defaults.
 */
export function buildRelationship(
  opts: RelationshipBuilderOptions = {}
): DelegatedAdminRelationship {
  const {
    id = seededUuid(1),
    displayName = "GDAP - Contoso Corp",
    customerTenantId = seededUuid(100),
    customerDisplayName = "Contoso Corp",
    status = "active",
    roles = [ROLE_IDS.POWER_PLATFORM_ADMIN],
    duration = "P730D",
    endDateTime = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString(),
  } = opts;

  return {
    id,
    displayName,
    customer: {
      tenantId: customerTenantId,
      displayName: customerDisplayName,
    },
    status,
    accessDetails: {
      unifiedRoles: roles.map((roleDefinitionId) => ({ roleDefinitionId })),
    },
    duration,
    endDateTime,
  };
}

/**
 * Convenience: build a relationship that expires N days from now.
 */
export function buildRelationshipExpiringIn(
  days: number,
  opts: Omit<RelationshipBuilderOptions, "endDateTime"> = {}
): DelegatedAdminRelationship {
  const endDateTime = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  return buildRelationship({ ...opts, endDateTime });
}

// ---------------------------------------------------------------------------
// Scenario Generators
// ---------------------------------------------------------------------------

export interface FleetOptions {
  /** Number of tenants (default 50) */
  count?: number;
  /**
   * Fraction (0-1) of relationships that are active (default 1.0).
   * Remainder will be evenly split among pending/expired/terminated.
   */
  activeFraction?: number;
  /**
   * Fraction of active relationships that include Power Platform Admin role
   * (default 1.0). Others get only Helpdesk Admin.
   */
  ppAdminFraction?: number;
  /** Min days until expiry for active relationships (default 30) */
  minExpiryDays?: number;
  /** Max days until expiry for active relationships (default 730) */
  maxExpiryDays?: number;
}

/**
 * Generate a fleet of N relationships simulating a realistic MSP portfolio.
 */
export function buildFleet(opts: FleetOptions = {}): DelegatedAdminRelationship[] {
  const {
    count = 50,
    activeFraction = 1.0,
    ppAdminFraction = 1.0,
    minExpiryDays = 30,
    maxExpiryDays = 730,
  } = opts;

  const relationships: DelegatedAdminRelationship[] = [];
  const inactiveStatuses: DelegatedAdminRelationship["status"][] = [
    "pending",
    "expired",
    "terminated",
  ];

  for (let i = 0; i < count; i++) {
    const isActive = i / count < activeFraction;
    const status: DelegatedAdminRelationship["status"] = isActive
      ? "active"
      : inactiveStatuses[i % inactiveStatuses.length];

    const hasPPAdmin = isActive && i / (count * activeFraction) < ppAdminFraction;
    const roles = hasPPAdmin
      ? [ROLE_IDS.POWER_PLATFORM_ADMIN, ROLE_IDS.HELPDESK_ADMIN]
      : [ROLE_IDS.HELPDESK_ADMIN];

    const expiryDays = isActive
      ? minExpiryDays + ((maxExpiryDays - minExpiryDays) * i) / Math.max(count - 1, 1)
      : -Math.abs(30 + i); // expired items get negative days

    const name = companyName(i);

    relationships.push(
      buildRelationship({
        id: seededUuid(1000 + i),
        displayName: `GDAP - ${name}`,
        customerTenantId: seededUuid(2000 + i),
        customerDisplayName: name,
        status,
        roles,
        endDateTime: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString(),
      })
    );
  }

  return relationships;
}

/**
 * Build a set of relationships with mixed expiry boundaries useful for
 * testing near-expiry detection logic.
 *
 * Returns relationships expiring at: -1 day (expired), 0 days (today),
 * 1 day, 7 days, 14 days, 29 days, 30 days, 60 days, 365 days.
 */
export function buildExpiryBoundarySet(): DelegatedAdminRelationship[] {
  const dayOffsets = [-1, 0, 1, 7, 14, 29, 30, 60, 365];
  return dayOffsets.map((days, i) => {
    const status: DelegatedAdminRelationship["status"] = days < 0 ? "expired" : "active";
    const name = companyName(i);
    return buildRelationship({
      id: seededUuid(3000 + i),
      displayName: `GDAP - ${name}`,
      customerTenantId: seededUuid(4000 + i),
      customerDisplayName: name,
      status,
      roles: [ROLE_IDS.POWER_PLATFORM_ADMIN],
      endDateTime: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    });
  });
}

/**
 * Build a scenario with mixed role assignments to test Power Platform
 * Admin validation. Returns:
 * - 2 with Power Platform Admin only
 * - 2 with Power Platform Admin + Global Admin
 * - 2 with only Helpdesk Admin (should fail PP validation)
 * - 2 with no roles (should fail PP validation)
 */
export function buildMixedRolesSet(): DelegatedAdminRelationship[] {
  const scenarios: { roles: string[]; label: string }[] = [
    { roles: [ROLE_IDS.POWER_PLATFORM_ADMIN], label: "PP Admin Only" },
    { roles: [ROLE_IDS.POWER_PLATFORM_ADMIN], label: "PP Admin Only 2" },
    { roles: [ROLE_IDS.POWER_PLATFORM_ADMIN, ROLE_IDS.GLOBAL_ADMIN], label: "PP + Global" },
    { roles: [ROLE_IDS.POWER_PLATFORM_ADMIN, ROLE_IDS.GLOBAL_ADMIN], label: "PP + Global 2" },
    { roles: [ROLE_IDS.HELPDESK_ADMIN], label: "Helpdesk Only" },
    { roles: [ROLE_IDS.HELPDESK_ADMIN], label: "Helpdesk Only 2" },
    { roles: [], label: "No Roles" },
    { roles: [], label: "No Roles 2" },
  ];

  return scenarios.map((s, i) => {
    const name = companyName(i);
    return buildRelationship({
      id: seededUuid(5000 + i),
      displayName: `GDAP - ${name} (${s.label})`,
      customerTenantId: seededUuid(6000 + i),
      customerDisplayName: name,
      roles: s.roles,
    });
  });
}

// ---------------------------------------------------------------------------
// Graph API Response Builders
// ---------------------------------------------------------------------------

export interface GraphPageOptions {
  /** Page size for pagination (default 100, Graph API max) */
  pageSize?: number;
  /** Base URL for @odata.nextLink (default graph endpoint) */
  baseUrl?: string;
}

export interface GraphApiPage {
  "@odata.context"?: string;
  "@odata.nextLink"?: string;
  value: DelegatedAdminRelationship[];
}

/**
 * Paginate an array of relationships into Graph-style response pages.
 * Each page includes an @odata.nextLink except the last one.
 */
export function paginateRelationships(
  relationships: DelegatedAdminRelationship[],
  opts: GraphPageOptions = {}
): GraphApiPage[] {
  const {
    pageSize = 100,
    baseUrl = "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships",
  } = opts;

  const pages: GraphApiPage[] = [];
  for (let offset = 0; offset < relationships.length; offset += pageSize) {
    const slice = relationships.slice(offset, offset + pageSize);
    const page: GraphApiPage = {
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#tenantRelationships/delegatedAdminRelationships",
      value: slice,
    };
    if (offset + pageSize < relationships.length) {
      const skipToken = Buffer.from(String(offset + pageSize)).toString("base64");
      page["@odata.nextLink"] = `${baseUrl}?$skiptoken=${skipToken}`;
    }
    pages.push(page);
  }

  // Edge case: empty set still returns one page with empty value
  if (pages.length === 0) {
    pages.push({
      "@odata.context":
        "https://graph.microsoft.com/v1.0/$metadata#tenantRelationships/delegatedAdminRelationships",
      value: [],
    });
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Fetch Mock Composers
// ---------------------------------------------------------------------------

/**
 * Create a mock fetch function that returns paginated relationship data.
 * Handles the nextLink-based pagination pattern used by Graph API.
 */
export function createPaginatedFetchMock(
  relationships: DelegatedAdminRelationship[],
  pageSize = 100
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const pages = paginateRelationships(relationships, { pageSize });
  let callIndex = 0;

  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const page = pages[Math.min(callIndex, pages.length - 1)];
    callIndex++;

    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Options for the rate-limiting fetch mock.
 */
export interface RateLimitOptions {
  /** Which request indices (0-based) should return 429 (default [0, 1]) */
  throttledRequests?: number[];
  /** Retry-After header value in seconds (default 2) */
  retryAfterSeconds?: number;
}

/**
 * Create a mock fetch that returns 429 Too Many Requests for specified
 * request indices, then succeeds with the given data.
 */
export function createRateLimitingFetchMock(
  relationships: DelegatedAdminRelationship[],
  opts: RateLimitOptions = {}
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const { throttledRequests = [0, 1], retryAfterSeconds = 2 } = opts;
  let callIndex = 0;
  const successBody = JSON.stringify({
    "@odata.context":
      "https://graph.microsoft.com/v1.0/$metadata#tenantRelationships/delegatedAdminRelationships",
    value: relationships,
  });

  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const currentCall = callIndex++;
    if (throttledRequests.includes(currentCall)) {
      return new Response(
        JSON.stringify({
          error: {
            code: "TooManyRequests",
            message: "Rate limit exceeded. Please retry after the specified period.",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    return new Response(successBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Create a mock fetch that returns a mix of successful and failed responses
 * to simulate partial fleet failures. Each call returns the next response
 * from the provided sequence.
 */
export function createPartialFailureFetchMock(
  sequence: Array<{ status: number; body: unknown; headers?: Record<string, string> }>
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  let callIndex = 0;

  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const entry = sequence[Math.min(callIndex, sequence.length - 1)];
    callIndex++;

    return new Response(JSON.stringify(entry.body), {
      status: entry.status,
      headers: {
        "Content-Type": "application/json",
        ...entry.headers,
      },
    });
  };
}
