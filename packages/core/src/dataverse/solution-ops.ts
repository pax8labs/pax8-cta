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

import { writeFile, readFile } from "node:fs/promises";
import { DataverseClient, SolutionRecord } from "./client.js";
import { SolutionMetadata } from "../config/schema.js";
import { SolutionError, ErrorCode } from "../errors.js";

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
 * A record from Dataverse's msdyn_solutionhistory entity
 */
export interface SolutionHistoryRecord {
  msdyn_solutionhistoryid: string;
  msdyn_name: string;
  msdyn_solutionversion: string;
  msdyn_operation: number; // 0=Import, 1=Uninstall, 2=Export
  msdyn_suboperation: number; // 0=None, 1=New, 2=Upgrade, 3=Update
  msdyn_result: boolean;
  msdyn_status: number; // 0=Started, 1=Completed
  msdyn_starttime: string;
  msdyn_endtime: string | null;
  msdyn_totaltime: number | null; // seconds
  msdyn_ismanaged: boolean;
  msdyn_exceptionmessage: string | null;
  msdyn_errorcode: number | null;
  msdyn_publishername: string | null;
}

export interface SolutionHistoryOptions {
  /** Filter by solution name */
  solutionName?: string;
  /** Filter by operation type: 'import' | 'uninstall' | 'export' | 'all' */
  operation?: "import" | "uninstall" | "export" | "all";
  /** Maximum number of records to return */
  limit?: number;
}

/**
 * High-level operations for Copilot Studio solution export/import
 */
export class SolutionOperations {
  constructor(private client: DataverseClient) {}

  private isAsyncImportDisabledError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    return (
      normalized.includes("async operations are currently disabled") ||
      normalized.includes("asynchronous operations are currently disabled")
    );
  }

  /**
   * List all visible solutions in the environment
   */
  async listSolutions(): Promise<SolutionRecord[]> {
    return this.client.querySolutions();
  }

  /**
   * Delete (uninstall) a managed solution from the environment.
   * This removes the solution and all its components.
   */
  async deleteSolution(uniqueName: string): Promise<void> {
    const solution = await this.getSolution(uniqueName);
    if (!solution) {
      throw new Error(`Solution '${uniqueName}' not found in environment`);
    }
    if (!solution.ismanaged) {
      throw new Error(
        `Solution '${uniqueName}' is unmanaged. Only managed solutions can be uninstalled.`
      );
    }
    await this.client.delete(`/solutions(${solution.solutionid})`);
  }

  /**
   * Get solution by unique name
   */
  async getSolution(uniqueName: string): Promise<SolutionRecord | null> {
    return this.client.getSolutionByName(uniqueName);
  }

  /**
   * Query solution history (imports, uninstalls, exports) from Dataverse
   */
  async getSolutionHistory(options: SolutionHistoryOptions = {}): Promise<SolutionHistoryRecord[]> {
    const { solutionName, operation = "all", limit = 50 } = options;

    const filters: string[] = [];

    if (solutionName) {
      filters.push(`msdyn_name eq '${solutionName}'`);
    }

    const opMap = { import: 0, uninstall: 1, export: 2 };
    if (operation !== "all") {
      filters.push(`msdyn_operation eq ${opMap[operation]}`);
    }

    const params: Record<string, string> = {
      $select: [
        "msdyn_solutionhistoryid",
        "msdyn_name",
        "msdyn_solutionversion",
        "msdyn_operation",
        "msdyn_suboperation",
        "msdyn_result",
        "msdyn_status",
        "msdyn_starttime",
        "msdyn_endtime",
        "msdyn_totaltime",
        "msdyn_ismanaged",
        "msdyn_exceptionmessage",
        "msdyn_errorcode",
        "msdyn_publishername",
      ].join(","),
      $orderby: "msdyn_starttime desc",
      $top: String(limit),
    };

    if (filters.length > 0) {
      params.$filter = filters.join(" and ");
    }

    const result = await this.client.get<{ value: SolutionHistoryRecord[] }>(
      "/msdyn_solutionhistories",
      params
    );

    return result.value;
  }

  /**
   * Export a solution to a zip file
   */
  async exportSolution(solutionName: string, options: ExportOptions): Promise<SolutionMetadata> {
    // First, verify the solution exists
    const solution = await this.getSolution(solutionName);
    if (!solution) {
      throw new SolutionError(
        ErrorCode.SOLUTION_NOT_FOUND,
        `Solution '${solutionName}' not found in environment`,
        {
          solutionName,
        }
      );
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

    const request: ImportSolutionRequest = {
      CustomizationFile: base64Solution,
      OverwriteUnmanagedCustomizations: options.overwriteUnmanagedCustomizations ?? true,
      PublishWorkflows: options.publishWorkflows ?? true,
      ImportJobId: importJobId,
    };

    try {
      // Preferred path for normal environments.
      await this.client.executeAction("ImportSolutionAsync", request);
    } catch (error) {
      // Some environments (for example when async/background operations are disabled)
      // reject ImportSolutionAsync. Fall back to synchronous import so deployments
      // can still proceed.
      if (!this.isAsyncImportDisabledError(error)) {
        throw error;
      }

      await this.client.executeAction("ImportSolution", {
        ...request,
        ConvertToManaged: options.convertToManaged ?? false,
      });
    }

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
        // Check for failure indicators
        if (
          job.data.includes('succeeded="failure"') ||
          job.data.includes('<result result="failure"') ||
          job.data.includes("<errortext>")
        ) {
          success = false;

          // Try multiple patterns to extract error message
          // Pattern 1: status attribute in importexportxml element
          const statusMatch = job.data.match(/status="([^"]+)"/);
          if (statusMatch && statusMatch[1].includes("FAILURE")) {
            // Extract the actual error message after "FAILURE:"
            const failureMsg = statusMatch[1].replace(/^[^:]+:\s*FAILURE:\s*/, "");
            error = failureMsg || statusMatch[1];
          }

          // Pattern 2: errortext element
          if (!error) {
            const errorMatch = job.data.match(/<errortext>([^<]+)<\/errortext>/);
            if (errorMatch) {
              error = errorMatch[1];
            }
          }

          // Pattern 3: Fallback to component name
          if (!error) {
            const componentMatch = job.data.match(/<name>([^<]+)<\/name>/);
            error = componentMatch
              ? `Import failed for component: ${componentMatch[1]}`
              : "Import failed - check solution compatibility";
          }
        }
      } else if (completed && !job.data) {
        // Completed but no data - unusual, treat as potential failure
        error = "Import completed but no result data returned";
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
