# Notification Setup Guide

Pax8 CTA supports notifications via Slack, Microsoft Teams, and Email for deployment events.

## Notification Events

Notifications are sent for:

- **Deployment Started** - When a deployment begins
- **Deployment Completed** - When all tenants complete successfully
- **Deployment Failed** - When one or more tenants fail
- **Approval Required** - When a deployment needs approval before proceeding

## Slack Setup

### Step 1: Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name it "Pax8 CTA Notifications" and select your workspace
4. Click "Create App"

### Step 2: Enable Incoming Webhooks

1. In your app settings, go to "Incoming Webhooks" in the left sidebar
2. Toggle "Activate Incoming Webhooks" to **On**
3. Click "Add New Webhook to Workspace"
4. Select the channel where you want notifications (#deployments recommended)
5. Click "Allow"

### Step 3: Copy Webhook URL

1. Your webhook URL will look like: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`
2. Copy this URL

### Step 4: Configure in Pax8 CTA

1. Go to http://localhost:3000/settings
2. Navigate to the "Notifications" tab
3. Paste your webhook URL in the "Slack Webhook URL" field
4. Enable the events you want to be notified about
5. Click "Save Settings"
6. Click "Test Slack" to verify it's working

## Microsoft Teams Setup

### Option 1: Power Automate Workflow (Recommended)

Microsoft deprecated Incoming Webhooks in December 2025. Use Power Automate instead:

1. Open Microsoft Teams
2. Go to your desired channel → More options (...) → **Workflows**
3. Search for "Post to a channel when a webhook request is received"
4. Click "Add workflow"
5. Select your team and channel
6. Copy the webhook URL provided
7. Click "Add workflow"

### Option 2: Incoming Webhook (Legacy - may not be available)

If your organization still has this enabled:

1. Open Microsoft Teams
2. Go to your desired channel → More options (...) → **Connectors**
3. Search for "Incoming Webhook"
4. Click "Configure"
5. Name it "Pax8 CTA Notifications"
6. Upload an icon (optional)
7. Click "Create"
8. Copy the webhook URL
9. Click "Done"

### Configure in Pax8 CTA

1. Go to http://localhost:3000/settings
2. Navigate to the "Notifications" tab
3. Paste your webhook URL in the "Teams Webhook URL" field
4. Enable the events you want to be notified about
5. Click "Save Settings"
6. Click "Test Teams" to verify it's working

## Email Setup (Coming Soon)

Email notifications require an email service integration (SendGrid, AWS SES, etc.).

Configuration will be available in a future release.

## Testing Notifications

After configuring webhooks:

1. Go to Settings → Notifications
2. Click the **Test** button for your configured channel
3. Check your Slack/Teams channel for a test message
4. If successful, you'll receive notifications for real deployment events

## Notification Format

### Slack

Messages appear as formatted blocks with:

- Colored border (green=success, red=error, yellow=warning, blue=info)
- Event title and description
- Deployment details (ID, solution name, tenant count)
- Timestamp

### Teams

Messages appear as Adaptive Cards with:

- Colored header matching event severity
- Event details
- Action buttons (when applicable)
- Deployment summary

## Troubleshooting

### Slack

- **"Invalid webhook URL"**: Ensure URL starts with `https://hooks.slack.com/services/`
- **"Channel not found"**: The webhook may have been revoked. Create a new one
- **"No response"**: Check your Slack app is installed in the workspace

### Teams

- **"Connector not found"**: Your org may have disabled incoming webhooks
  - Solution: Use Power Automate Workflows instead
  - Ask IT admin to enable Connectors if needed
- **"Webhook expired"**: Teams webhooks can expire. Create a new one
- **"403 Forbidden"**: Workflow may be disabled. Check Teams admin center

### General

- Use the **Test** buttons in Settings to diagnose issues
- Check browser console for detailed error messages
- Verify webhook URLs have no extra spaces or characters

## Environment Variables

You can also configure webhooks via environment variables:

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Teams
TEAMS_WEBHOOK_URL=https://YOUR-TENANT.webhook.office.com/YOUR/WEBHOOK/URL

# Email (when available)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-api-key
EMAIL_FROM=noreply@example.com
```

Settings configured via the UI take precedence over environment variables.

## Security Notes

- Webhook URLs are encrypted in the database
- Never commit webhook URLs to version control
- Rotate webhooks periodically for security
- Use dedicated channels for deployment notifications
- Consider restricting who can modify notification settings

## Support

For issues or questions:

- Check the troubleshooting section above
- Review deployment logs for detailed error messages
- Create a GitHub issue with error details
