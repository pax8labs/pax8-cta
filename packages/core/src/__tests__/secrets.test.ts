import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SecretsManager, SecretProvider, getSecretsManager } from "../services/secrets.js";

// Mock fetch for Azure Key Vault tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock logger
vi.mock("../services/logger.js", () => ({
  coreLogger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe("SecretsManager", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Clear any existing singleton
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("EnvSecretProvider (via SecretsManager)", () => {
    it("should get secret from environment variable", async () => {
      process.env.TEST_SECRET = "test-value";
      // Reset module to get fresh instance without Azure Key Vault configured
      delete process.env.AZURE_KEY_VAULT_URL;

      const manager = new SecretsManager();
      const value = await manager.getSecret("test-secret");

      expect(value).toBe("test-value");
    });

    it("should convert secret name to uppercase env var format", async () => {
      process.env.MY_API_KEY = "api-key-value";
      delete process.env.AZURE_KEY_VAULT_URL;

      const manager = new SecretsManager();
      const value = await manager.getSecret("my-api-key");

      expect(value).toBe("api-key-value");
    });

    it("should return undefined for missing secret", async () => {
      delete process.env.AZURE_KEY_VAULT_URL;
      delete process.env.NONEXISTENT_SECRET;

      const manager = new SecretsManager();
      const value = await manager.getSecret("nonexistent-secret");

      expect(value).toBeUndefined();
    });
  });

  describe("getRequiredSecret", () => {
    it("should return secret when it exists", async () => {
      process.env.REQUIRED_SECRET = "required-value";
      delete process.env.AZURE_KEY_VAULT_URL;

      const manager = new SecretsManager();
      const value = await manager.getRequiredSecret("required-secret");

      expect(value).toBe("required-value");
    });

    it("should throw error when required secret is missing", async () => {
      delete process.env.AZURE_KEY_VAULT_URL;
      delete process.env.MISSING_SECRET;

      const manager = new SecretsManager();

      await expect(manager.getRequiredSecret("missing-secret")).rejects.toThrow(
        "Required secret not found: missing-secret"
      );
    });
  });

  describe("getDeploymentSecrets", () => {
    it("should return all deployment secrets when available", async () => {
      process.env.PARTNER_CLIENT_SECRET = "partner-secret-value";
      delete process.env.AZURE_KEY_VAULT_URL;

      const manager = new SecretsManager();
      const secrets = await manager.getDeploymentSecrets();

      expect(secrets.partnerClientSecret).toBe("partner-secret-value");
    });

    it("should throw when deployment secret is missing", async () => {
      delete process.env.AZURE_KEY_VAULT_URL;
      delete process.env.PARTNER_CLIENT_SECRET;

      const manager = new SecretsManager();

      await expect(manager.getDeploymentSecrets()).rejects.toThrow(
        "Required secret not found: PARTNER_CLIENT_SECRET"
      );
    });
  });

  describe("Custom SecretProvider", () => {
    it("should use custom provider when provided", async () => {
      const mockProvider: SecretProvider = {
        getSecret: vi.fn().mockResolvedValue("custom-value"),
      };

      const manager = new SecretsManager(mockProvider);
      const value = await manager.getSecret("any-secret");

      expect(value).toBe("custom-value");
      expect(mockProvider.getSecret).toHaveBeenCalledWith("any-secret");
    });

    it("should support multiple custom providers in sequence", async () => {
      const mockProvider1: SecretProvider = {
        getSecret: vi.fn().mockResolvedValue(undefined),
      };
      const mockProvider2: SecretProvider = {
        getSecret: vi.fn().mockResolvedValue("from-provider-2"),
      };

      // Create a composite provider manually to test the behavior
      const compositeProvider: SecretProvider = {
        getSecret: async (name: string) => {
          const value1 = await mockProvider1.getSecret(name);
          if (value1 !== undefined) return value1;
          return mockProvider2.getSecret(name);
        },
      };

      const manager = new SecretsManager(compositeProvider);
      const value = await manager.getSecret("test-secret");

      expect(value).toBe("from-provider-2");
    });
  });

  describe("AzureKeyVaultProvider (via SecretsManager)", () => {
    beforeEach(() => {
      process.env.AZURE_KEY_VAULT_URL = "https://test-vault.vault.azure.net";
    });

    it("should get token from managed identity and fetch secret", async () => {
      // Mock token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "mock-access-token",
            expires_in: 3600,
          }),
      });

      // Mock secret request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: "secret-from-keyvault",
          }),
      });

      const manager = new SecretsManager();
      const value = await manager.getSecret("my-secret");

      expect(value).toBe("secret-from-keyvault");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify token request
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("metadata/identity/oauth2/token"),
        expect.objectContaining({
          headers: { Metadata: "true" },
        })
      );

      // Verify secret request
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("my-secret"),
        expect.objectContaining({
          headers: { Authorization: "Bearer mock-access-token" },
        })
      );
    });

    it("should return undefined for 404 response", async () => {
      // Mock token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "mock-access-token",
            expires_in: 3600,
          }),
      });

      // Mock 404 response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Fall back to env provider which also won't have it
      delete process.env.MISSING_KV_SECRET;

      const manager = new SecretsManager();
      const value = await manager.getSecret("missing-kv-secret");

      expect(value).toBeUndefined();
    });

    it("should fall back to env provider when Key Vault fails", async () => {
      // Set up env var as fallback
      process.env.FALLBACK_SECRET = "env-fallback-value";

      // Mock token request failure
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const manager = new SecretsManager();
      const value = await manager.getSecret("fallback-secret");

      // Should fall back to env provider
      expect(value).toBe("env-fallback-value");
    });

    it("should cache secrets to reduce API calls", async () => {
      // Mock token request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "mock-access-token",
            expires_in: 3600,
          }),
      });

      // Mock secret request (only once)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            value: "cached-secret-value",
          }),
      });

      const manager = new SecretsManager();

      // First call
      const value1 = await manager.getSecret("cached-secret");
      // Second call should use cache
      const value2 = await manager.getSecret("cached-secret");

      expect(value1).toBe("cached-secret-value");
      expect(value2).toBe("cached-secret-value");
      // Should only make 2 fetch calls (token + secret), not 4
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getSecretsManager singleton", () => {
    it("should return singleton instance", async () => {
      // Import fresh to test singleton
      const { getSecretsManager: getSingleton } = await import("../services/secrets.js");

      delete process.env.AZURE_KEY_VAULT_URL;

      const manager1 = getSingleton();
      const manager2 = getSingleton();

      expect(manager1).toBe(manager2);
    });
  });
});
