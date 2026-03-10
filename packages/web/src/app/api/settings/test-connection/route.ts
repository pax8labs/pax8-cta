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
  getSettingsService,
  TokenManager,
  DataverseClient,
  PowerPlatformAdminClient,
} from "@agentsync/core";
import { requireRole, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { apiRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  details?: string;
}

/**
 * Test the Power Platform connection with current settings
 * Requires Admin role
 */
export async function POST(request: NextRequest) {
  // Require Admin role - this endpoint makes expensive API calls
  const session = await requireRole(AppRoles.ADMIN);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/settings/test-connection", "forbidden", {
      action: "test_connection",
    });
    return session;
  }

  // Apply rate limiting - prevent spam of expensive API calls
  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  const results: TestResult[] = [];
  let overallSuccess = true;

  try {
    const settingsService = getSettingsService();
    const settings = await settingsService.getDecryptedIntegrationSettings();

    // Step 1: Validate credentials are configured
    results.push({
      step: "credentials",
      success: !!(
        settings.partnerTenantId &&
        settings.partnerClientId &&
        settings.partnerClientSecret
      ),
      message: settings.partnerTenantId
        ? "Partner credentials configured"
        : "Partner credentials not configured",
    });

    if (!settings.partnerTenantId || !settings.partnerClientId || !settings.partnerClientSecret) {
      overallSuccess = false;
      await settingsService.recordTestResult(false, "Credentials not configured");
      return NextResponse.json({
        success: false,
        results,
        error: "Partner credentials are not fully configured",
      });
    }

    // Step 2: Test authentication
    try {
      const tokenManager = new TokenManager({
        tenantId: settings.partnerTenantId,
        clientId: settings.partnerClientId,
        clientSecret: settings.partnerClientSecret,
      });

      // Try to get a Graph token (for Partner Center / GDAP)
      await tokenManager.getGraphToken();

      results.push({
        step: "authentication",
        success: true,
        message: "Successfully authenticated with Azure AD",
      });
    } catch (error) {
      overallSuccess = false;
      results.push({
        step: "authentication",
        success: false,
        message: "Authentication failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      await settingsService.recordTestResult(
        false,
        `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      return NextResponse.json({
        success: false,
        results,
        error: "Authentication failed - check your credentials",
      });
    }

    // Step 3: Test Power Platform Admin API access
    try {
      const tokenManager = new TokenManager({
        tenantId: settings.partnerTenantId,
        clientId: settings.partnerClientId,
        clientSecret: settings.partnerClientSecret,
      });

      const adminClient = new PowerPlatformAdminClient({ tokenManager });
      const environments = await adminClient.listEnvironments();

      results.push({
        step: "powerplatform_admin",
        success: true,
        message: `Connected to Power Platform Admin API`,
        details: `Found ${environments.length} environment(s)`,
      });
    } catch (error) {
      // This might fail if they don't have admin API access - warn but continue
      results.push({
        step: "powerplatform_admin",
        success: false,
        message: "Power Platform Admin API not accessible",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't fail overall - this is optional
    }

    // Step 4: Test source environment access (if configured)
    if (settings.sourceEnvironmentUrl) {
      try {
        const tokenManager = new TokenManager({
          tenantId: settings.sourceTenantId || settings.partnerTenantId,
          clientId: settings.partnerClientId,
          clientSecret: settings.partnerClientSecret,
        });

        const dataverseClient = new DataverseClient({
          environmentUrl: settings.sourceEnvironmentUrl,
          tokenManager,
        });

        const solutions = await dataverseClient.querySolutions();

        results.push({
          step: "source_environment",
          success: true,
          message: "Connected to source environment",
          details: `Found ${solutions.length} solution(s)`,
        });
      } catch (error) {
        overallSuccess = false;
        results.push({
          step: "source_environment",
          success: false,
          message: "Source environment not accessible",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } else {
      results.push({
        step: "source_environment",
        success: true,
        message: "Source environment not configured (optional)",
      });
    }

    // Record the test result
    await settingsService.recordTestResult(
      overallSuccess,
      overallSuccess ? undefined : "One or more tests failed"
    );

    return NextResponse.json({
      success: overallSuccess,
      results,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Connection test error:", error);
    return internalError(
      "Connection test failed",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
