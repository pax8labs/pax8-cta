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
import { getSettingsService, IntegrationSettings, AppSettings } from "@agentsync/core";
import { requireAuth, requireRole, logAuthFailure } from "@/lib/api-middleware";
import { AppRoles } from "@/lib/auth";
import { apiRateLimit, createRateLimitResponse } from "@/lib/rate-limit";
import { parseAndValidate, updateSettingsSchema } from "@/lib/validation";
import { validationError, internalError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/repositories/audit-repository";

export const dynamic = "force-dynamic";

/**
 * Get all settings
 * Requires authentication
 */
export async function GET() {
  const session = await requireAuth();
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/settings", "unauthorized");
    return session;
  }
  try {
    const settingsService = getSettingsService();
    const settings = await settingsService.getSettings();

    // For integration settings, mask the client secret
    const maskedIntegration = {
      ...settings.integration,
      partnerClientSecret: settings.integration.partnerClientSecret
        ? "••••••••••••••••"
        : undefined,
    };

    // For app settings, mask webhook URLs
    const maskedApp = {
      ...settings.app,
      slackWebhookUrl: settings.app.slackWebhookUrl ? "••••••••••••••••" : undefined,
      teamsWebhookUrl: settings.app.teamsWebhookUrl ? "••••••••••••••••" : undefined,
    };

    return NextResponse.json({
      integration: maskedIntegration,
      app: maskedApp,
      isConfigured: await settingsService.isIntegrationConfigured(),
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return internalError(
      "Failed to load settings",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}

/**
 * Update settings (integration or app)
 * Requires Admin role
 */
export async function PUT(request: NextRequest) {
  const session = await requireRole(AppRoles.ADMIN);
  if (session instanceof NextResponse) {
    logAuthFailure(undefined, "/api/settings", "forbidden", { action: "update_settings" });
    return session;
  }

  // Apply rate limiting
  const rateLimitResult = await apiRateLimit(request, session.user.email ?? undefined);
  if (rateLimitResult && !rateLimitResult.success) {
    return createRateLimitResponse(rateLimitResult.reset);
  }

  try {
    // Validate request body
    const validation = await parseAndValidate(request, updateSettingsSchema);
    if (!validation.success || !validation.data) {
      return validationError(
        "Invalid request body",
        validation.errors?.map((e) => `${e.path}: ${e.message}`)
      );
    }

    const { integration, app } = validation.data;

    const settingsService = getSettingsService();
    const results: {
      integration?: IntegrationSettings;
      app?: AppSettings;
    } = {};

    if (integration) {
      // Update integration settings
      results.integration = await settingsService.updateIntegrationSettings(
        integration,
        "web-ui" // configuredBy
      );

      // Mask the client secret in response
      if (results.integration.partnerClientSecret) {
        results.integration = {
          ...results.integration,
          partnerClientSecret: "••••••••••••••••",
        };
      }
    }

    if (app) {
      results.app = await settingsService.updateAppSettings(app);

      // Mask webhook URLs in response
      if (results.app) {
        results.app = {
          ...results.app,
          slackWebhookUrl: results.app.slackWebhookUrl ? "••••••••••••••••" : undefined,
          teamsWebhookUrl: results.app.teamsWebhookUrl ? "••••••••••••••••" : undefined,
        };
      }
    }

    // Audit log settings changes
    writeAuditLog({
      timestamp: new Date().toISOString(),
      action: "settings.updated",
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
      resourceType: "settings",
      resourceName: "system_settings",
      details: {
        integrationUpdated: !!integration,
        appSettingsUpdated: !!app,
        configuredBy: session.user.email ?? undefined,
      },
      success: true,
    });

    return NextResponse.json({
      success: true,
      ...results,
      isConfigured: await settingsService.isIntegrationConfigured(),
    });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return internalError(
      "Failed to update settings",
      process.env.NODE_ENV === "development" && error instanceof Error
        ? { error: error.message }
        : undefined
    );
  }
}
