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

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { coreLogger } from "./logger.js";

const logger = coreLogger.child({ service: "settings" });

/**
 * Integration settings for Power Platform / Dynamics connection
 */
export interface IntegrationSettings {
  // Partner/MSP credentials
  partnerTenantId?: string;
  partnerClientId?: string;
  partnerClientSecret?: string; // Encrypted at rest

  // Source environment (where agents are stored)
  sourceTenantId?: string;
  sourceEnvironmentUrl?: string;

  // Feature flags
  tenantDiscoveryEnabled?: boolean;
  connectionMappingEnabled?: boolean;
  environmentVariablesEnabled?: boolean;

  // Metadata
  configuredAt?: string;
  configuredBy?: string;
  lastTestedAt?: string;
  lastTestResult?: "success" | "failed";
  lastTestError?: string;
}

/**
 * General application settings
 */
export interface AppSettings {
  // Mode
  demoMode: boolean;

  // Notifications - Slack
  slackEnabled?: boolean;
  slackWebhookUrl?: string; // Encrypted at rest

  // Notifications - Microsoft Teams
  teamsEnabled?: boolean;
  teamsWebhookUrl?: string; // Encrypted at rest

  // Notifications - Email
  emailEnabled?: boolean;
  emailRecipients?: string; // Comma-separated list

  // Notification events
  notifyOnDeploymentStart?: boolean;
  notifyOnDeploymentComplete?: boolean;
  notifyOnDeploymentFailure?: boolean;
  notifyOnApprovalNeeded?: boolean;

  // Deployment defaults
  defaultMaxConcurrentDeployments?: number;
  defaultDeploymentTimeoutMs?: number;
  autoRetryFailedDeployments?: boolean;

  // UI preferences
  theme?: "light" | "dark" | "system";
  dateFormat?: string;
  timezone?: string;
}

export interface AllSettings {
  integration: IntegrationSettings;
  app: AppSettings;
}

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Settings service for managing application configuration
 * Supports both file-based storage (demo) and encrypted database storage (production)
 */
export class SettingsService {
  private encryptionKey: Buffer | null = null;
  private settingsFilePath: string;
  private cachedSettings: AllSettings | null = null;

  constructor(options?: { settingsDir?: string; encryptionSecret?: string }) {
    const settingsDir = options?.settingsDir || process.cwd();
    this.settingsFilePath = join(settingsDir, ".agentsync-settings.json");

    // Derive encryption key from secret
    const secret = options?.encryptionSecret || process.env.SETTINGS_ENCRYPTION_SECRET;
    if (secret) {
      // Use scrypt to derive a proper key from the secret
      const salt = this.getOrCreateSalt(settingsDir);
      this.encryptionKey = scryptSync(secret, salt, 32);
    }
  }

  /**
   * Get all settings
   */
  async getSettings(): Promise<AllSettings> {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    const settings = this.loadFromFile();
    this.cachedSettings = settings;
    return settings;
  }

  /**
   * Get integration settings
   */
  async getIntegrationSettings(): Promise<IntegrationSettings> {
    const settings = await this.getSettings();
    return settings.integration;
  }

  /**
   * Get app settings
   */
  async getAppSettings(): Promise<AppSettings> {
    const settings = await this.getSettings();
    return settings.app;
  }

  /**
   * Update integration settings
   */
  async updateIntegrationSettings(
    updates: Partial<IntegrationSettings>,
    configuredBy?: string
  ): Promise<IntegrationSettings> {
    const settings = await this.getSettings();

    // Encrypt the client secret if provided and encryption is available
    if (updates.partnerClientSecret && this.encryptionKey) {
      updates.partnerClientSecret = this.encrypt(updates.partnerClientSecret);
    }

    settings.integration = {
      ...settings.integration,
      ...updates,
      configuredAt: new Date().toISOString(),
      configuredBy: configuredBy || settings.integration.configuredBy,
    };

    this.saveToFile(settings);
    this.cachedSettings = settings;

    logger.info("Integration settings updated", {
      configuredBy,
      hasPartnerCredentials: !!settings.integration.partnerTenantId,
      hasSourceEnvironment: !!settings.integration.sourceEnvironmentUrl,
    });

    return this.getDecryptedIntegrationSettingsInternal(settings.integration);
  }

