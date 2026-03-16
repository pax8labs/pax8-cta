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

import * as crypto from "node:crypto";
import { Webhook, WebhookEvent, DeploymentStatus } from "../config/schema.js";
import { DEFAULT_WEBHOOK_RETRIES } from "../constants.js";

/**
 * Webhook event types
 */
export type WebhookEventType =
  | "deployment.started"
  | "deployment.completed"
  | "deployment.failed"
  | "wave.started"
  | "wave.completed"
  | "tenant.started"
  | "tenant.completed"
  | "tenant.failed"
  | "rollback.started"
  | "rollback.completed";

/**
 * Service for sending webhook notifications
 */
export class WebhookService {
  private webhooks: Webhook[];

  constructor(webhooks: Webhook[] = []) {
    this.webhooks = webhooks;
  }

  /**
   * Add a webhook configuration
   */
  addWebhook(webhook: Webhook): void {
    this.webhooks.push(webhook);
  }

  /**
   * Remove a webhook by URL
   */
  removeWebhook(url: string): void {
    this.webhooks = this.webhooks.filter((w) => w.url !== url);
  }

  /**
   * Send a webhook notification for an event
   */
  async sendNotification(
    eventType: WebhookEventType,
    payload: Omit<WebhookEvent, "event" | "timestamp">
  ): Promise<{
    sent: number;
    failed: number;
    errors: { url: string; error: string }[];
  }> {
    const event: WebhookEvent = {
      event: eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    // Find webhooks that are subscribed to this event
    const subscribedWebhooks = this.webhooks.filter((w) =>
      w.events.includes(eventType as Webhook["events"][number])
    );

    let sent = 0;
    let failed = 0;
    const errors: { url: string; error: string }[] = [];

    await Promise.all(
      subscribedWebhooks.map(async (webhook) => {
        const result = await this.sendToWebhook(webhook, event);
        if (result.success) {
          sent++;
        } else {
          failed++;
          errors.push({ url: webhook.url, error: result.error || "Unknown error" });
        }
      })
    );

    return { sent, failed, errors };
  }

  /**
   * Send event to a specific webhook with retry logic
   */
  private async sendToWebhook(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<{ success: boolean; error?: string }> {
    const maxRetries = webhook.retries ?? DEFAULT_WEBHOOK_RETRIES;
    let lastError: string = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const body = JSON.stringify(event);
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "CopilotStudioDeployer/1.0",
          "X-Webhook-Event": event.event,
          "X-Deployment-Id": event.deploymentId,
          ...webhook.headers,
        };

        // Add signature if secret is configured
        if (webhook.secret) {
          const signature = this.generateSignature(body, webhook.secret);
          headers["X-Webhook-Signature"] = signature;
          headers["X-Webhook-Signature-256"] = signature;
        }

        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body,
        });

        if (response.ok) {
          return { success: true };
        }

        lastError = `HTTP ${response.status}: ${response.statusText}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    return `sha256=${hmac.digest("hex")}`;
  }

  /**
   * Helper to send deployment started notification
   */
  async notifyDeploymentStarted(
    deploymentId: string,
    solutionName: string,
    totalTenants: number
  ): Promise<void> {
    await this.sendNotification("deployment.started", {
      deploymentId,
      solutionName,
      status: "in_progress",
      metadata: { totalTenants },
    });
  }

  /**
   * Helper to send deployment completed notification
   */
  async notifyDeploymentCompleted(
    deploymentId: string,
    solutionName: string,
    successCount: number,
    failedCount: number
  ): Promise<void> {
    const status: DeploymentStatus =
      failedCount === 0
        ? "completed"
        : failedCount === successCount + failedCount
          ? "failed"
          : "completed";

    await this.sendNotification("deployment.completed", {
      deploymentId,
      solutionName,
      status,
      metadata: { successCount, failedCount },
    });
  }

  /**
   * Helper to send deployment failed notification
   */
  async notifyDeploymentFailed(
    deploymentId: string,
    solutionName: string,
    error: string
  ): Promise<void> {
    await this.sendNotification("deployment.failed", {
      deploymentId,
      solutionName,
      status: "failed",
      error,
    });
  }

  /**
   * Helper to send wave started notification
   */
  async notifyWaveStarted(
    deploymentId: string,
    solutionName: string,
    waveNumber: number,
    totalWaves: number,
    tenantCount: number
  ): Promise<void> {
    await this.sendNotification("wave.started", {
      deploymentId,
      solutionName,
      status: "in_progress",
      waveNumber,
      metadata: { totalWaves, tenantCount },
    });
  }

  /**
   * Helper to send wave completed notification
   */
  async notifyWaveCompleted(
    deploymentId: string,
    solutionName: string,
    waveNumber: number,
    successCount: number,
    failedCount: number
  ): Promise<void> {
    await this.sendNotification("wave.completed", {
      deploymentId,
      solutionName,
      status: failedCount === 0 ? "completed" : "failed",
      waveNumber,
      metadata: { successCount, failedCount },
    });
  }

  /**
   * Helper to send tenant started notification
   */
  async notifyTenantStarted(
    deploymentId: string,
    solutionName: string,
    tenantId: string,
    tenantName: string,
    waveNumber?: number
  ): Promise<void> {
    await this.sendNotification("tenant.started", {
      deploymentId,
      solutionName,
      tenantId,
      tenantName,
      status: "in_progress",
      waveNumber,
    });
  }

  /**
   * Helper to send tenant completed notification
   */
  async notifyTenantCompleted(
    deploymentId: string,
    solutionName: string,
    tenantId: string,
    tenantName: string,
    waveNumber?: number
  ): Promise<void> {
    await this.sendNotification("tenant.completed", {
      deploymentId,
      solutionName,
      tenantId,
      tenantName,
      status: "completed",
      waveNumber,
    });
  }

  /**
   * Helper to send tenant failed notification
   */
  async notifyTenantFailed(
    deploymentId: string,
    solutionName: string,
    tenantId: string,
    tenantName: string,
    error: string,
    waveNumber?: number
  ): Promise<void> {
    await this.sendNotification("tenant.failed", {
      deploymentId,
      solutionName,
      tenantId,
      tenantName,
      status: "failed",
      error,
      waveNumber,
    });
  }

  /**
   * Helper to send rollback started notification
   */
  async notifyRollbackStarted(
    deploymentId: string,
    solutionName: string,
    tenantId: string,
    tenantName: string,
    previousVersion: string
  ): Promise<void> {
    await this.sendNotification("rollback.started", {
      deploymentId,
      solutionName,
      tenantId,
      tenantName,
      status: "rolling_back",
      metadata: { previousVersion },
    });
  }

  /**
   * Helper to send rollback completed notification
   */
  async notifyRollbackCompleted(
    deploymentId: string,
    solutionName: string,
    tenantId: string,
    tenantName: string,
    success: boolean,
    restoredVersion?: string,
    error?: string
  ): Promise<void> {
    await this.sendNotification("rollback.completed", {
      deploymentId,
      solutionName,
      tenantId,
      tenantName,
      status: success ? "rolled_back" : "failed",
      error,
      metadata: restoredVersion ? { restoredVersion } : undefined,
    });
  }
}
