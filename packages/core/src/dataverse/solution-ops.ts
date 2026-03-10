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

import { writeFile, readFile } from "node:fs/promises";
import { DataverseClient, SolutionRecord } from "./client.js";
import { SolutionMetadata } from "../config/schema.js";

/**
 * Request parameters for ExportSolution action
 */
interface ExportSolutionRequest {
  SolutionName: string;
  Managed: boolean;
  ExportAutoNumberingSettings?: boolean;
  ExportCalendarSettings?: boolean;
  ExportCustomizationSettings?: boolean;
  ExportEmailTrackingSettings?: boolean;
  ExportGeneralSettings?: boolean;
  ExportMarketingSettings?: boolean;
  ExportOutlookSynchronizationSettings?: boolean;
  ExportRelationshipRoles?: boolean;
  ExportIsvConfig?: boolean;
  ExportSales?: boolean;
  ExportExternalApplications?: boolean;
}

/**
 * Response from ExportSolution action
 */
interface ExportSolutionResponse {
  ExportSolutionFile: string; // Base64 encoded zip file
}

/**
 * Request parameters for ImportSolution action
 */
interface ImportSolutionRequest {
  CustomizationFile: string; // Base64 encoded zip file
  OverwriteUnmanagedCustomizations?: boolean;
  PublishWorkflows?: boolean;
  ConvertToManaged?: boolean;
  SkipProductUpdateDependencies?: boolean;
  HoldingSolution?: boolean;
  ImportJobId?: string;
}

/**
 * Async import job status
 */
interface ImportJobStatus {
  importjobid: string;
  solutionname: string;
  progress: number;
  completedon: string | null;
  startedon: string;
  data: string;
}

export interface ExportOptions {
  managed?: boolean;
  outputPath: string;
}

export interface ImportOptions {
  overwriteUnmanagedCustomizations?: boolean;
  publishWorkflows?: boolean;
  convertToManaged?: boolean;
  async?: boolean;
}

export interface ImportResult {
  success: boolean;
  importJobId?: string;
  error?: string;
}

/**
 * High-level operations for Copilot Studio solution export/import
 */
export class SolutionOperations {
  constructor(private client: DataverseClient) {}

  /**
   * List all visible solutions in the environment
   */
  async listSolutions(): Promise<SolutionRecord[]> {
    return this.client.querySolutions();
  }

  /**
   * Get solution by unique name
   */
  async getSolution(uniqueName: string): Promise<SolutionRecord | null> {
    return this.client.getSolutionByName(uniqueName);
  }

  /**
   * Export a solution to a zip file
   */
  async exportSolution(solutionName: string, options: ExportOptions): Promise<SolutionMetadata> {
    // First, verify the solution exists
    const solution = await this.getSolution(solutionName);
    if (!solution) {
      throw new Error(`Solution '${solutionName}' not found in environment`);
    }

    const request: ExportSolutionRequest = {
      SolutionName: solutionName,
      Managed: options.managed ?? true, // Default to managed for deployment
    };

    const response = await this.client.executeAction<ExportSolutionRequest, ExportSolutionResponse>(
      "ExportSolution",
      request
    );

    // Decode base64 and write to file
    const solutionBuffer = Buffer.from(response.ExportSolutionFile, "base64");
    await writeFile(options.outputPath, solutionBuffer);

    return {
      uniqueName: solution.uniquename,
      friendlyName: solution.friendlyname,
      version: solution.version,
      isManaged: options.managed ?? true,
      publisherId: solution.publisherid?.publisherid,
    };
  }

  /**
   * Import a solution from a zip file
   */
  async importSolution(solutionPath: string, options: ImportOptions = {}): Promise<ImportResult> {
    // Read and encode the solution file
    const solutionBuffer = await readFile(solutionPath);
    const base64Solution = solutionBuffer.toString("base64");

    const importJobId = crypto.randomUUID();

    const request: ImportSolutionRequest = {
      CustomizationFile: base64Solution,
      OverwriteUnmanagedCustomizations: options.overwriteUnmanagedCustomizations ?? true,
      PublishWorkflows: options.publishWorkflows ?? true,
      ConvertToManaged: options.convertToManaged ?? false,
      ImportJobId: importJobId,
    };

    try {
      await this.client.executeAction<ImportSolutionRequest, void>("ImportSolution", request);

      return {
        success: true,
        importJobId,
      };
    } catch (error) {
      return {
        success: false,
        importJobId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Import a solution asynchronously and return immediately
   * Use checkImportStatus to poll for completion
   */
  async importSolutionAsync(solutionPath: string, options: ImportOptions = {}): Promise<string> {
    const solutionBuffer = await readFile(solutionPath);
    const base64Solution = solutionBuffer.toString("base64");

    const importJobId = crypto.randomUUID();

    // Use ImportSolutionAsync for async import
    await this.client.executeAction("ImportSolutionAsync", {
      CustomizationFile: base64Solution,
      OverwriteUnmanagedCustomizations: options.overwriteUnmanagedCustomizations ?? true,
      PublishWorkflows: options.publishWorkflows ?? true,
      ImportJobId: importJobId,
    });

    return importJobId;
  }

  /**
   * Check the status of an async import job
   */
  async checkImportStatus(importJobId: string): Promise<{
    progress: number;
    completed: boolean;
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await this.client.get<{ value: ImportJobStatus[] }>("/importjobs", {
        $filter: `importjobid eq '${importJobId}'`,
        $select: "importjobid,solutionname,progress,completedon,startedon,data",
      });

      if (result.value.length === 0) {
        return {
          progress: 0,
          completed: false,
          success: false,
          error: "Import job not found",
        };
      }

      const job = result.value[0];
      const completed = job.completedon !== null;

      // Parse the data XML to check for errors
      let success = true;
      let error: string | undefined;

      if (completed && job.data) {
        // The data field contains XML with import results
        // A successful import has no error elements
        if (job.data.includes('<result result="failure"') || job.data.includes("<errortext>")) {
          success = false;
          // Extract error message if present
          const errorMatch = job.data.match(/<errortext>([^<]+)<\/errortext>/);
          if (errorMatch) {
            error = errorMatch[1];
          }
        }
      }

      return {
        progress: job.progress,
        completed,
        success: completed ? success : false,
        error,
      };
    } catch (error) {
      return {
        progress: 0,
        completed: false,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Wait for an async import to complete with polling
   */
  async waitForImport(
    importJobId: string,
    options: {
      pollIntervalMs?: number;
      timeoutMs?: number;
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<ImportResult> {
    const {
      pollIntervalMs = 5000,
      timeoutMs = 600000, // 10 minutes default
      onProgress,
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.checkImportStatus(importJobId);

      if (onProgress) {
        onProgress(status.progress);
      }

      if (status.completed) {
        return {
          success: status.success,
          importJobId,
          error: status.error,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      success: false,
      importJobId,
      error: "Import timed out",
    };
  }
}
