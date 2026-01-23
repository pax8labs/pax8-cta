import { coreLogger } from './logger.js';

const logger = coreLogger.child({ service: 'secrets' });

export interface SecretProvider {
  getSecret(name: string): Promise<string | undefined>;
  setSecret?(name: string, value: string): Promise<void>;
  deleteSecret?(name: string): Promise<void>;
}

// Environment variable provider (for development/simple deployments)
class EnvSecretProvider implements SecretProvider {
  private prefix: string;

  constructor(prefix = '') {
    this.prefix = prefix;
  }

  async getSecret(name: string): Promise<string | undefined> {
    const envName = this.prefix + name.toUpperCase().replace(/-/g, '_');
    return process.env[envName];
  }
}

// Azure Key Vault provider
class AzureKeyVaultProvider implements SecretProvider {
  private vaultUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private cache: Map<string, { value: string; expiry: Date }> = new Map();
  private cacheTtlMs: number;

  constructor(options: { vaultUrl: string; cacheTtlMs?: number }) {
    this.vaultUrl = options.vaultUrl;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // Use managed identity or Azure CLI credentials
    // In production, this would use @azure/identity DefaultAzureCredential
    const tokenUrl = 'http://169.254.169.254/metadata/identity/oauth2/token?' +
      'api-version=2019-08-01&resource=https://vault.azure.net';

    try {
      const response = await fetch(tokenUrl, {
        headers: { 'Metadata': 'true' },
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status}`);
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

      return this.accessToken!;
    } catch (error) {
      logger.error('Failed to get Azure token', error as Error);
      throw new Error('Failed to authenticate with Azure Key Vault');
    }
  }

  async getSecret(name: string): Promise<string | undefined> {
    // Check cache first
    const cached = this.cache.get(name);
    if (cached && cached.expiry > new Date()) {
      return cached.value;
    }

    try {
      const token = await this.getAccessToken();
      const url = `${this.vaultUrl}/secrets/${name}?api-version=7.4`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 404) {
        return undefined;
      }

      if (!response.ok) {
        throw new Error(`Key Vault request failed: ${response.status}`);
      }

      const data = await response.json() as { value: string };
      const value = data.value;

      // Cache the secret
      this.cache.set(name, {
        value,
        expiry: new Date(Date.now() + this.cacheTtlMs),
      });

      return value;
    } catch (error) {
      logger.error(`Failed to get secret: ${name}`, error as Error);
      throw error;
    }
  }

  async setSecret(name: string, value: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `${this.vaultUrl}/secrets/${name}?api-version=7.4`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set secret: ${response.status}`);
    }

    // Update cache
    this.cache.set(name, {
      value,
      expiry: new Date(Date.now() + this.cacheTtlMs),
    });
  }

  async deleteSecret(name: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `${this.vaultUrl}/secrets/${name}?api-version=7.4`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete secret: ${response.status}`);
    }

    this.cache.delete(name);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Composite provider that tries multiple sources
class CompositeSecretProvider implements SecretProvider {
  private providers: SecretProvider[];

  constructor(providers: SecretProvider[]) {
    this.providers = providers;
  }

  async getSecret(name: string): Promise<string | undefined> {
    for (const provider of this.providers) {
      try {
        const value = await provider.getSecret(name);
        if (value !== undefined) {
          return value;
        }
      } catch (error) {
        logger.warn(`Provider failed for secret ${name}`, { error });
        // Continue to next provider
      }
    }
    return undefined;
  }
}

export class SecretsManager {
  private provider: SecretProvider;

  constructor(provider?: SecretProvider) {
    if (provider) {
      this.provider = provider;
    } else {
      // Auto-configure based on environment
      const providers: SecretProvider[] = [];

      // Azure Key Vault if configured
      const vaultUrl = process.env.AZURE_KEY_VAULT_URL;
      if (vaultUrl) {
        providers.push(new AzureKeyVaultProvider({ vaultUrl }));
      }

      // Always include env vars as fallback
      providers.push(new EnvSecretProvider());

      this.provider = new CompositeSecretProvider(providers);
    }
  }

  async getSecret(name: string): Promise<string | undefined> {
    return this.provider.getSecret(name);
  }

  async getRequiredSecret(name: string): Promise<string> {
    const value = await this.getSecret(name);
    if (value === undefined) {
      throw new Error(`Required secret not found: ${name}`);
    }
    return value;
  }

  // Get all secrets needed for deployment
  async getDeploymentSecrets(): Promise<{
    partnerClientSecret: string;
  }> {
    const partnerClientSecret = await this.getRequiredSecret('PARTNER_CLIENT_SECRET');

    return {
      partnerClientSecret,
    };
  }
}

// Singleton instance
let secretsManagerInstance: SecretsManager | null = null;

export function getSecretsManager(): SecretsManager {
  if (!secretsManagerInstance) {
    secretsManagerInstance = new SecretsManager();
  }
  return secretsManagerInstance;
}
