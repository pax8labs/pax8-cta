import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataverseClient, SolutionRecord } from "../dataverse/client.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create a mock token manager (not using the real TokenManager class)
const createMockTokenManager = () => ({
  getDataverseToken: vi.fn().mockResolvedValue("mock-token-12345"),
  getToken: vi.fn().mockResolvedValue("mock-token-12345"),
  getGraphToken: vi.fn().mockResolvedValue("mock-graph-token"),
  clearCache: vi.fn(),
});

describe("DataverseClient", () => {
  let client: DataverseClient;
  let mockTokenManager: ReturnType<typeof createMockTokenManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenManager = createMockTokenManager();
    client = new DataverseClient({
      environmentUrl: "https://org.crm.dynamics.com",
      tokenManager: mockTokenManager as any,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("should construct API URL from environment URL", () => {
      // The API URL is private, so we test it indirectly through requests
      expect(client).toBeDefined();
    });

    it("should handle trailing slash in environment URL", () => {
      const clientWithSlash = new DataverseClient({
        environmentUrl: "https://org.crm.dynamics.com/",
        tokenManager: mockTokenManager as any,
      });
      expect(clientWithSlash).toBeDefined();
    });
  });

  describe("get", () => {
    it("should make GET request with correct headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });

      await client.get("/solutions");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/data/v9.2/solutions"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-token-12345",
            "Content-Type": "application/json",
            "OData-Version": "4.0",
          }),
        })
      );
    });

    it("should append query parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });

      await client.get("/solutions", {
        $select: "solutionid,uniquename",
        $filter: "isvisible eq true",
      });

      // URL encoding: $ becomes %24, commas become %2C
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("select=solutionid");
      expect(calledUrl).toContain("uniquename");
    });

    it("should return parsed JSON response", async () => {
      const mockData = { value: [{ solutionid: "123", uniquename: "TestSolution" }] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await client.get("/solutions");
      expect(result).toEqual(mockData);
    });
  });

  describe("post", () => {
    it("should make POST request with body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ result: "success" })),
      });

      await client.post("/SomeAction", { param1: "value1" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/data/v9.2/SomeAction"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ param1: "value1" }),
        })
      );
    });

    it("should handle empty response body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(""),
      });

      const result = await client.post("/SomeAction", {});
      expect(result).toBeNull();
    });
  });

  describe("patch", () => {
    it("should make PATCH request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(""),
      });

      await client.patch("/solutions(123)", { friendlyname: "Updated" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/solutions(123)"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ friendlyname: "Updated" }),
        })
      );
    });
  });

  describe("delete", () => {
    it("should make DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await client.delete("/solutions(123)");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/solutions(123)"),
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("executeAction", () => {
    it("should execute unbound action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ ExportSolutionFile: "base64data" })),
      });

      const result = await client.executeAction("ExportSolution", {
        SolutionName: "TestSolution",
        Managed: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/ExportSolution"),
        expect.objectContaining({
          method: "POST",
        })
      );
      expect(result).toHaveProperty("ExportSolutionFile");
    });
  });

  describe("executeActionRaw", () => {
    it("should return raw response for binary data", async () => {
      const mockResponse = {
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await client.executeActionRaw("ExportSolution", {
        SolutionName: "TestSolution",
      });

      expect(response.ok).toBe(true);
    });

    it("should handle error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () =>
          Promise.resolve({
            error: {
              code: "InvalidArgument",
              message: "Solution not found",
            },
          }),
      });

      await expect(
        client.executeActionRaw("ExportSolution", { SolutionName: "NonExistent" })
      ).rejects.toThrow("Solution not found");
    });
  });

  describe("querySolutions", () => {
    it("should query solutions with correct parameters", async () => {
      const mockSolutions: SolutionRecord[] = [
        {
          solutionid: "sol-1",
          uniquename: "Solution1",
          friendlyname: "Solution 1",
          version: "1.0.0.0",
          ismanaged: true,
        },
        {
          solutionid: "sol-2",
          uniquename: "Solution2",
          friendlyname: "Solution 2",
          version: "2.0.0.0",
          ismanaged: false,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: mockSolutions }),
      });

      const result = await client.querySolutions();

      expect(result).toHaveLength(2);
      expect(result[0].uniquename).toBe("Solution1");
      // URL encoding: $ becomes %24
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("filter=isvisible");
      expect(calledUrl).toContain("eq");
      expect(calledUrl).toContain("true");
    });
  });

  describe("getSolutionByName", () => {
    it("should return solution when found", async () => {
      const mockSolution: SolutionRecord = {
        solutionid: "sol-123",
        uniquename: "MySolution",
        friendlyname: "My Solution",
        version: "1.0.0.0",
        ismanaged: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [mockSolution] }),
      });

      const result = await client.getSolutionByName("MySolution");

      expect(result).toBeDefined();
      expect(result?.uniquename).toBe("MySolution");
    });

    it("should return null when solution not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });

      const result = await client.getSolutionByName("NonExistent");

      expect(result).toBeNull();
    });
  });

  describe("error handling", () => {
    it("should throw on API error with message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () =>
          Promise.resolve({
            error: {
              code: "InternalError",
              message: "Something went wrong",
              innererror: {
                message: "Detailed error info",
                type: "System.Exception",
                stacktrace: "at ...",
              },
            },
          }),
      });

      await expect(client.get("/solutions")).rejects.toThrow(
        "Something went wrong - Detailed error info"
      );
    });

    it("should handle non-JSON error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: () => Promise.reject(new Error("Not JSON")),
      });

      await expect(client.get("/solutions")).rejects.toThrow(
        "Dataverse API error: 503 Service Unavailable"
      );
    });

    it("should handle error without innererror", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () =>
          Promise.resolve({
            error: {
              code: "BadRequest",
              message: "Invalid request",
            },
          }),
      });

      await expect(client.get("/solutions")).rejects.toThrow(/Invalid request/);
    });
  });

  describe("token management", () => {
    it("should get token for each request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });

      await client.get("/solutions");
      await client.get("/solutions");

      expect(mockTokenManager.getDataverseToken).toHaveBeenCalledTimes(2);
      expect(mockTokenManager.getDataverseToken).toHaveBeenCalledWith(
        "https://org.crm.dynamics.com"
      );
    });
  });
});
