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

import { coreLogger } from "./logger.js";
import { getSettingsService } from "./settings-service.js";
import { PRODUCT_NAME, PRODUCT_DOMAIN } from "../constants.js";

const logger = coreLogger.child({ service: "notifications" });

export interface NotificationPayload {
  title: string;
  message: string;
  color?: "success" | "error" | "warning" | "info";
  url?: string;
}

/**
 * Notification service for sending alerts via Slack, Teams, and Email
 */
export class NotificationService {
  /**
   * Send notification to all enabled channels
   */
  async sendNotification(payload: NotificationPayload): Promise<void> {
    const settingsService = getSettingsService();
    const settings = await settingsService.getDecryptedAppSettings();

    const promises: Promise<void>[] = [];

    if (settings.slackEnabled && settings.slackWebhookUrl) {
      promises.push(this.sendSlackNotification(settings.slackWebhookUrl, payload));
    }

    if (settings.teamsEnabled && settings.teamsWebhookUrl) {
      promises.push(this.sendTeamsNotification(settings.teamsWebhookUrl, payload));
    }

    if (settings.emailEnabled && settings.emailRecipients) {
      promises.push(this.sendEmailNotification(settings.emailRecipients, payload));
    }

    // Send all notifications in parallel
    const results = await Promise.allSettled(promises);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const channel = index === 0 ? "Slack" : index === 1 ? "Teams" : "Email";
        logger.warn(`Failed to send ${channel} notification`, { error: result.reason });
      }
    });
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(webhookUrl: string, payload: NotificationPayload): Promise<void> {
    const colorMap = {
      success: "#36a64f",
      error: "#ff0000",
      warning: "#ff9900",
      info: "#2196F3",
    };

    const slackPayload = {
      attachments: [
        {
          color: colorMap[payload.color || "info"],
          title: payload.title,
          text: payload.message,
          title_link: payload.url,
          footer: PRODUCT_NAME,
          footer_icon: `https://${PRODUCT_DOMAIN}/logo.png`,
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
    }

    logger.info("Slack notification sent", { title: payload.title });
  }

  /**
   * Send Microsoft Teams notification
   */
  async sendTeamsNotification(webhookUrl: string, payload: NotificationPayload): Promise<void> {
    const colorMap = {
      success: "00ff00",
      error: "ff0000",
      warning: "ff9900",
      info: "2196F3",
    };

    const teamsPayload = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: payload.title,
      themeColor: colorMap[payload.color || "info"],
      title: payload.title,
      text: payload.message,
      potentialAction: payload.url
        ? [
            {
              "@type": "OpenUri",
              name: "View Details",
              targets: [
                {
                  os: "default",
                  uri: payload.url,
                },
              ],
            },
          ]
        : undefined,
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamsPayload),
    });

    if (!response.ok) {
      throw new Error(`Teams webhook returned ${response.status}: ${await response.text()}`);
    }

    logger.info("Teams notification sent", { title: payload.title });
  }

  /**
   * Send email notification
   *
   * Email notifications are not yet implemented. Slack and Teams webhooks are
   * fully supported. Email integration (SendGrid, AWS SES, etc.) is planned
   * for a future release.
   */
  async sendEmailNotification(recipients: string, payload: NotificationPayload): Promise<void> {
    logger.info("Email notification skipped (not yet implemented)", {
      recipients,
      title: payload.title,
      message: "Use Slack or Teams webhooks for notifications",
    });
  }

  /**
   * Test a notification channel
   */
  async testNotification(
    channel: "slack" | "teams" | "email",
    webhookUrl?: string,
    recipients?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const testPayload: NotificationPayload = {
        title: `${PRODUCT_NAME} Test Notification`,
        message: `This is a test notification from ${PRODUCT_NAME}. If you see this, your ${channel} integration is working correctly!`,
        color: "info",
      };

      switch (channel) {
        case "slack":
          if (!webhookUrl) throw new Error("Slack webhook URL is required");
          await this.sendSlackNotification(webhookUrl, testPayload);
          break;
        case "teams":
          if (!webhookUrl) throw new Error("Teams webhook URL is required");
          await this.sendTeamsNotification(webhookUrl, testPayload);
          break;
        case "email":
          if (!recipients) throw new Error("Email recipients are required");
          await this.sendEmailNotification(recipients, testPayload);
          break;
      }

      return { success: true };
    } catch (error) {
      logger.error(`Test notification failed for ${channel}`, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Singleton instance
let notificationInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationInstance) {
    notificationInstance = new NotificationService();
  }
  return notificationInstance;
}
