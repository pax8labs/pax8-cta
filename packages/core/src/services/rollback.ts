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

import { writeFile, readFile, mkdir, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { DeploymentSnapshot, RollbackSettings, parseDuration } from "../config/schema.js";
import { DataverseClient, SolutionOperations } from "../dataverse/index.js";
import { coreLogger } from "./logger.js";

const logger = coreLogger;

/**
 * Service for managing deployment snapshots and rollback capabilities
 */
export class RollbackService {
  private snapshotsDir: string;

  constructor(snapshotsDir: string = "./snapshots") {
    this.snapshotsDir = snapshotsDir;
  }

  /**
   * Create a snapshot of the current solution state before deployment
   */
  async createSnapshot(
    deploymentId: string,
    tenantId: string,
    tenantName: string,
    solutionName: string,
    client: DataverseClient,
    settings: RollbackSettings
  ): Promise<DeploymentSnapshot | null> {
    if (!settings.enabled) {
      return null;
    }

    const solutionOps = new SolutionOperations(client);

    // Check if solution exists in target environment
    const existingSolution = await solutionOps.getSolution(solutionName);
    if (!existingSolution) {
      // No existing solution to snapshot
      return null;
    }

    const snapshotId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Calculate expiry based on keepVersions (we'll clean up old ones separately)
    const expiresAt = settings.keepVersions
      ? new Date(Date.now() + settings.keepVersions * 30 * 24 * 60 * 60 * 1000).toISOString() // Approximate: keep for keepVersions months
      : undefined;

    // Export current solution version
    const snapshotDir = join(this.snapshotsDir, deploymentId, tenantId);
    await mkdir(snapshotDir, { recursive: true });

    const solutionPath = join(
      snapshotDir,
      `${solutionName}_${existingSolution.version}_snapshot.zip`
    );

    try {
      await solutionOps.exportSolution(solutionName, {
        managed: existingSolution.ismanaged,
        outputPath: solutionPath,
      });
    } catch (error) {
      logger.error(
        "Failed to create snapshot",
        error instanceof Error ? error : new Error(String(error)),
        {
          tenantName,
          solutionName,
          deploymentId,
        }
      );
      return null;
    }

    const snapshot: DeploymentSnapshot = {
      id: snapshotId,
      deploymentId,
      tenantId,
      tenantName,
      solutionName,
      previousVersion: existingSolution.version,
      previousSolutionPath: solutionPath,
      createdAt: timestamp,
      expiresAt,
      metadata: {
        isManaged: existingSolution.ismanaged,
        friendlyName: existingSolution.friendlyname,
      },
    };

    // Save snapshot metadata
    const metadataPath = join(snapshotDir, `${snapshotId}.json`);
    await writeFile(metadataPath, JSON.stringify(snapshot, null, 2));

    return snapshot;
  }

  /**
   * Rollback a tenant to a previous snapshot
   */
  async rollback(
    snapshotId: string,
    client: DataverseClient,
    options: {
      timeout?: string;
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<{
    success: boolean;
    error?: string;
    restoredVersion?: string;
  }> {
    // Find snapshot
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) {
      return { success: false, error: "Snapshot not found" };
    }

    if (!snapshot.previousSolutionPath) {
      return { success: false, error: "Snapshot has no solution file" };
    }

    // Verify solution file exists
    try {
      await stat(snapshot.previousSolutionPath);
    } catch {
      return { success: false, error: "Snapshot solution file not found" };
    }

    const solutionOps = new SolutionOperations(client);
    const timeoutMs = options.timeout ? parseDuration(options.timeout) : 600000;

    try {
      // Import the previous version
      const importJobId = await solutionOps.importSolutionAsync(snapshot.previousSolutionPath, {
        overwriteUnmanagedCustomizations: true,
        publishWorkflows: true,
      });

      // Wait for import to complete
      const result = await solutionOps.waitForImport(importJobId, {
        timeoutMs,
        onProgress: options.onProgress,
      });

      if (result.success) {
        return {
          success: true,
          restoredVersion: snapshot.previousVersion,
        };
      } else {
        return {
          success: false,
          error: result.error || "Rollback import failed",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get a snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<DeploymentSnapshot | null> {
    const snapshots = await this.listAllSnapshots();
    return snapshots.find((s) => s.id === snapshotId) || null;
  }

  /**
   * List all snapshots for a deployment
   */
  async listSnapshotsForDeployment(deploymentId: string): Promise<DeploymentSnapshot[]> {
    const snapshots = await this.listAllSnapshots();
    return snapshots.filter((s) => s.deploymentId === deploymentId);
  }

  /**
   * List all snapshots for a tenant
   */
  async listSnapshotsForTenant(tenantId: string): Promise<DeploymentSnapshot[]> {
    const snapshots = await this.listAllSnapshots();
    return snapshots.filter((s) => s.tenantId === tenantId);
  }

  /**
   * List all snapshots
   */
  async listAllSnapshots(): Promise<DeploymentSnapshot[]> {
    const snapshots: DeploymentSnapshot[] = [];

    try {
      const deploymentDirs = await readdir(this.snapshotsDir);

      for (const deploymentDir of deploymentDirs) {
        const deploymentPath = join(this.snapshotsDir, deploymentDir);
        const deploymentStat = await stat(deploymentPath);

        if (!deploymentStat.isDirectory()) continue;

        const tenantDirs = await readdir(deploymentPath);

        for (const tenantDir of tenantDirs) {
          const tenantPath = join(deploymentPath, tenantDir);
          const tenantStat = await stat(tenantPath);

          if (!tenantStat.isDirectory()) continue;

          const files = await readdir(tenantPath);

          for (const file of files) {
            if (file.endsWith(".json")) {
              try {
                const content = await readFile(join(tenantPath, file), "utf-8");
                const snapshot = JSON.parse(content) as DeploymentSnapshot;
                snapshots.push(snapshot);
              } catch {
                // Ignore invalid snapshot files
              }
            }
          }
        }
      }
    } catch {
      // Snapshots directory doesn't exist yet
    }

    return snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Delete a specific snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) return false;

    const snapshotDir = join(this.snapshotsDir, snapshot.deploymentId, snapshot.tenantId);

    try {
      // Delete metadata file
      await unlink(join(snapshotDir, `${snapshotId}.json`));

      // Delete solution file if it exists
      if (snapshot.previousSolutionPath) {
        try {
          await unlink(snapshot.previousSolutionPath);
        } catch {
          // File might already be deleted
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired snapshots
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    const snapshots = await this.listAllSnapshots();
    const now = new Date();
    let deleted = 0;

    for (const snapshot of snapshots) {
      if (snapshot.expiresAt && new Date(snapshot.expiresAt) < now) {
        if (await this.deleteSnapshot(snapshot.id)) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Clean up old snapshots beyond keepVersions limit for a tenant
   */
  async cleanupOldSnapshots(
    tenantId: string,
    solutionName: string,
    keepVersions: number
  ): Promise<number> {
    const tenantSnapshots = (await this.listSnapshotsForTenant(tenantId))
      .filter((s) => s.solutionName === solutionName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let deleted = 0;

    // Keep only the most recent keepVersions snapshots
    for (let i = keepVersions; i < tenantSnapshots.length; i++) {
      if (await this.deleteSnapshot(tenantSnapshots[i].id)) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get the most recent snapshot for a tenant and solution
   */
  async getLatestSnapshot(
    tenantId: string,
    solutionName: string
  ): Promise<DeploymentSnapshot | null> {
    const snapshots = (await this.listSnapshotsForTenant(tenantId))
      .filter((s) => s.solutionName === solutionName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return snapshots[0] || null;
  }
}
