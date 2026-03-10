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

import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import {
  loadConfig,
  isDemoMode,
  DEMO_CONFIG,
  TenantDiscoveryService,
  getEffectiveIntegrationSettings,
} from "@agentsync/core";
import { resolve } from "path";
import { demoDeployedAgents, demoTenantStatus, initializeDemoAgents } from "@/lib/demo-store";
import { requireAuth, requireRole, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { apiRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { internalError, invalidRequest } from "@/lib/errors";

const CONFIG_PATH = process.env.CONFIG_PATH || "./config/tenants.yaml";

// Cache for discovered tenants (shared across requests)
let discoveryCache: {
  data: Awaited<ReturnType<TenantDiscoveryService["discoverTenants"]>> | null;
  expiresAt: number;
} = { data: null, expiresAt: 0 };

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if tenant discovery via GDAP is enabled using settings service
 */
async function isDiscoveryEnabled(): Promise<boolean> {
  const settings = await getEffectiveIntegrationSettings();
  return (
    !!settings.tenantDiscoveryEnabled &&
    !!settings.partnerTenantId &&
    !!settings.partnerClientId &&
    !!settings.partnerClientSecret
  );
}

/**
 * Discover tenants via GDAP relationships
 */
async function discoverTenantsViaGDAP() {
  // Check cache first
  if (discoveryCache.data && Date.now() < discoveryCache.expiresAt) {
    return discoveryCache.data;
  }

  const settings = await getEffectiveIntegrationSettings();

  const discoveryService = new TenantDiscoveryService({
    tenantId: settings.partnerTenantId!,
    clientId: settings.partnerClientId!,
    clientSecret: settings.partnerClientSecret!,
  });

  const tenants = await discoveryService.discoverTenants();

  // Update cache
  discoveryCache = {
    data: tenants,
    expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
  };

  return tenants;
}

export async function GET(request: NextRequest) {
  // Require authentication to view tenants
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/tenants", "unauthorized");
    return session;
  }

  // Apply rate limiting
  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Demo mode - use hardcoded demo data
    if (isDemoMode()) {
      initializeDemoAgents();

      const config = DEMO_CONFIG;
      return NextResponse.json({
        demoMode: true,
        discoveryMode: false,
        partner: {
          tenantId: config.partner.tenantId,
          clientId: config.partner.clientId,
        },
        source: config.source,
        tenants: config.tenants.map((t) => ({
          name: t.name,
          tenantId: t.tenantId,
          environmentUrl: t.environmentUrl,
          tags: t.tags,
          enabled: demoTenantStatus.has(t.tenantId) ? demoTenantStatus.get(t.tenantId) : t.enabled,
          metadata: t.metadata,
          deployedAgents: demoDeployedAgents.get(t.tenantId) || [],
        })),
      });
    }

    // Discovery mode - fetch tenants via GDAP
    const discoveryEnabled = await isDiscoveryEnabled();
    if (discoveryEnabled) {
      const discoveredTenants = await discoverTenantsViaGDAP();
      const settings = await getEffectiveIntegrationSettings();

      return NextResponse.json({
        demoMode: false,
        discoveryMode: true,
        partner: {
          tenantId: settings.partnerTenantId,
          clientId: settings.partnerClientId,
        },
        tenants: discoveredTenants.map((t) => ({
          name: t.displayName,
          tenantId: t.tenantId,
          environmentUrl: t.defaultEnvironment?.instanceUrl || "",
          environments: t.environments,
          defaultEnvironment: t.defaultEnvironment,
          tags: t.hasPowerPlatformAdmin ? ["gdap", "power-platform-admin"] : ["gdap"],
          enabled: t.gdapStatus === "active" && !t.error,
          gdapStatus: t.gdapStatus,
          gdapEndDateTime: t.gdapEndDateTime,
          hasPowerPlatformAdmin: t.hasPowerPlatformAdmin,
          discoveredAt: t.discoveredAt,
          error: t.error,
          metadata: {
            gdapRelationshipId: t.gdapRelationshipId,
            environmentCount: t.environments.length,
          },
          // No deployed agents tracking in discovery mode yet
          // This would need to query each environment's solutions
          deployedAgents: [],
        })),
      });
    }

    // Config file mode - load from YAML
    const config = await loadConfig(resolve(CONFIG_PATH));

    return NextResponse.json({
      demoMode: false,
      discoveryMode: false,
      partner: {
        tenantId: config.partner.tenantId,
        clientId: config.partner.clientId,
      },
      source: config.source,
      tenants: config.tenants.map((t) => ({
        name: t.name,
        tenantId: t.tenantId,
        environmentUrl: t.environmentUrl,
        tags: t.tags,
        enabled: t.enabled,
        metadata: t.metadata,
        deployedAgents: [],
      })),
    });
  } catch (error) {
    console.error("Tenants error:", error);
    return internalError(
      "Failed to load tenants configuration",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * POST endpoint to refresh tenant discovery cache
 * Requires Admin role
 */
export async function POST() {
  // Require Admin role to refresh discovery cache
  const session = await requireRole(AppRoles.ADMIN);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/tenants", "forbidden", { action: "refresh_discovery" });
    return session;
  }

  try {
    const discoveryEnabled = await isDiscoveryEnabled();
    if (!discoveryEnabled) {
      return invalidRequest("Tenant discovery is not enabled");
    }

    // Clear cache to force refresh
    discoveryCache = { data: null, expiresAt: 0 };

    const tenants = await discoverTenantsViaGDAP();

    return NextResponse.json({
      success: true,
      message: "Tenant discovery cache refreshed",
      tenantCount: tenants.length,
      discoveredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Tenant discovery refresh error:", error);
    return internalError(
      "Failed to refresh tenant discovery",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
