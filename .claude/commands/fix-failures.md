---
description: Analyze and fix failed deployments
---

Use the agentsync skill to troubleshoot and resolve deployment failures.

Help me fix failed deployments:

1. **Identify failures**: Get all failed deployments with details
2. **Analyze root causes**: For each failure, check:
   - Error message and type (auth, network, conflict, etc.)
   - Tenant health status
   - Recent changes that might have caused the issue
   - Common failure patterns

3. **Suggest solutions**: For each failure type, provide specific remediation:
   - Permission errors → Check GDAP role assignments
   - Conflict errors → Review existing agent installations
   - Network errors → Verify tenant connectivity
   - Timeout errors → Consider retry with longer timeout

4. **Implement fixes**: Offer to:
   - Retry deployments with adjusted parameters
   - Rollback problematic deployments
   - Update tenant configuration
   - Schedule deployments for later

5. **Prevent recurrence**: Suggest:
   - Pre-deployment validation checks
   - Health monitoring improvements
   - Better error handling

Present findings in priority order (most critical first) with actionable next steps.
