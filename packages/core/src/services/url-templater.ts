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
import crypto from "node:crypto";

/**
 * URL Templating Service
 *
 * Detects tenant-specific URLs in Power Platform solutions and converts them to templates.
 * At deploy time, templates are resolved to target tenant values.
 */

import { coreLogger } from "./logger.js";

const logger = coreLogger;

// URL template types
export type UrlTemplateType = "sharepoint" | "dynamics_crm" | "onmicrosoft" | "custom";

// Generic ZIP file interface (compatible with JSZip)
export interface ZipFile {
  dir: boolean;
  async(type: "text"): Promise<string>;
}

/**
 * Map of ZIP output type identifiers to their concrete TS types.
 *
 * Mirrors the shape of JSZip's `OutputByType` so that {@link ZipArchive.generateAsync}
 * can return the correct concrete type based on the requested `type` option,
 * instead of falling back to `any`.
 */
export interface ZipOutputByType {
  nodebuffer: Buffer;
  arraybuffer: ArrayBuffer;
  blob: Blob;
  uint8array: Uint8Array;
  base64: string;
  string: string;
}

export type ZipOutputType = keyof ZipOutputByType;

/**
 * Options for generating a ZIP archive.
 *
 * The `type` field is a generic so that callers like `zip.generateAsync({ type: "nodebuffer" })`
 * yield a `Promise<Buffer>` rather than `Promise<any>`.
 */
export interface ZipGenerateOptions<T extends ZipOutputType = ZipOutputType> {
  type: T;
  compression?: "STORE" | "DEFLATE";
  compressionOptions?: { level: number };
}

/**
 * Generic ZIP archive interface (compatible with JSZip)
 */
export interface ZipArchive {
  files: Record<string, ZipFile>;
  file(path: string, content: string): void;
  generateAsync<T extends ZipOutputType>(
    options: ZipGenerateOptions<T>
  ): Promise<ZipOutputByType[T]>;
}

/**
 * Interface for loading ZIP files (compatible with JSZip)
 */
export interface ZipLoader {
  loadAsync(data: Buffer | ArrayBuffer): Promise<ZipArchive>;
}

// Detected URL from solution scanning
export interface DetectedUrl {
  type: UrlTemplateType;
  originalUrl: string;
  extractedTenant: string;
  templatePattern: string;
  fileLocation: string;
}

// URL template stored with agent
export interface UrlTemplate {
  id: string;
  type: UrlTemplateType;
  originalUrl: string;
  templatePattern: string;
  extractedTenant: string;
  fileLocations: string[];
  description?: string;
  confirmed: boolean;
}

// Agent's URL template configuration
export interface AgentUrlTemplates {
  sourceTenant: string;
  templates: UrlTemplate[];
  createdAt: string;
  confirmedAt?: string;
}

// Resolved tenant URL values
export interface TenantUrlValues {
  tenant: string;
  sharepoint: string;
  dynamicsCrm: string;
  onmicrosoft: string;
  region?: string;
}

// URL pattern definitions
interface UrlPattern {
  type: UrlTemplateType;
  regex: RegExp;
  extractTenant: (match: RegExpMatchArray) => string;
  extractRegion?: (match: RegExpMatchArray) => string;
  generateTemplate: (url: string, _tenant: string, region?: string) => string;
}

