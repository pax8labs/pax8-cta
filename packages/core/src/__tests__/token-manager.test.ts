import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TokenManager } from "../auth/token-manager.js";

// Mock MSAL
const mockAcquireTokenByClientCredential = vi.fn();

vi.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: vi.fn().mockImplementation(() => ({
    acquireTokenByClientCredential: mockAcquireTokenByClientCredential,
  })),
}));

describe("TokenManager", () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenManager = new TokenManager({
      tenantId: "test-tenant-id",
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    });
  });

  afterEach(() => {
    tokenManager.clearCache();
  });

  describe("constructor", () => {
    it("should create MSAL client with correct config", () => {
      expect(tokenManager).toBeDefined();
    });
  });

  describe("getToken", () => {
    it("should acquire token from MSAL", async () => {
      const mockResult = {
        accessToken: "mock-access-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      const token = await tokenManager.getToken(["https://api.example.com/.default"]);

      expect(token).toBe("mock-access-token");
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: ["https://api.example.com/.default"],
      });
    });

    it("should return cached token on subsequent calls", async () => {
      const mockResult = {
        accessToken: "cached-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      // First call
      const token1 = await tokenManager.getToken(["https://api.example.com/.default"]);
      // Second call
      const token2 = await tokenManager.getToken(["https://api.example.com/.default"]);

      expect(token1).toBe("cached-token");
      expect(token2).toBe("cached-token");
      // MSAL should only be called once
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(1);
    });

    it("should refresh token when near expiry", async () => {
      // First token expires in 1 minute (within 5-minute buffer)
      const nearExpiryResult = {
        accessToken: "expiring-token",
        expiresOn: new Date(Date.now() + 60 * 1000), // 1 minute
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(nearExpiryResult);

      // Get first token
      await tokenManager.getToken(["https://api.example.com/.default"]);

      // Fresh token for second call
      const freshResult = {
        accessToken: "fresh-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(freshResult);

      // Second call should refresh since first token is near expiry
      const token = await tokenManager.getToken(["https://api.example.com/.default"]);

      expect(token).toBe("fresh-token");
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(2);
    });

    it("should use different cache keys for different scopes", async () => {
      const result1 = {
        accessToken: "token-for-scope-1",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      const result2 = {
        accessToken: "token-for-scope-2",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential
        .mockResolvedValueOnce(result1)
        .mockResolvedValueOnce(result2);

      const token1 = await tokenManager.getToken(["https://scope1.com/.default"]);
      const token2 = await tokenManager.getToken(["https://scope2.com/.default"]);

      expect(token1).toBe("token-for-scope-1");
      expect(token2).toBe("token-for-scope-2");
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(2);
    });

    it("should sort scopes for consistent cache keys", async () => {
      const mockResult = {
        accessToken: "sorted-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValue(mockResult);

      // Call with scopes in different orders
      await tokenManager.getToken(["scope-b", "scope-a"]);
      await tokenManager.getToken(["scope-a", "scope-b"]);

      // Should only call MSAL once because sorted cache keys match
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(1);
    });

    it("should throw if MSAL returns null", async () => {
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(null);

      await expect(tokenManager.getToken(["https://api.example.com/.default"])).rejects.toThrow(
        "Failed to acquire token"
      );
    });

    it("should handle expiresOn being undefined", async () => {
      const mockResult = {
        accessToken: "token-no-expiry",
        expiresOn: undefined,
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      const token = await tokenManager.getToken(["https://api.example.com/.default"]);

      expect(token).toBe("token-no-expiry");
    });
  });

  describe("getDataverseToken", () => {
    it("should request token with correct Dataverse scope", async () => {
      const mockResult = {
        accessToken: "dataverse-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      const token = await tokenManager.getDataverseToken("https://org.crm.dynamics.com");

      expect(token).toBe("dataverse-token");
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: ["https://org.crm.dynamics.com/.default"],
      });
    });

    it("should strip trailing slash from environment URL", async () => {
      const mockResult = {
        accessToken: "dataverse-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      await tokenManager.getDataverseToken("https://org.crm.dynamics.com/");

      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: ["https://org.crm.dynamics.com/.default"],
      });
    });
  });

  describe("getGraphToken", () => {
    it("should request token with Graph scope", async () => {
      const mockResult = {
        accessToken: "graph-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValueOnce(mockResult);

      const token = await tokenManager.getGraphToken();

      expect(token).toBe("graph-token");
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledWith({
        scopes: ["https://graph.microsoft.com/.default"],
      });
    });
  });

  describe("clearCache", () => {
    it("should clear all cached tokens", async () => {
      const mockResult = {
        accessToken: "cached-token",
        expiresOn: new Date(Date.now() + 3600 * 1000),
      };
      mockAcquireTokenByClientCredential.mockResolvedValue(mockResult);

      // Get a token (will be cached)
      await tokenManager.getToken(["https://api.example.com/.default"]);
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(1);

      // Clear cache
      tokenManager.clearCache();

      // Get token again (should call MSAL again)
      await tokenManager.getToken(["https://api.example.com/.default"]);
      expect(mockAcquireTokenByClientCredential).toHaveBeenCalledTimes(2);
    });
  });
});
