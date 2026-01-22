---
description: Monitor deployment progress in real-time
---

Use the agentsync skill to continuously monitor active deployments.

Start monitoring mode:

1. **Initial snapshot**: Show all running deployments with current progress
2. **Continuous polling**: Check for updates every 5-10 seconds
3. **Status updates**: Report when deployments:
   - Make progress (new steps completed)
   - Complete successfully
   - Fail with errors
   - Get stuck (no progress for >2 minutes)

4. **Summary statistics**: Display:
   - Total deployments in flight
   - Average completion time
   - Success/failure rate
   - Queue depth if any

5. **Alerts**: Notify immediately on:
   - ❌ Deployment failures
   - ⚠️  Deployments taking longer than expected
   - ✅ Successful completions
   - ⏸️  Deployments waiting for approval

6. **Auto-actions**: Offer to:
   - Retry failed deployments automatically
   - Cancel stuck deployments
   - Approve pending deployments

Continue monitoring until user stops or all deployments complete. Present updates in a clean, non-verbose format.
