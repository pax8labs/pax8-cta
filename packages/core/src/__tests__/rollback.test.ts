import { describe, it, expect, vi, beforeEach } from "vitest";
import { RollbackService } from "../services/rollback.js";
import { DataverseClient } from "../dataverse/client.js";
import { RollbackSettings } from "../config/schema.js";

// Mock the logger before importing modules that use it
vi.mock("../services/logger.js", () => ({
  coreLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => "snapshot-uuid-1234",
});

// Mock fs/promises - use vi.hoisted to ensure mocks are available before module loading
const mockFsModule = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

vi.mock("node:fs/promises", () => mockFsModule);

describe("RollbackService", () => {
  let rollbackService: RollbackService;
  let mockClient: DataverseClient;

  const mockRollbackSettings: RollbackSettings = {
    enabled: true,
    autoRollbackOnFailure: true,
    keepVersions: 3,
    rollbackTimeout: "10m",
  };

  const disabledRollbackSettings: RollbackSettings = {
    enabled: false,
    autoRollbackOnFailure: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    rollbackService = new RollbackService("./test-snapshots");

    // Create mock client with essential methods
    mockClient = {
      querySolutions: vi.fn(),
      getSolutionByName: vi.fn().mockResolvedValue({
        solutionid: "sol-123",
        uniquename: "TestSolution",
        friendlyname: "Test Solution",
        version: "1.0.0.0",
        ismanaged: true,
        isvisible: true,
      }),
      executeAction: vi.fn().mockResolvedValue({
        ExportSolutionFile: Buffer.from("mock-solution").toString("base64"),
      }),
      get: vi.fn(),
    } as unknown as DataverseClient;

    // Reset fs mocks
    mockFsModule.readdir.mockResolvedValue([]);
    mockFsModule.stat.mockResolvedValue({ isDirectory: () => true });
  });

  describe("createSnapshot", () => {
    it("should create snapshot when rollback is enabled and solution exists", async () => {
      const snapshot = await rollbackService.createSnapshot(
        "deploy-123",
        "tenant-123",
        "Test Tenant",
        "TestSolution",
        mockClient,
        mockRollbackSettings
      );

      expect(snapshot).not.toBeNull();
      expect(snapshot?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(snapshot?.solutionName).toBe("TestSolution");
      expect(snapshot?.tenantId).toBe("tenant-123");
      expect(snapshot?.tenantName).toBe("Test Tenant");
      expect(snapshot?.previousVersion).toBe("1.0.0.0");
      expect(mockFsModule.mkdir).toHaveBeenCalled();
      expect(mockFsModule.writeFile).toHaveBeenCalled();
    });

    it("should return null when rollback is disabled", async () => {
      const snapshot = await rollbackService.createSnapshot(
        "deploy-123",
        "tenant-123",
        "Test Tenant",
        "TestSolution",
        mockClient,
        disabledRollbackSettings
      );

      expect(snapshot).toBeNull();
      expect(mockClient.getSolutionByName).not.toHaveBeenCalled();
    });

    it("should return null when solution does not exist in environment", async () => {
      vi.mocked(mockClient.getSolutionByName).mockResolvedValue(null);

      const snapshot = await rollbackService.createSnapshot(
        "deploy-123",
        "tenant-123",
        "Test Tenant",
        "NonExistentSolution",
        mockClient,
        mockRollbackSettings
      );

      expect(snapshot).toBeNull();
    });

    it("should return null when export fails", async () => {
      vi.mocked(mockClient.executeAction).mockRejectedValue(new Error("Export failed"));

      const snapshot = await rollbackService.createSnapshot(
        "deploy-123",
        "tenant-123",
        "Test Tenant",
        "TestSolution",
        mockClient,
        mockRollbackSettings
      );

      expect(snapshot).toBeNull();
    });

    it("should calculate expiry date based on keepVersions", async () => {
      const snapshot = await rollbackService.createSnapshot(
        "deploy-123",
        "tenant-123",
        "Test Tenant",
        "TestSolution",
        mockClient,
        { ...mockRollbackSettings, keepVersions: 2 }
      );

      expect(snapshot).not.toBeNull();
      expect(snapshot?.expiresAt).toBeDefined();
      // Expiry should be approximately 2 months from now
      const expiryDate = new Date(snapshot!.expiresAt!);
      const now = new Date();
      const twoMonthsFromNow = new Date(now.getTime() + 2 * 30 * 24 * 60 * 60 * 1000);
      // Allow 1 day variance for test timing
      expect(expiryDate.getTime()).toBeGreaterThan(now.getTime());
      expect(Math.abs(expiryDate.getTime() - twoMonthsFromNow.getTime())).toBeLessThan(
        24 * 60 * 60 * 1000
      );
    });
  });

  describe("rollback", () => {
    it("should return error when snapshot not found", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const result = await rollbackService.rollback("non-existent", mockClient);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Snapshot not found");
    });
  });

  describe("getSnapshot", () => {
    it("should return null when no snapshots directory exists", async () => {
      mockFsModule.readdir.mockRejectedValue(new Error("ENOENT"));

      const snapshot = await rollbackService.getSnapshot("snapshot-123");

      expect(snapshot).toBeNull();
    });
  });

  describe("listAllSnapshots", () => {
    it("should return empty array when snapshots directory does not exist", async () => {
      mockFsModule.readdir.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const snapshots = await rollbackService.listAllSnapshots();

      expect(snapshots).toEqual([]);
    });

    it("should return empty array when no snapshot files exist", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const snapshots = await rollbackService.listAllSnapshots();

      expect(snapshots).toEqual([]);
    });
  });

  describe("deleteSnapshot", () => {
    it("should return false when snapshot not found", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const result = await rollbackService.deleteSnapshot("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("cleanupExpiredSnapshots", () => {
    it("should return 0 when no snapshots exist", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const deleted = await rollbackService.cleanupExpiredSnapshots();

      expect(deleted).toBe(0);
    });
  });

  describe("getLatestSnapshot", () => {
    it("should return null when no snapshots exist for tenant", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const snapshot = await rollbackService.getLatestSnapshot("tenant-123", "TestSolution");

      expect(snapshot).toBeNull();
    });
  });

  describe("cleanupOldSnapshots", () => {
    it("should return 0 when no snapshots exist", async () => {
      mockFsModule.readdir.mockResolvedValue([]);

      const deleted = await rollbackService.cleanupOldSnapshots("tenant-123", "TestSolution", 3);

      expect(deleted).toBe(0);
    });
  });
});
