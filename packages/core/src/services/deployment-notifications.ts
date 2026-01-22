import { getNotificationService, NotificationPayload } from "./notification-service.js";
import { getSettingsService } from "./settings-service.js";
import { coreLogger } from "./logger.js";

const logger = coreLogger.child({ service: "deployment-notifications" });

/**
 * Helper service for sending deployment lifecycle notifications
 * Checks settings before sending to ensure only enabled notifications are sent
 */
export class DeploymentNotifications {
  private baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.PUBLIC_URL || process.env.NEXTAUTH_URL;
  }

  /**
   * Send notification when deployment batch starts
   */
  async notifyDeploymentStart(
    deploymentId: string,
    solutionName: string,
    tenantCount: number
  ): Promise<void> {
    try {
      const settings = await getSettingsService().getDecryptedAppSettings();

      if (!settings.notifyOnDeploymentStart) {
        return;
      }

      const notificationService = getNotificationService();
      const deploymentUrl = this.baseUrl ? `${this.baseUrl}/deployments/${deploymentId}` : undefined;

      const payload: NotificationPayload = {
        title: `Deployment Started: ${solutionName}`,
        message: `Deploying agent "${solutionName}" to ${tenantCount} tenant${tenantCount === 1 ? '' : 's'}`,
        color: "info",
        url: deploymentUrl,
      };

      // Fire and forget - don't block deployment
      notificationService.sendNotification(payload).catch((error) => {
        logger.warn("Failed to send deployment start notification", { error, deploymentId });
      });
    } catch (error) {
      // Never fail deployment due to notification error
      logger.warn("Error in notifyDeploymentStart", { error, deploymentId });
    }
  }

  /**
   * Send notification when deployment batch completes successfully
   */
  async notifyDeploymentComplete(
    deploymentId: string,
    solutionName: string,
    successCount: number,
    totalCount: number,
    durationMs: number
  ): Promise<void> {
    try {
      const settings = await getSettingsService().getDecryptedAppSettings();

      if (!settings.notifyOnDeploymentComplete) {
        return;
      }

      const notificationService = getNotificationService();
      const deploymentUrl = this.baseUrl ? `${this.baseUrl}/deployments/${deploymentId}` : undefined;
      const durationMin = Math.round(durationMs / 60000);

      const payload: NotificationPayload = {
        title: `Deployment Complete: ${solutionName}`,
        message: `Successfully deployed "${solutionName}" to ${successCount}/${totalCount} tenant${totalCount === 1 ? '' : 's'} in ${durationMin} minute${durationMin === 1 ? '' : 's'}`,
        color: "success",
        url: deploymentUrl,
      };

      // Fire and forget
      notificationService.sendNotification(payload).catch((error) => {
        logger.warn("Failed to send deployment complete notification", { error, deploymentId });
      });
    } catch (error) {
      logger.warn("Error in notifyDeploymentComplete", { error, deploymentId });
    }
  }

  /**
   * Send notification when deployment batch fails
   */
  async notifyDeploymentFailure(
    deploymentId: string,
    solutionName: string,
    failedCount: number,
    totalCount: number,
    errorSummary?: string
  ): Promise<void> {
    try {
      const settings = await getSettingsService().getDecryptedAppSettings();

      if (!settings.notifyOnDeploymentFailure) {
        return;
      }

      const notificationService = getNotificationService();
      const deploymentUrl = this.baseUrl ? `${this.baseUrl}/deployments/${deploymentId}` : undefined;

      let message = `Deployment failed for "${solutionName}" - ${failedCount}/${totalCount} tenant${totalCount === 1 ? '' : 's'} failed`;
      if (errorSummary) {
        message += `\n\nError: ${errorSummary}`;
      }

      const payload: NotificationPayload = {
        title: `Deployment Failed: ${solutionName}`,
        message,
        color: "error",
        url: deploymentUrl,
      };

      // Fire and forget
      notificationService.sendNotification(payload).catch((error) => {
        logger.warn("Failed to send deployment failure notification", { error, deploymentId });
      });
    } catch (error) {
      logger.warn("Error in notifyDeploymentFailure", { error, deploymentId });
    }
  }

  /**
   * Send notification when deployment requires approval
   */
  async notifyApprovalNeeded(
    deploymentId: string,
    solutionName: string,
    tenantCount: number,
    reason?: string
  ): Promise<void> {
    try {
      const settings = await getSettingsService().getDecryptedAppSettings();

      if (!settings.notifyOnApprovalNeeded) {
        return;
      }

      const notificationService = getNotificationService();
      const deploymentUrl = this.baseUrl ? `${this.baseUrl}/deployments/${deploymentId}` : undefined;

      let message = `Deployment of "${solutionName}" to ${tenantCount} tenant${tenantCount === 1 ? '' : 's'} requires approval`;
      if (reason) {
        message += `\n\nReason: ${reason}`;
      }

      const payload: NotificationPayload = {
        title: `Approval Required: ${solutionName}`,
        message,
        color: "warning",
        url: deploymentUrl,
      };

      // Fire and forget
      notificationService.sendNotification(payload).catch((error) => {
        logger.warn("Failed to send approval needed notification", { error, deploymentId });
      });
    } catch (error) {
      logger.warn("Error in notifyApprovalNeeded", { error, deploymentId });
    }
  }
}

// Singleton instance
let deploymentNotificationsInstance: DeploymentNotifications | null = null;

export function getDeploymentNotifications(baseUrl?: string): DeploymentNotifications {
  if (!deploymentNotificationsInstance || (baseUrl && deploymentNotificationsInstance["baseUrl"] !== baseUrl)) {
    deploymentNotificationsInstance = new DeploymentNotifications(baseUrl);
  }
  return deploymentNotificationsInstance;
}
