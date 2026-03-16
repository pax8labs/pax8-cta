/**
 * Copyright 2024 Pax8, Inc.
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
 * Tenant URL Resolver
 *
 * Derives tenant-specific URL values from a tenant's configuration,
 * primarily using the environmentUrl (Dynamics CRM URL) as the source of truth.
 */

import { TenantConfig } from "../config/schema.js";
import { TenantUrlValues } from "./url-templater.js";

/**
 * Resolve tenant URL values from a TenantConfig
 *
 * Uses the environmentUrl (e.g., https://contoso.crm.dynamics.com) to derive:
 * - tenant: The org/tenant identifier (e.g., "contoso")
 * - sharepoint: SharePoint domain (e.g., "contoso.sharepoint.com")
 * - dynamicsCrm: Dynamics CRM domain (e.g., "contoso.crm.dynamics.com")
 * - onmicrosoft: Default tenant domain (e.g., "contoso.onmicrosoft.com")
 */
export function resolveTenantUrls(tenant: TenantConfig): TenantUrlValues {
  try {
    const url = new URL(tenant.environmentUrl);
    const hostname = url.hostname;

    // Try to parse Dynamics CRM URL: {org}.crm{N}.dynamics.com
    const crmMatch = hostname.match(/^([a-zA-Z0-9-]+)\.(crm[0-9]*)\.dynamics\.com$/i);

    if (crmMatch) {
      const orgName = crmMatch[1];
      const region = crmMatch[2];

      return {
        tenant: orgName,
        sharepoint: `${orgName}.sharepoint.com`,
        dynamicsCrm: `${orgName}.${region}.dynamics.com`,
        onmicrosoft: `${orgName}.onmicrosoft.com`,
        region,
      };
    }

    // Try alternate format: {org}.api.crm{N}.dynamics.com
    const apiMatch = hostname.match(/^([a-zA-Z0-9-]+)\.api\.(crm[0-9]*)\.dynamics\.com$/i);

    if (apiMatch) {
      const orgName = apiMatch[1];
      const region = apiMatch[2];

      return {
        tenant: orgName,
        sharepoint: `${orgName}.sharepoint.com`,
        dynamicsCrm: `${orgName}.${region}.dynamics.com`,
        onmicrosoft: `${orgName}.onmicrosoft.com`,
        region,
      };
    }
  } catch {
    // Invalid URL, fall through to fallback
  }

  // Fallback: sanitize tenant name to create a valid identifier
  const sanitized = sanitizeTenantName(tenant.name);

  return {
    tenant: sanitized,
    sharepoint: `${sanitized}.sharepoint.com`,
    dynamicsCrm: `${sanitized}.crm.dynamics.com`,
    onmicrosoft: `${sanitized}.onmicrosoft.com`,
  };
}

/**
 * Sanitize a tenant name to create a valid URL identifier
 */
function sanitizeTenantName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") // Remove invalid characters
      .replace(/^-+|-+$/g, "") // Remove leading/trailing dashes
      .substring(0, 63) || // Max subdomain length
    "tenant"
  ); // Fallback if empty
}

/**
 * Apply manual overrides to resolved tenant URLs
 */
export function applyUrlOverrides(
  tenantUrls: TenantUrlValues,
  overrides?: Partial<TenantUrlValues>
): TenantUrlValues {
  if (!overrides) {
    return tenantUrls;
  }

  return {
    tenant: overrides.tenant || tenantUrls.tenant,
    sharepoint: overrides.sharepoint || tenantUrls.sharepoint,
    dynamicsCrm: overrides.dynamicsCrm || tenantUrls.dynamicsCrm,
    onmicrosoft: overrides.onmicrosoft || tenantUrls.onmicrosoft,
    region: overrides.region || tenantUrls.region,
  };
}

/**
 * Validate that all required URL values are present
 */
export function validateTenantUrls(tenantUrls: TenantUrlValues): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!tenantUrls.tenant) missing.push("tenant");
  if (!tenantUrls.sharepoint) missing.push("sharepoint");
  if (!tenantUrls.dynamicsCrm) missing.push("dynamicsCrm");
  if (!tenantUrls.onmicrosoft) missing.push("onmicrosoft");

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get a preview of URL transformations for a tenant
 */
export function previewUrlTransformations(
  templates: Array<{ originalUrl: string; templatePattern: string }>,
  tenantUrls: TenantUrlValues
): Array<{ original: string; resolved: string }> {
  return templates.map((template) => {
    let resolved = template.templatePattern;

    // Replace {tenant} placeholder
    resolved = resolved.replace(/\{tenant\}/g, tenantUrls.tenant);

    return {
      original: template.originalUrl,
      resolved,
    };
  });
}