const URL_PATTERNS: UrlPattern[] = [
  {
    type: "sharepoint",
    // Matches: https://tenant.sharepoint.com/sites/path or https://tenant.sharepoint.com
    regex: /https?:\/\/([a-zA-Z0-9-]+)\.sharepoint\.com(\/[^\s"'<>]*)?/gi,
    extractTenant: (match) => match[1],
    generateTemplate: (url, _tenant) =>
      url.replace(
        new RegExp(`https?://([a-zA-Z0-9-]+)\\.sharepoint\\.com`, "i"),
        "https://{tenant}.sharepoint.com"
      ),
  },
  {
    type: "dynamics_crm",
    // Matches: https://tenant.crm.dynamics.com or https://tenant.crm4.dynamics.com
    regex: /https?:\/\/([a-zA-Z0-9-]+)\.(crm[0-9]*)\.dynamics\.com(\/[^\s"'<>]*)?/gi,
    extractTenant: (match) => match[1],
    extractRegion: (match) => match[2],
    generateTemplate: (url, _tenant, region) =>
      url.replace(
        new RegExp(`https?://([a-zA-Z0-9-]+)\\.(crm[0-9]*)\\.dynamics\\.com`, "i"),
        `https://{tenant}.${region || "crm"}.dynamics.com`
      ),
  },
  {
    type: "onmicrosoft",
    // Matches: https://tenant.onmicrosoft.com or tenant.onmicrosoft.com in email/UPN
    regex: /https?:\/\/([a-zA-Z0-9-]+)\.onmicrosoft\.com(\/[^\s"'<>]*)?/gi,
    extractTenant: (match) => match[1],
    generateTemplate: (url, _tenant) =>
      url.replace(
        new RegExp(`https?://([a-zA-Z0-9-]+)\\.onmicrosoft\\.com`, "i"),
        "https://{tenant}.onmicrosoft.com"
      ),
  },
];

// File extensions to scan for URLs
const TEXT_FILE_EXTENSIONS = [".xml", ".json", ".yaml", ".yml"];
const TEXT_FILE_PATTERNS = [/\/data$/i, /\.data$/i];

export class UrlTemplater {
  /**
   * Scan a solution ZIP for tenant-specific URLs
   *
   * @param zip - A ZipArchive instance (JSZip or compatible)
   * @returns Array of detected tenant-specific URLs with their locations
   */
  async scanSolution(zip: ZipArchive): Promise<DetectedUrl[]> {
    const detectedUrls: DetectedUrl[] = [];
    const seenUrls = new Set<string>();

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      const entry = zipEntry as ZipFile;
      if (entry.dir) continue;

      // Check if this is a text file we should scan
      const isTextFile =
        TEXT_FILE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)) ||
        TEXT_FILE_PATTERNS.some((pattern) => pattern.test(path));

      if (!isTextFile) continue;

      try {
        const content = await entry.async("text");
        const urlsInFile = this.extractUrlsFromContent(content, path);

        for (const url of urlsInFile) {
          // Dedupe by original URL
          if (!seenUrls.has(url.originalUrl)) {
            seenUrls.add(url.originalUrl);
            detectedUrls.push(url);
          }
        }
      } catch (error) {
        // Log at debug level - binary files will fail to parse as text and that's expected
        logger.debug("Skipping file that cannot be read as text", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return detectedUrls;
  }

  /**
   * Extract tenant-specific URLs from text content using pattern matching
   *
   * This function scans text content (typically from XML, JSON, or YAML files
   * within a Power Platform solution) and identifies tenant-specific URLs that
   * should be templated for multi-tenant deployment.
   *
   * **Supported URL patterns:**
   * - SharePoint: `https://{tenant}.sharepoint.com/...`
   * - Dynamics 365: `https://{tenant}.crm[N].dynamics.com/...`
   * - Microsoft 365: `https://{tenant}.onmicrosoft.com/...`
   *
   * Each detected URL is converted to a template pattern where the tenant
   * identifier is replaced with `{tenant}`, allowing the URL to be resolved
   * to different values for each target tenant during deployment.
   *
   * @param content - The text content to scan for URLs
   * @param fileLocation - Path of the file being scanned (for tracking purposes)
   * @returns Array of detected URLs with their types, extracted tenants, and template patterns
   *
   * @example
   * ```ts
   * const urls = templater.extractUrlsFromContent(
   *   '<SharePointUrl>https://contoso.sharepoint.com/sites/docs</SharePointUrl>',
   *   'solution/connections.xml'
   * );
   * // Returns: [{
   * //   type: 'sharepoint',
   * //   originalUrl: 'https://contoso.sharepoint.com/sites/docs',
   * //   extractedTenant: 'contoso',
   * //   templatePattern: 'https://{tenant}.sharepoint.com/sites/docs',
   * //   fileLocation: 'solution/connections.xml'
   * // }]
   * ```
   */
  extractUrlsFromContent(content: string, fileLocation: string): DetectedUrl[] {
    const urls: DetectedUrl[] = [];

    for (const pattern of URL_PATTERNS) {
      // Reset regex lastIndex
      pattern.regex.lastIndex = 0;

      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const originalUrl = match[0].replace(/[,;:'")\]}>]+$/, ""); // Clean trailing punctuation
        const tenant = pattern.extractTenant(match);
        const region = pattern.extractRegion?.(match);

        urls.push({
          type: pattern.type,
          originalUrl,
          extractedTenant: tenant,
          templatePattern: pattern.generateTemplate(originalUrl, tenant, region),
          fileLocation,
        });
      }
    }

    return urls;
  }

  /**
   * Infer the source tenant from detected URLs (most common tenant identifier)
   */
  inferSourceTenant(urls: DetectedUrl[]): string | null {
    if (urls.length === 0) return null;

    // Count occurrences of each tenant
    const tenantCounts = new Map<string, number>();
    for (const url of urls) {
      const count = tenantCounts.get(url.extractedTenant) || 0;
      tenantCounts.set(url.extractedTenant, count + 1);
    }

    // Return most common tenant
    let maxCount = 0;
    let mostCommonTenant: string | null = null;
    for (const [tenant, count] of tenantCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonTenant = tenant;
      }
    }

    return mostCommonTenant;
  }

  /**
   * Generate URL templates from detected URLs
   */
  generateTemplates(detectedUrls: DetectedUrl[]): UrlTemplate[] {
    // Group by original URL to combine file locations
    const urlMap = new Map<string, DetectedUrl[]>();
    for (const url of detectedUrls) {
      const existing = urlMap.get(url.originalUrl) || [];
      existing.push(url);
      urlMap.set(url.originalUrl, existing);
    }

    // Create templates
    const templates: UrlTemplate[] = [];
    for (const [originalUrl, urls] of urlMap) {
      const first = urls[0];
      templates.push({
        id: crypto.randomUUID(),
        type: first.type,
        originalUrl,
        templatePattern: first.templatePattern,
        extractedTenant: first.extractedTenant,
        fileLocations: urls.map((u) => u.fileLocation),
        description: this.getDescriptionForType(first.type),
        confirmed: false,
      });
    }

    return templates;
  }

  /**
   * Get a human-readable description for a URL type
   */
  private getDescriptionForType(type: UrlTemplateType): string {
    switch (type) {
      case "sharepoint":
        return "SharePoint site URL - will be updated per tenant";
      case "dynamics_crm":
        return "Dynamics 365 / Dataverse URL - will be updated per tenant";
      case "onmicrosoft":
        return "Microsoft 365 tenant domain - will be updated per tenant";
      case "custom":
        return "Custom URL pattern";
    }
  }

  /**
   * Resolve a template pattern to an actual URL for a target tenant
   */
  resolveTemplate(templatePattern: string, tenantUrls: TenantUrlValues): string {
    let resolved = templatePattern;

    // Replace {tenant} placeholder
    resolved = resolved.replace(/\{tenant\}/g, tenantUrls.tenant);

    // Replace full domain patterns if present
    resolved = resolved.replace(/\{tenant\}\.sharepoint\.com/g, tenantUrls.sharepoint);
    resolved = resolved.replace(/\{tenant\}\.(crm[0-9]*)\.dynamics\.com/g, tenantUrls.dynamicsCrm);
    resolved = resolved.replace(/\{tenant\}\.onmicrosoft\.com/g, tenantUrls.onmicrosoft);

    return resolved;
  }

  /**
   * Modify a Power Platform solution ZIP by replacing tenant-specific URLs
   *
   * This function takes a solution ZIP file and performs URL replacements
   * in all text files (XML, JSON, YAML) within the archive. It's used during
   * deployment to customize solutions for specific target tenants.
   *
   * **How it works:**
   * 1. Loads the ZIP file into memory
   * 2. Iterates through all files in the archive
   * 3. For text files, performs string replacements for each URL mapping
   * 4. Generates a new ZIP buffer with the modified content
   *
   * **Important notes:**
   * - Binary files are skipped (images, compiled resources, etc.)
   * - The original ZIP is not modified; a new buffer is returned
   * - If no replacements are needed, the original buffer is returned unchanged
   * - Requires a JSZip-compatible loader to be passed in
   *
   * @param zipBuffer - The original solution ZIP file as a Buffer
   * @param replacements - Map of original URLs to resolved URLs
   * @param zipLoader - JSZip-compatible loader for reading/writing ZIP files
   * @returns New Buffer containing the modified solution ZIP
   *
   * @example
   * ```ts
   * const JSZip = require('jszip');
   * const replacements = new Map([
   *   ['https://contoso.sharepoint.com', 'https://fabrikam.sharepoint.com'],
   *   ['https://contoso.crm.dynamics.com', 'https://fabrikam.crm.dynamics.com'],
   * ]);
   * const modifiedZip = await templater.modifySolution(
   *   originalZipBuffer,
   *   replacements,
   *   new JSZip()
   * );
   * ```
   */
  async modifySolution(
    zipBuffer: Buffer,
    replacements: Map<string, string>,
    zipLoader: ZipLoader
  ): Promise<Buffer> {
    if (replacements.size === 0) {
      return zipBuffer;
    }

    const zip = await zipLoader.loadAsync(zipBuffer);

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      const entry = zipEntry as ZipFile;
      if (entry.dir) continue;

      // Check if this is a text file
      const isTextFile =
        TEXT_FILE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)) ||
        TEXT_FILE_PATTERNS.some((pattern) => pattern.test(path));

      if (!isTextFile) continue;

      try {
        let content = await entry.async("text");
        let modified = false;

        // Apply all replacements
        for (const [original, resolved] of replacements) {
          if (content.includes(original)) {
            content = content.split(original).join(resolved);
            modified = true;
          }
        }

        if (modified) {
          zip.file(path, content);
        }
      } catch (error) {
        // Log at debug level - binary files will fail to process and that's expected
        logger.debug("Skipping file that cannot be processed for URL replacement", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Generate modified ZIP
    return await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
  }

  /**
   * Create a complete AgentUrlTemplates object from scanning results
   */
  createAgentUrlTemplates(detectedUrls: DetectedUrl[]): AgentUrlTemplates | null {
    if (detectedUrls.length === 0) {
      return null;
    }

    const sourceTenant = this.inferSourceTenant(detectedUrls);
    if (!sourceTenant) {
      return null;
    }

    return {
      sourceTenant,
      templates: this.generateTemplates(detectedUrls),
      createdAt: new Date().toISOString(),
    };
  }
}

// Export singleton instance
export const urlTemplater = new UrlTemplater();
