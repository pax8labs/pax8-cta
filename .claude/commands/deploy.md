---
description: Deploy an agent to specified tenants
---

Use the agentsync skill to create a new deployment.

I need to deploy an agent. Help me with this workflow:

1. Ask which agent to deploy (or check available agents if not specified)
2. Ask which tenant(s) to deploy to (or show available tenants if not specified)
3. Confirm the deployment details before proceeding
4. Create the deployment using the API
5. Monitor the deployment progress and report status
6. If deployment fails, analyze the error and suggest fixes

Make sure to validate:
- Agent exists and is ready for deployment
- Tenant(s) are healthy and accessible
- No conflicting deployments are in progress
