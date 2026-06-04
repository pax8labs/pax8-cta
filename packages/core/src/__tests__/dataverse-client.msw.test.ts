/**
 * MSW-based integration tests for DataverseClient and SolutionOperations.
 *
 * These tests replay sanitized Dataverse Web API responses via MSW,
 * exercising the real HTTP handling and response parsing in DataverseClient
 * and SolutionOperations against realistic response shapes.
 *
 * MSAL is mocked (it uses its own HTTP client), but the Dataverse API layer
 * uses real fetch intercepted by MSW.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { DataverseClient } from "../dataverse/client.js";
import { SolutionOperations } from "../dataverse/solution-ops.js";
import { TokenManager } from "../auth/token-manager.js";
import { DataverseApiError, GdapError } from "../errors.js";
import {
  solutionsListHandlers,
  solutionByNameHandlers,
  exportSolutionHandlers,
  importSolutionSuccessHandlers,
  importSolutionFailureHandlers,
  importAsyncProgressHandlers,
  importAsyncFailureHandlers,
  solutionHistoryHandlers,
  unauthorizedHandlers,
  forbiddenHandlers,
  notMemberHandlers,
} from "./msw/dataverse-handlers.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock MSAL so TokenManager doesn't hit Azure AD
vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: vi.fn(function ConfidentialClientApplication() {
    return {
      acquireTokenByClientCredential: vi.fn().mockResolvedValue({
        accessToken: "msw-dataverse-test-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      }),
    };
  }),
}));

const server = setupServer();

const ENV_URL = "https://org60b532ae.crm.dynamics.com";

function createClient(): DataverseClient {
  const tokenManager = new TokenManager({
    tenantId: "test-tenant-00000000-0000-0000-0000-000000000000",
    clientId: "test-client-11111111-1111-1111-1111-111111111111",
    clientSecret: "test-secret",
  });
  return new DataverseClient({
    environmentUrl: ENV_URL,
    tokenManager,
    clientId: "test-client-11111111-1111-1111-1111-111111111111",
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("DataverseClient (MSW replay)", () => {
  let client: DataverseClient;

  beforeEach(() => {
    client = createClient();
  });

  // ---------------------------------------------------------------------------
  // Solution queries
  // ---------------------------------------------------------------------------
  describe("solution queries", () => {
    beforeEach(() => server.use(...solutionsListHandlers()));

    it("should parse all solutions from OData response", async () => {
      const solutions = await client.querySolutions();

      expect(solutions).toHaveLength(4);
      expect(solutions[0]).toHaveProperty("solutionid");
      expect(solutions[0]).toHaveProperty("uniquename");
      expect(solutions[0]).toHaveProperty("friendlyname");
      expect(solutions[0]).toHaveProperty("version");
      expect(solutions[0]).toHaveProperty("ismanaged");
    });

    it("should preserve solution metadata from recording", async () => {
      const solutions = await client.querySolutions();

      const names = solutions.map((s) => s.uniquename);
      expect(names).toContain("CustomerServiceAgent");
      expect(names).toContain("SalesAssistantBot");
      expect(names).toContain("InternalHelpdesk");
      expect(names).toContain("Default");
    });

    it("should correctly parse managed/unmanaged flag", async () => {
      const solutions = await client.querySolutions();

      const managed = solutions.filter((s) => s.ismanaged);
      const unmanaged = solutions.filter((s) => !s.ismanaged);
      expect(managed).toHaveLength(2);
      expect(unmanaged).toHaveLength(2);
    });

    it("should parse version strings", async () => {
      const solutions = await client.querySolutions();

      const agent = solutions.find((s) => s.uniquename === "CustomerServiceAgent");
      expect(agent?.version).toBe("1.2.0.4");
    });
  });

  describe("solution lookup by name", () => {
    beforeEach(() => server.use(...solutionByNameHandlers()));

    it("should find solution with publisher info", async () => {
      const solution = await client.getSolutionByName("CustomerServiceAgent");

      expect(solution).not.toBeNull();
      expect(solution!.uniquename).toBe("CustomerServiceAgent");
      expect(solution!.version).toBe("1.2.0.4");
      expect(solution!.publisherid?.friendlyname).toBe("Contoso Publisher");
    });

    it("should return null for unknown solution", async () => {
      const solution = await client.getSolutionByName("NonExistentSolution");
      expect(solution).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe("error responses", () => {
    it("should throw DataverseApiError on 401", async () => {
      server.use(...unauthorizedHandlers());

      await expect(client.querySolutions()).rejects.toThrow(DataverseApiError);
      await expect(client.querySolutions()).rejects.toThrow(/not authenticated/i);
    });

    it("should throw DataverseApiError with privilege details on 403", async () => {
      server.use(...forbiddenHandlers());

      await expect(client.querySolutions()).rejects.toThrow(DataverseApiError);
      await expect(client.querySolutions()).rejects.toThrow(/prvReadSolution/i);
    });

    it("should throw GdapError when user is not a member", async () => {
      server.use(...notMemberHandlers());

      await expect(client.querySolutions()).rejects.toThrow(GdapError);
      await expect(client.querySolutions()).rejects.toThrow(/not a member/i);
    });

    it("should include environment URL in error context", async () => {
      server.use(...unauthorizedHandlers());

      try {
        await client.querySolutions();
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DataverseApiError);
        expect((error as DataverseApiError).message).toContain(ENV_URL);
      }
    });
  });
});

describe("SolutionOperations (MSW replay)", () => {
  let client: DataverseClient;
  let ops: SolutionOperations;
  let tmpDir: string;

  beforeEach(() => {
    client = createClient();
    ops = new SolutionOperations(client);
    tmpDir = mkdtempSync(join(tmpdir(), "pax8-cta-msw-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  describe("solution export", () => {
    beforeEach(() => server.use(...exportSolutionHandlers()));

    it("should export solution to file", async () => {
      const outputPath = join(tmpDir, "CustomerServiceAgent_managed.zip");

      const metadata = await ops.exportSolution("CustomerServiceAgent", {
        outputPath,
        managed: true,
      });

      expect(metadata.uniqueName).toBe("CustomerServiceAgent");
      expect(metadata.friendlyName).toBe("Customer Service Agent");
      expect(metadata.version).toBe("1.2.0.4");
      expect(metadata.isManaged).toBe(true);
      expect(metadata.publisherId).toBe("pp111111-2222-3333-4444-555555555555");
    });

    it("should throw for non-existent solution", async () => {
      server.use(...solutionByNameHandlers());
      const outputPath = join(tmpDir, "nonexistent.zip");

      await expect(
        ops.exportSolution("NonExistentSolution", { outputPath, managed: true })
      ).rejects.toThrow(/not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Import (synchronous)
  // ---------------------------------------------------------------------------
  describe("solution import (sync)", () => {
    it("should return success for clean import", async () => {
      server.use(...importSolutionSuccessHandlers());

      // Create a fake zip file
      const solutionPath = join(tmpDir, "test-solution.zip");
      writeFileSync(solutionPath, Buffer.from("PK mock zip content"));

      const result = await ops.importSolution(solutionPath);

      expect(result.success).toBe(true);
      expect(result.importJobId).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should return failure with error details for bad import", async () => {
      server.use(...importSolutionFailureHandlers());

      const solutionPath = join(tmpDir, "bad-solution.zip");
      writeFileSync(solutionPath, Buffer.from("PK mock zip content"));

      const result = await ops.importSolution(solutionPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("missing dependency");
    });
  });

  // ---------------------------------------------------------------------------
  // Import (async with polling)
  // ---------------------------------------------------------------------------
  describe("solution import (async polling)", () => {
    it("should poll and detect successful completion", async () => {
      server.use(...importAsyncProgressHandlers());

      const solutionPath = join(tmpDir, "test-solution.zip");
      writeFileSync(solutionPath, Buffer.from("PK mock zip content"));

      const importJobId = await ops.importSolutionAsync(solutionPath);
      expect(importJobId).toBeDefined();

      // Poll — first 2 calls return in-progress, 3rd returns complete
      const progressValues: number[] = [];
      const result = await ops.waitForImport(importJobId, {
        pollIntervalMs: 10, // fast for tests
        timeoutMs: 5000,
        onProgress: (p) => progressValues.push(p),
      });

      expect(result.success).toBe(true);
      expect(progressValues.length).toBeGreaterThanOrEqual(2);
      // Should have seen 65% progress before 100%
      expect(progressValues).toContain(65);
    });

    it("should detect import failure from job data XML", async () => {
      server.use(...importAsyncFailureHandlers());

      const solutionPath = join(tmpDir, "test-solution.zip");
      writeFileSync(solutionPath, Buffer.from("PK mock zip content"));

      const importJobId = await ops.importSolutionAsync(solutionPath);

      const result = await ops.waitForImport(importJobId, {
        pollIntervalMs: 10,
        timeoutMs: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("unmanaged BotComponent");
    });
  });

  // ---------------------------------------------------------------------------
  // Solution history
  // ---------------------------------------------------------------------------
  describe("solution history", () => {
    beforeEach(() => server.use(...solutionHistoryHandlers()));

    it("should parse solution history records", async () => {
      const history = await ops.getSolutionHistory();

      expect(history).toHaveLength(3);
      expect(history[0]).toHaveProperty("msdyn_solutionhistoryid");
      expect(history[0]).toHaveProperty("msdyn_name");
      expect(history[0]).toHaveProperty("msdyn_solutionversion");
      expect(history[0]).toHaveProperty("msdyn_operation");
      expect(history[0]).toHaveProperty("msdyn_result");
    });

    it("should include both successful and failed records", async () => {
      const history = await ops.getSolutionHistory();

      const successful = history.filter((h) => h.msdyn_result === true);
      const failed = history.filter((h) => h.msdyn_result === false);
      expect(successful).toHaveLength(2);
      expect(failed).toHaveLength(1);
    });

    it("should preserve error details for failed imports", async () => {
      const history = await ops.getSolutionHistory();

      const failed = history.find((h) => h.msdyn_result === false);
      expect(failed?.msdyn_exceptionmessage).toContain("missing dependency");
      expect(failed?.msdyn_errorcode).toBe(80048540);
    });

    it("should preserve publisher and version info", async () => {
      const history = await ops.getSolutionHistory();

      const first = history[0];
      expect(first.msdyn_publishername).toBe("Contoso Publisher");
      expect(first.msdyn_solutionversion).toBe("1.2.0.4");
      expect(first.msdyn_ismanaged).toBe(true);
    });

    it("should preserve timing information", async () => {
      const history = await ops.getSolutionHistory();

      const first = history[0];
      expect(first.msdyn_starttime).toBeDefined();
      expect(first.msdyn_endtime).toBeDefined();
      expect(first.msdyn_totaltime).toBe(135);
    });
  });
});
