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
import {
  isDemoMode,
  TenantDiscoveryService,
  DataverseClient,
  TokenManager,
  DEMO_TENANTS,
  DEMO_SOLUTIONS,
} from "@agentsync/core";
import { notFound, internalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

/**
 * Get solutions installed in a tenant's environment
 * In demo mode, returns mock solution data
 * In real mode, queries Dataverse API
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const tenantId = params.id;
  const { searchParams } = new URL(request.url);
  const environmentUrl = searchParams.get("environmentUrl");

  try {
    if (isDemoMode()) {
      // Return mock solution data for demo tenants
      const tenant = DEMO_TENANTS.find((t) => t.tenantId === tenantId);

      if (!tenant) {
        return notFound("Tenant", tenantId);
      }

      // Return a subset of demo solutions based on tenant
      const tenantSolutions = DEMO_SOLUTIONS.slice(0, Math.floor(Math.random() * 3) + 1).map(
        (sol) => ({
          solutionId: `${tenantId}-${sol.uniqueName}`,
          uniqueName: sol.uniqueName,
          friendlyName: sol.friendlyName,
          version: sol.version,
          isManaged: sol.isManaged,
          publisherName: sol.publisherName,
          description: sol.description,
          installedOn: new Date(
            Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000
          ).toISOString(),
        })
      );

      return NextResponse.json({
        demoMode: true,
        tenantId,
        tenantName: tenant.name,
        environmentUrl: environmentUrl || tenant.environmentUrl,
        solutions: tenantSolutions,
      });
    }

    // Real mode - query Dataverse for solutions
    const partnerTenantId = process.env.PARTNER_TENANT_ID;
    const partnerClientId = process.env.PARTNER_CLIENT_ID;
    const partnerClientSecret = process.env.PARTNER_CLIENT_SECRET;

    if (!partnerTenantId || !partnerClientId || !partnerClientSecret) {
      return internalError("Partner credentials not configured");
    }

    // If no environment URL provided, discover it
    let targetEnvironmentUrl = environmentUrl;

    if (!targetEnvironmentUrl) {
      const discoveryService = new TenantDiscoveryService({
        tenantId: partnerTenantId,
        clientId: partnerClientId,
        clientSecret: partnerClientSecret,
      });

      const tenants = await discoveryService.discoverTenants();
      const tenant = tenants.find((t) => t.tenantId === tenantId);

      if (!tenant || !tenant.defaultEnvironment) {
        return notFound("Tenant or default environment");
      }

      targetEnvironmentUrl = tenant.defaultEnvironment.instanceUrl;
    }

    // Create token manager for customer tenant (GDAP delegation)
    const customerTokenManager = new TokenManager({
      tenantId: tenantId, // Target customer tenant
      clientId: partnerClientId,
      clientSecret: partnerClientSecret,
    });

    const dataverseClient = new DataverseClient({
      environmentUrl: targetEnvironmentUrl,
      tokenManager: customerTokenManager,
    });

    const solutions = await dataverseClient.querySolutions();

    return NextResponse.json({
      demoMode: false,
      tenantId,
      environmentUrl: targetEnvironmentUrl,
      solutions: solutions.map((sol) => ({
        solutionId: sol.solutionid,
        uniqueName: sol.uniquename,
        friendlyName: sol.friendlyname,
        version: sol.version,
        isManaged: sol.ismanaged,
        publisherName: sol.publisherid?.friendlyname,
      })),
    });
  } catch (error) {
    console.error("Solutions error:", error);
    return internalError(
      "Failed to fetch solutions",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
