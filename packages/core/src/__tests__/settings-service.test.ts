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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettingsService } from "../services/settings-service.js";

describe("SettingsService encryption", () => {
  const originalEncryptionSecret = process.env.SETTINGS_ENCRYPTION_SECRET;
  const tempDirs: string[] = [];

  beforeEach(() => {
    delete process.env.SETTINGS_ENCRYPTION_SECRET;
  });

  afterEach(() => {
    if (originalEncryptionSecret) {
      process.env.SETTINGS_ENCRYPTION_SECRET = originalEncryptionSecret;
    } else {
      delete process.env.SETTINGS_ENCRYPTION_SECRET;
    }

    for (const dir of tempDirs) {
      try {
        if (process.platform !== "win32") {
          chmodSync(dir, 0o700);
        }
      } catch {
        // Ignore cleanup chmod failures
      }
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("generates an encryption key file and encrypts integration secrets", async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), "agentsync-settings-"));
    tempDirs.push(settingsDir);

    const service = new SettingsService({ settingsDir });

    await service.updateIntegrationSettings({ partnerClientSecret: "top-secret" }, "test-user");

    const settingsPath = join(settingsDir, ".pax8-cta-settings.json");
    const keyPath = join(settingsDir, ".pax8-cta-encryption-key");
    const raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      integration: { partnerClientSecret: string };
    };

    expect(existsSync(keyPath)).toBe(true);
    expect(raw.integration.partnerClientSecret).not.toBe("top-secret");
    expect(raw.integration.partnerClientSecret.split(":")).toHaveLength(3);

    const decrypted = await service.getDecryptedIntegrationSettings();
    expect(decrypted.partnerClientSecret).toBe("top-secret");
  });

  it("encrypts webhook URLs in app settings", async () => {
    const settingsDir = mkdtempSync(join(tmpdir(), "agentsync-settings-"));
    tempDirs.push(settingsDir);

    const service = new SettingsService({ settingsDir });
    const webhookUrl = "https://hooks.slack.com/services/example";

    await service.updateAppSettings({ slackWebhookUrl: webhookUrl });

    const settingsPath = join(settingsDir, ".pax8-cta-settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
      app: { slackWebhookUrl: string };
    };

    expect(raw.app.slackWebhookUrl).not.toBe(webhookUrl);
    expect(raw.app.slackWebhookUrl.split(":")).toHaveLength(3);

    const decrypted = await service.getDecryptedAppSettings();
    expect(decrypted.slackWebhookUrl).toBe(webhookUrl);
  });

  it.skipIf(process.platform === "win32")(
    "fails sensitive writes when encryption key cannot be persisted",
    async () => {
      const settingsDir = mkdtempSync(join(tmpdir(), "agentsync-settings-"));
      tempDirs.push(settingsDir);
      chmodSync(settingsDir, 0o500);

      const service = new SettingsService({ settingsDir });

      await expect(
        service.updateIntegrationSettings({ partnerClientSecret: "blocked-secret" })
      ).rejects.toThrow("Cannot store sensitive settings without encryption");
    }
  );
});
