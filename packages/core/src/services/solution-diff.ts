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

import { readFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import { DataverseClient, SolutionOperations } from "../dataverse/index.js";

/**
 * Component type codes in Power Platform
 */
export const ComponentTypes: Record<number, string> = {
  1: "Entity",
  2: "Attribute",
  3: "Relationship",
  9: "Option Set",
  10: "Entity Relationship",
  20: "Security Role",
  21: "Privilege",
  26: "View",
  29: "Workflow",
  59: "Saved Query Visualization",
  60: "Form",
  61: "Organization",
  62: "Web Resource",
  63: "Site Map",
  65: "Plugin Assembly",
  70: "Plugin Type",
  90: "SDK Message Processing Step",
  91: "SDK Message Processing Step Image",
  92: "Service Endpoint",
  150: "Duplicate Detection Rule",
  300: "Canvas App",
  371: "Connector",
  372: "Connection Reference",
  380: "Environment Variable Definition",
  381: "Environment Variable Value",
  10029: "AI Model",
  10034: "Bot Component",
};

/**
 * Solution component record
 */
export interface SolutionComponentRecord {
  solutioncomponentid: string;
  componenttype: number;
  objectid: string;
  rootsolutioncomponentid: string | null;
  ismetadata: boolean;
}

/**
 * Component difference
 */
export interface ComponentDiff {
  type: "added" | "removed" | "modified";
  componentType: number;
  componentTypeName: string;
  objectId: string;
  name?: string;
}

/**
 * Solution comparison result
 */
export interface SolutionComparisonResult {
  source: {
    uniqueName: string;
    version: string;
    componentCount: number;
  };
  target: {
    uniqueName: string;
    version: string;
    componentCount: number;
  } | null;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  differences: ComponentDiff[];
  isUpgrade: boolean;
  isNewInstall: boolean;
}

/**
 * Service for comparing solutions and previewing changes
 */
export class SolutionDiffService {
  /**
   * Compare a solution file against what's installed in a target environment
   */
  async compareSolutions(
    solutionPath: string,
    targetClient: DataverseClient
  ): Promise<SolutionComparisonResult> {
    // Parse the solution file to get metadata
    const sourceMetadata = await this.parseSolutionFile(solutionPath);

    if (!sourceMetadata) {
      throw new Error("Failed to parse solution file");
    }

    // Get the installed solution in target environment
    const solutionOps = new SolutionOperations(targetClient);
    const installedSolution = await solutionOps.getSolution(sourceMetadata.uniqueName);

    // If solution doesn't exist in target, it's a new install
    if (!installedSolution) {
      return {
        source: {
          uniqueName: sourceMetadata.uniqueName,
          version: sourceMetadata.version,
          componentCount: sourceMetadata.componentCount || 0,
        },
        target: null,
        summary: {
          added: sourceMetadata.componentCount || 0,
          removed: 0,
          modified: 0,
          unchanged: 0,
        },
        differences: [],
        isUpgrade: false,
        isNewInstall: true,
      };
    }

    // Get components from installed solution
    const installedComponents = await this.getSolutionComponents(
      targetClient,
      installedSolution.solutionid
    );

    // For a proper diff, we would need to extract components from the zip file
    // This is a simplified version that compares versions and basic info
    const isUpgrade = this.compareVersions(sourceMetadata.version, installedSolution.version) > 0;

    return {
      source: {
        uniqueName: sourceMetadata.uniqueName,
        version: sourceMetadata.version,
        componentCount: sourceMetadata.componentCount || 0,
      },
      target: {
        uniqueName: installedSolution.uniquename,
        version: installedSolution.version,
        componentCount: installedComponents.length,
      },
      summary: {
        added: 0,
        removed: 0,
        modified: 0,
        unchanged: installedComponents.length,
      },
      differences: [],
      isUpgrade,
      isNewInstall: false,
    };
  }

  /**
   * Get all components from a solution
   */
  async getSolutionComponents(
    client: DataverseClient,
    solutionId: string
  ): Promise<SolutionComponentRecord[]> {
    const result = await client.get<{ value: SolutionComponentRecord[] }>("/solutioncomponents", {
      $filter: `_solutionid_value eq '${solutionId}'`,
      $select: "solutioncomponentid,componenttype,objectid,rootsolutioncomponentid,ismetadata",
    });

    return result.value;
  }

  /**
   * Parse solution.xml from a solution zip file
   */
  async parseSolutionFile(solutionPath: string): Promise<{
    uniqueName: string;
    version: string;
    friendlyName: string;
    isManaged: boolean;
    componentCount?: number;
  } | null> {
    try {
      const buffer = await readFile(solutionPath);

      // Solutions are ZIP files - we need to extract solution.xml
      // Using a simple approach: look for the XML content in the buffer
      const content = buffer.toString("utf-8");

      // Extract unique name
      const uniqueNameMatch = content.match(/<UniqueName>([^<]+)<\/UniqueName>/);
      const versionMatch = content.match(/<Version>([^<]+)<\/Version>/);
      const friendlyNameMatch = content.match(/<LocalizedName[^>]*description="([^"]+)"/);
      const managedMatch = content.match(/<Managed>([^<]+)<\/Managed>/);

      if (!uniqueNameMatch || !versionMatch) {
        // Try to use JSZip if available, otherwise return minimal info
        return null;
      }

      return {
        uniqueName: uniqueNameMatch[1],
        version: versionMatch[1],
        friendlyName: friendlyNameMatch?.[1] || uniqueNameMatch[1],
        isManaged: managedMatch?.[1] === "1" || managedMatch?.[1] === "true",
      };
    } catch {
      return null;
    }
  }

  /**
   * Compare two version strings
   * Returns: >0 if v1 > v2, <0 if v1 < v2, 0 if equal
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 !== p2) {
        return p1 - p2;
      }
    }

    return 0;
  }

  /**
   * Preview what will happen during deployment
   */
  async previewDeployment(
    solutionPath: string,
    targetClient: DataverseClient
  ): Promise<{
    willInstall: boolean;
    willUpgrade: boolean;
    sourceVersion: string;
    targetVersion: string | null;
    warnings: string[];
    estimatedDurationMs: number;
  }> {
    const comparison = await this.compareSolutions(solutionPath, targetClient);
    const warnings: string[] = [];

    // Check for potential issues
    if (!comparison.isNewInstall && !comparison.isUpgrade && comparison.target) {
      if (this.compareVersions(comparison.source.version, comparison.target.version) < 0) {
        warnings.push(
          `Source version (${comparison.source.version}) is older than target (${comparison.target.version}). This may cause issues.`
        );
      }

      if (comparison.source.version === comparison.target.version) {
        warnings.push(
          `Same version (${comparison.source.version}) already installed. Import will overwrite existing customizations.`
        );
      }
    }

    // Estimate duration based on component count
    const componentCount = comparison.source.componentCount;
    const baseDuration = 30000; // 30 seconds base
    const perComponentDuration = 100; // 100ms per component
    const estimatedDurationMs = baseDuration + componentCount * perComponentDuration;

    return {
      willInstall: comparison.isNewInstall,
      willUpgrade: comparison.isUpgrade,
      sourceVersion: comparison.source.version,
      targetVersion: comparison.target?.version || null,
      warnings,
      estimatedDurationMs,
    };
  }

  /**
   * Calculate checksum for a solution file
   */
  async calculateChecksum(solutionPath: string): Promise<string> {
    const buffer = await readFile(solutionPath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verify solution file integrity
   */
  async verifySolutionIntegrity(
    solutionPath: string,
    expectedChecksum?: string
  ): Promise<{
    valid: boolean;
    checksum: string;
    errors: string[];
  }> {
    const errors: string[] = [];
    let checksum: string;

    try {
      checksum = await this.calculateChecksum(solutionPath);
    } catch (error) {
      return {
        valid: false,
        checksum: "",
        errors: [
          `Failed to read solution file: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }

    // Verify checksum if provided
    if (expectedChecksum && checksum !== expectedChecksum) {
      errors.push(`Checksum mismatch: expected ${expectedChecksum}, got ${checksum}`);
    }

    // Try to parse the solution
    const metadata = await this.parseSolutionFile(solutionPath);
    if (!metadata) {
      errors.push("Failed to parse solution metadata from file");
    }

    return {
      valid: errors.length === 0,
      checksum,
      errors,
    };
  }

  /**
   * Get summary of solution contents (for display purposes)
   */
  async getSolutionSummary(solutionPath: string): Promise<{
    uniqueName: string;
    version: string;
    friendlyName: string;
    isManaged: boolean;
    checksum: string;
    fileSizeBytes: number;
  } | null> {
    try {
      const buffer = await readFile(solutionPath);
      const metadata = await this.parseSolutionFile(solutionPath);

      if (!metadata) {
        return null;
      }

      return {
        ...metadata,
        checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
        fileSizeBytes: buffer.length,
      };
    } catch {
      return null;
    }
  }
}