  /**
   * Update app settings
   */
  async updateAppSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const settings = await this.getSettings();

    // Encrypt webhook URLs if provided and encryption is available
    if (updates.slackWebhookUrl && this.encryptionKey) {
      updates.slackWebhookUrl = this.encrypt(updates.slackWebhookUrl);
    }
    if (updates.teamsWebhookUrl && this.encryptionKey) {
      updates.teamsWebhookUrl = this.encrypt(updates.teamsWebhookUrl);
    }

    settings.app = {
      ...settings.app,
      ...updates,
    };

    this.saveToFile(settings);
    this.cachedSettings = settings;

    logger.info("App settings updated", {
      demoMode: settings.app.demoMode,
      slackEnabled: settings.app.slackEnabled,
      teamsEnabled: settings.app.teamsEnabled,
      emailEnabled: settings.app.emailEnabled,
    });

    return settings.app;
  }

  /**
   * Get decrypted integration settings (for API use)
   */
  async getDecryptedIntegrationSettings(): Promise<IntegrationSettings> {
    const settings = await this.getSettings();
    return this.getDecryptedIntegrationSettingsInternal(settings.integration);
  }

  /**
   * Get decrypted app settings (for API use)
   */
  async getDecryptedAppSettings(): Promise<AppSettings> {
    const settings = await this.getSettings();
    return this.getDecryptedAppSettingsInternal(settings.app);
  }

  private getDecryptedIntegrationSettingsInternal(
    settings: IntegrationSettings
  ): IntegrationSettings {
    const result = { ...settings };

    // Decrypt secret if encrypted
    if (result.partnerClientSecret && this.encryptionKey) {
      try {
        result.partnerClientSecret = this.decrypt(result.partnerClientSecret);
      } catch {
        // If decryption fails, it might not be encrypted yet
        logger.warn("Failed to decrypt client secret - may not be encrypted");
      }
    }

    return result;
  }

  private getDecryptedAppSettingsInternal(settings: AppSettings): AppSettings {
    const result = { ...settings };

    // Decrypt webhook URLs if encrypted
    if (result.slackWebhookUrl && this.encryptionKey) {
      try {
        result.slackWebhookUrl = this.decrypt(result.slackWebhookUrl);
      } catch {
        logger.warn("Failed to decrypt Slack webhook - may not be encrypted");
      }
    }

    if (result.teamsWebhookUrl && this.encryptionKey) {
      try {
        result.teamsWebhookUrl = this.decrypt(result.teamsWebhookUrl);
      } catch {
        logger.warn("Failed to decrypt Teams webhook - may not be encrypted");
      }
    }

    return result;
  }

  /**
   * Check if integration is configured
   */
  async isIntegrationConfigured(): Promise<boolean> {
    const settings = await this.getIntegrationSettings();
    return !!(settings.partnerTenantId && settings.partnerClientId && settings.partnerClientSecret);
  }

  /**
   * Clear all settings (for testing or reset)
   */
  async clearSettings(): Promise<void> {
    this.cachedSettings = null;
    if (existsSync(this.settingsFilePath)) {
      writeFileSync(this.settingsFilePath, JSON.stringify(this.getDefaultSettings(), null, 2));
    }
    logger.info("Settings cleared");
  }

  /**
   * Record a connection test result
   */
  async recordTestResult(success: boolean, error?: string): Promise<void> {
    const settings = await this.getSettings();
    settings.integration.lastTestedAt = new Date().toISOString();
    settings.integration.lastTestResult = success ? "success" : "failed";
    settings.integration.lastTestError = error;
    this.saveToFile(settings);
    this.cachedSettings = settings;
  }

  // Private methods

  private loadFromFile(): AllSettings {
    try {
      if (existsSync(this.settingsFilePath)) {
        const data = readFileSync(this.settingsFilePath, "utf-8");
        const parsed = JSON.parse(data);
        return {
          ...this.getDefaultSettings(),
          ...parsed,
          integration: {
            ...this.getDefaultSettings().integration,
            ...parsed.integration,
          },
          app: {
            ...this.getDefaultSettings().app,
            ...parsed.app,
          },
        };
      }
    } catch (error) {
      logger.warn("Failed to load settings from file", { error });
    }

    return this.getDefaultSettings();
  }

  private saveToFile(settings: AllSettings): void {
    try {
      writeFileSync(this.settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (error) {
      logger.error("Failed to save settings to file", error as Error);
      throw error;
    }
  }

  private getDefaultSettings(): AllSettings {
    return {
      integration: {
        tenantDiscoveryEnabled: false,
        connectionMappingEnabled: false,
        environmentVariablesEnabled: false,
      },
      app: {
        demoMode: process.env.DEMO_MODE !== "false",
        defaultMaxConcurrentDeployments: 3,
        defaultDeploymentTimeoutMs: 600000,
        autoRetryFailedDeployments: false,
        theme: "system",
      },
    };
  }

  private getOrCreateSalt(settingsDir: string): Buffer {
    const saltPath = join(settingsDir, ".agentsync-salt");
    try {
      if (existsSync(saltPath)) {
        return Buffer.from(readFileSync(saltPath, "utf-8"), "hex");
      }
    } catch {
      // Salt file doesn't exist or is invalid
    }

    // Generate new salt
    const salt = randomBytes(SALT_LENGTH);
    try {
      writeFileSync(saltPath, salt.toString("hex"));
    } catch {
      logger.warn("Failed to save encryption salt - using ephemeral salt");
    }
    return salt;
  }

  private encrypt(text: string): string {
    if (!this.encryptionKey) {
      return text; // No encryption if no key
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) {
      return encryptedText; // No decryption if no key
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      // Not encrypted or invalid format
      return encryptedText;
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

// Singleton instance
let settingsInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsInstance) {
    settingsInstance = new SettingsService();
  }
  return settingsInstance;
}

/**
 * Helper to get effective integration settings
 * Prefers database settings, falls back to environment variables
 */
export async function getEffectiveIntegrationSettings(): Promise<IntegrationSettings> {
  const settingsService = getSettingsService();
  const dbSettings = await settingsService.getDecryptedIntegrationSettings();

  return {
    partnerTenantId: dbSettings.partnerTenantId || process.env.PARTNER_TENANT_ID,
    partnerClientId: dbSettings.partnerClientId || process.env.PARTNER_CLIENT_ID,
    partnerClientSecret: dbSettings.partnerClientSecret || process.env.PARTNER_CLIENT_SECRET,
    sourceTenantId: dbSettings.sourceTenantId || process.env.SOURCE_TENANT_ID,
    sourceEnvironmentUrl: dbSettings.sourceEnvironmentUrl || process.env.SOURCE_ENVIRONMENT_URL,
    tenantDiscoveryEnabled:
      dbSettings.tenantDiscoveryEnabled ?? process.env.TENANT_DISCOVERY_ENABLED === "true",
    connectionMappingEnabled:
      dbSettings.connectionMappingEnabled ?? process.env.CONNECTION_MAPPING_ENABLED === "true",
    environmentVariablesEnabled:
      dbSettings.environmentVariablesEnabled ?? process.env.ENV_VARIABLES_ENABLED === "true",
    configuredAt: dbSettings.configuredAt,
    lastTestedAt: dbSettings.lastTestedAt,
    lastTestResult: dbSettings.lastTestResult,
    lastTestError: dbSettings.lastTestError,
  };
}
