import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs/promises - must be before imports that use it
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from("mock-solution-content")),
}));

import { SolutionOperations } from "../dataverse/solution-ops.js";
import { DataverseClient, SolutionRecord } from "../dataverse/client.js";
import * as fs from "node:fs/promises";

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-1234",
});

describe("SolutionOperations", () => {
  let mockClient: DataverseClient;
  let solutionOps: SolutionOperations;

  const mockSolution: SolutionRecord = {
    solutionid: "solution-123",
    uniquename: "TestSolution",
    friendlyname: "Test Solution",
    version: "1.0.0.0",
    ismanaged: false,
    isvisible: true,
    publisherid: {
      publisherid: "publisher-123",
      uniquename: "testpublisher",
      friendlyname: "Test Publisher",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      querySolutions: vi.fn().mockResolvedValue([mockSolution]),
      getSolutionByName: vi.fn().mockResolvedValue(mockSolution),
      executeAction: vi.fn().mockResolvedValue({
        ExportSolutionFile: Buffer.from("mock-zip-content").toString("base64"),
      }),
      get: vi.fn().mockResolvedValue({ value: [] }),
    } as unknown as DataverseClient;

    solutionOps = new SolutionOperations(mockClient);

    // Reset fs mock to return a proper Buffer
    vi.mocked(fs.readFile).mockResolvedValue(
      Buffer.from("mock-solution-content") as unknown as string
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listSolutions", () => {
    it("should return list of solutions from client", async () => {
      const solutions = await solutionOps.listSolutions();

      expect(mockClient.querySolutions).toHaveBeenCalledOnce();
      expect(solutions).toEqual([mockSolution]);
    });
  });

  describe("getSolution", () => {
    it("should return solution by unique name", async () => {
      const solution = await solutionOps.getSolution("TestSolution");

      expect(mockClient.getSolutionByName).toHaveBeenCalledWith("TestSolution");
      expect(solution).toEqual(mockSolution);
    });

    it("should return null when solution not found", async () => {
      vi.mocked(mockClient.getSolutionByName).mockResolvedValue(null);

      const solution = await solutionOps.getSolution("NonExistent");

      expect(solution).toBeNull();
    });
  });

  describe("exportSolution", () => {
    it("should export solution to file", async () => {
      const metadata = await solutionOps.exportSolution("TestSolution", {
        managed: true,
        outputPath: "/tmp/solution.zip",
      });

      expect(mockClient.getSolutionByName).toHaveBeenCalledWith("TestSolution");
      expect(mockClient.executeAction).toHaveBeenCalledWith("ExportSolution", {
        SolutionName: "TestSolution",
        Managed: true,
      });
      expect(fs.writeFile).toHaveBeenCalled();
      expect(metadata).toEqual({
        uniqueName: "TestSolution",
        friendlyName: "Test Solution",
        version: "1.0.0.0",
        isManaged: true,
        publisherId: "publisher-123",
      });
    });

    it("should throw error when solution not found", async () => {
      vi.mocked(mockClient.getSolutionByName).mockResolvedValue(null);

      await expect(
        solutionOps.exportSolution("NonExistent", {
          managed: true,
          outputPath: "/tmp/solution.zip",
        })
      ).rejects.toThrow("Solution 'NonExistent' not found in environment");
    });

    it("should default to managed export", async () => {
      await solutionOps.exportSolution("TestSolution", {
        outputPath: "/tmp/solution.zip",
      });

      expect(mockClient.executeAction).toHaveBeenCalledWith("ExportSolution", {
        SolutionName: "TestSolution",
        Managed: true,
      });
    });
  });

  describe("importSolution", () => {
    it("should import solution successfully", async () => {
      vi.mocked(mockClient.executeAction).mockResolvedValue(undefined);

      const result = await solutionOps.importSolution("/tmp/solution.zip", {
        overwriteUnmanagedCustomizations: true,
        publishWorkflows: true,
      });

      expect(fs.readFile).toHaveBeenCalledWith("/tmp/solution.zip");
      expect(mockClient.executeAction).toHaveBeenCalledWith("ImportSolution", {
        CustomizationFile: expect.any(String),
        OverwriteUnmanagedCustomizations: true,
        PublishWorkflows: true,
        ConvertToManaged: false,
        ImportJobId: expect.any(String),
      });
      expect(result.success).toBe(true);
      expect(result.importJobId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("should return error on import failure", async () => {
      vi.mocked(mockClient.executeAction).mockRejectedValue(new Error("Import failed"));

      const result = await solutionOps.importSolution("/tmp/solution.zip");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Import failed");
    });

    it("should use default options when not provided", async () => {
      vi.mocked(mockClient.executeAction).mockResolvedValue(undefined);

      await solutionOps.importSolution("/tmp/solution.zip");

      expect(mockClient.executeAction).toHaveBeenCalledWith("ImportSolution", {
        CustomizationFile: expect.any(String),
        OverwriteUnmanagedCustomizations: true,
        PublishWorkflows: true,
        ConvertToManaged: false,
        ImportJobId: expect.any(String),
      });
    });
  });

  describe("importSolutionAsync", () => {
    it("should start async import and return job ID", async () => {
      vi.mocked(mockClient.executeAction).mockResolvedValue(undefined);

      const jobId = await solutionOps.importSolutionAsync("/tmp/solution.zip", {
        overwriteUnmanagedCustomizations: true,
        publishWorkflows: true,
      });

      expect(mockClient.executeAction).toHaveBeenCalledWith("ImportSolutionAsync", {
        CustomizationFile: expect.any(String),
        OverwriteUnmanagedCustomizations: true,
        PublishWorkflows: true,
        ImportJobId: expect.any(String),
      });
      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe("checkImportStatus", () => {
    it("should return progress for in-progress import", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        value: [
          {
            importjobid: "test-uuid-1234",
            solutionname: "TestSolution",
            progress: 50,
            completedon: null,
            startedon: "2024-01-01T00:00:00Z",
            data: "",
          },
        ],
      });

      const status = await solutionOps.checkImportStatus("test-uuid-1234");

      expect(status.progress).toBe(50);
      expect(status.completed).toBe(false);
      expect(status.success).toBe(false);
    });

    it("should return success for completed import", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        value: [
          {
            importjobid: "test-uuid-1234",
            solutionname: "TestSolution",
            progress: 100,
            completedon: "2024-01-01T00:01:00Z",
            startedon: "2024-01-01T00:00:00Z",
            data: '<result result="success">OK</result>',
          },
        ],
      });

      const status = await solutionOps.checkImportStatus("test-uuid-1234");

      expect(status.progress).toBe(100);
      expect(status.completed).toBe(true);
      expect(status.success).toBe(true);
    });

    it("should return error for failed import", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        value: [
          {
            importjobid: "test-uuid-1234",
            solutionname: "TestSolution",
            progress: 100,
            completedon: "2024-01-01T00:01:00Z",
            startedon: "2024-01-01T00:00:00Z",
            data: '<result result="failure"><errortext>Missing dependency</errortext></result>',
          },
        ],
      });

      const status = await solutionOps.checkImportStatus("test-uuid-1234");

      expect(status.completed).toBe(true);
      expect(status.success).toBe(false);
      expect(status.error).toBe("Missing dependency");
    });

    it("should return error when import job not found", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({ value: [] });

      const status = await solutionOps.checkImportStatus("non-existent");

      expect(status.completed).toBe(false);
      expect(status.success).toBe(false);
      expect(status.error).toBe("Import job not found");
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(mockClient.get).mockRejectedValue(new Error("API error"));

      const status = await solutionOps.checkImportStatus("test-uuid-1234");

      expect(status.completed).toBe(false);
      expect(status.success).toBe(false);
      expect(status.error).toBe("API error");
    });
  });

  describe("waitForImport", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should poll until import completes successfully", async () => {
      let callCount = 0;
      vi.mocked(mockClient.get).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            value: [
              {
                importjobid: "test-uuid-1234",
                solutionname: "TestSolution",
                progress: callCount * 33,
                completedon: null,
                startedon: "2024-01-01T00:00:00Z",
                data: "",
              },
            ],
          };
        }
        return {
          value: [
            {
              importjobid: "test-uuid-1234",
              solutionname: "TestSolution",
              progress: 100,
              completedon: "2024-01-01T00:01:00Z",
              startedon: "2024-01-01T00:00:00Z",
              data: '<result result="success">OK</result>',
            },
          ],
        };
      });

      const progressUpdates: number[] = [];
      const resultPromise = solutionOps.waitForImport("test-uuid-1234", {
        pollIntervalMs: 100,
        timeoutMs: 10000,
        onProgress: (progress) => progressUpdates.push(progress),
      });

      // Advance timers to trigger polls
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.importJobId).toBe("test-uuid-1234");
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it("should return error on timeout", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        value: [
          {
            importjobid: "test-uuid-1234",
            solutionname: "TestSolution",
            progress: 50,
            completedon: null,
            startedon: "2024-01-01T00:00:00Z",
            data: "",
          },
        ],
      });

      const resultPromise = solutionOps.waitForImport("test-uuid-1234", {
        pollIntervalMs: 100,
        timeoutMs: 500,
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(600);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Import timed out");
    });

    it("should return failure result when import fails", async () => {
      vi.mocked(mockClient.get).mockResolvedValue({
        value: [
          {
            importjobid: "test-uuid-1234",
            solutionname: "TestSolution",
            progress: 100,
            completedon: "2024-01-01T00:01:00Z",
            startedon: "2024-01-01T00:00:00Z",
            data: '<result result="failure"><errortext>Component missing</errortext></result>',
          },
        ],
      });

      const resultPromise = solutionOps.waitForImport("test-uuid-1234", {
        pollIntervalMs: 100,
        timeoutMs: 10000,
      });

      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Component missing");
    });
  });
});
