# AgentSync Sandbox Maintenance Runbook

This guide covers ongoing maintenance, monitoring, and optimization of your agentsync sandbox environment.

## Table of Contents

- [Daily Maintenance](#daily-maintenance)
- [Weekly Maintenance](#weekly-maintenance)
- [Monthly Maintenance](#monthly-maintenance)
- [Cost Monitoring](#cost-monitoring)
- [Data Cleanup](#data-cleanup)
- [Credential Rotation](#credential-rotation)
- [Test Data Refresh](#test-data-refresh)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting Failed Tests](#troubleshooting-failed-tests)

---

## Daily Maintenance

### Automated (via GitHub Actions or Cron)

#### Cleanup Script

Run daily at 2 AM UTC:

```bash
#!/bin/bash
# scripts/cleanup-sandbox.sh

# Clear completed jobs from Redis
redis-cli --scan --pattern "bull:*:completed" | xargs redis-cli DEL
redis-cli --scan --pattern "bull:*:failed" | head -100 | xargs redis-cli DEL

# Delete old deployments (> 7 days)
sqlite3 ./data/agentsync-sandbox.db \
  "DELETE FROM deployments WHERE created_at < datetime('now', '-7 days');"

# Delete old audit logs (> 30 days)
sqlite3 ./data/agentsync-sandbox.db \
  "DELETE FROM audit_logs WHERE created_at < datetime('now', '-30 days');"

# Clear old solution files
find ./sandbox-data/solutions -type f -mtime +30 -delete
find ./sandbox-data/snapshots -type f -mtime +30 -delete

echo "✅ Daily cleanup complete"
```

**Schedule via cron:**
```cron
0 2 * * * cd /path/to/agentsync && ./scripts/cleanup-sandbox.sh
```

---

## Weekly Maintenance

### Review Test Results

**Every Monday:**

1. Check GitHub Actions runs from past week
2. Review E2E test success rate:
   ```bash
   gh run list --workflow=sandbox-e2e.yml --limit 50
   ```
3. Investigate any failing tests
4. Update test data if needed

### Verify M365 Developer Subscription

**Check expiration date:**

1. Go to https://developer.microsoft.com/microsoft-365/profile
2. Check "Active subscription" status
3. Ensure it shows 90 days remaining
4. If < 30 days, increase sandbox activity (run more tests)

### Redis Memory Check

```bash
# Check Redis memory usage
redis-cli INFO memory | grep used_memory_human

# If memory usage > 80%, clear old data
redis-cli FLUSHDB
```

---

## Monthly Maintenance

### Azure Cost Review

**First of each month:**

1. Go to Azure Portal > Cost Management + Billing
2. Review costs for resource group: `agentsync-sandbox-rg`
3. Expected costs:
   - Azure Key Vault: ~$5/month
   - Azure Redis Cache (if using): ~$16/month
   - **Total: $5-21/month**
4. **Alert if costs exceed $30/month**

**View detailed breakdown:**
```bash
az consumption usage list \
  --start-date $(date -d "1 month ago" +%Y-%m-%d) \
  --end-date $(date +%Y-%m-%d) \
  --query "[].{Name:instanceName, Cost:pretaxCost}" \
  --output table
```

### Power Platform Capacity Check

1. Go to https://admin.powerplatform.microsoft.com
2. Go to **Resources** > **Capacity**
3. Check Dataverse database usage
4. **Alert if > 80% of 3GB limit**
5. If needed, delete old solutions from test environments

### Test Solution Refresh

**Monthly - update test agents:**

1. Update test agents in source environment (new features, bug fixes)
2. Export new versions:
   - `CustomerServiceAgent_0.2.0.zip`
   - `SalesAssistant_0.2.0.zip`
3. Commit to `test-solutions/` directory
4. Update version references in test files

---

## Cost Monitoring

### Set Up Azure Budget Alerts

```bash
# Create budget with alerts
az consumption budget create \
  --budget-name "AgentSync Sandbox Budget" \
  --amount 30 \
  --time-grain Monthly \
  --time-period "$(date -d "first day of this month" +%Y-%m-%d) to $(date -d "last day of next year" +%Y-%m-%d)" \
  --resource-group agentsync-sandbox-rg \
  --category Cost \
  --notifications \
    threshold=80 \
    contact-emails="your-email@example.com" \
    operator=GreaterThan \
    contact-roles="Owner"
```

### Cost Optimization Checklist

- [ ] Using local Docker Redis for development (free vs $16/month)
- [ ] E2E tests run only on main branch or manual trigger (not every PR)
- [ ] Test solutions are minimal size (< 1MB)
- [ ] Old snapshots deleted after 30 days
- [ ] Unused Power Platform environments deleted
- [ ] Redis memory usage monitored and cleared regularly

---

## Data Cleanup

### Database Cleanup

**Manually review and clean:**

```bash
# Connect to sandbox database
sqlite3 ./data/agentsync-sandbox.db

# Check database size
.dbinfo

# Count records
SELECT 'deployments', COUNT(*) FROM deployments
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs
UNION ALL
SELECT 'rollback_snapshots', COUNT(*) FROM rollback_snapshots;

# Delete old records (> 30 days)
DELETE FROM deployments WHERE created_at < datetime('now', '-30 days');
DELETE FROM audit_logs WHERE created_at < datetime('now', '-30 days');
DELETE FROM rollback_snapshots WHERE created_at < datetime('now', '-30 days');

# Vacuum to reclaim space
VACUUM;

.quit
```

### Power Platform Solution Cleanup

**Delete test solutions from sandbox environments:**

```bash
#!/bin/bash
# scripts/cleanup-power-platform-solutions.sh

# List solutions in each test environment
ENVS=("contoso-sandbox" "fabrikam-sandbox" "adventureworks-sandbox")

for env in "${ENVS[@]}"; do
  echo "Cleaning $env..."

  # List all test solutions (starting with CustomerServiceAgent or SalesAssistant)
  pac solution list --environment "https://$env.crm.dynamics.com" --json | \
    jq -r '.[] | select(.uniquename | startswith("CustomerService") or startswith("SalesAssistant")) | .solutionid' | \
    while read solution_id; do
      echo "  Deleting solution: $solution_id"
      pac solution delete --solution-id "$solution_id" --environment "https://$env.crm.dynamics.com"
    done
done

echo "✅ Cleanup complete"
```

**Run monthly:**
```bash
./scripts/cleanup-power-platform-solutions.sh
```

---

## Credential Rotation

### Client Secret Rotation (Every 90 Days)

**When secret expires in < 14 days:**

1. Go to Azure Portal > Azure AD > App registrations
2. Select "AgentSync Sandbox Service Principal"
3. Go to **Certificates & secrets**
4. Click **"New client secret"**
5. Description: `Sandbox Secret - Rotated $(date +%Y-%m)`
6. Expires: 90 days
7. Copy the new secret value

**Update secrets:**

```bash
# Update in Azure Key Vault
az keyvault secret set \
  --vault-name agentsync-sandbox-kv \
  --name sandbox-partner-client-secret \
  --value "<new-secret-value>"

# Update in GitHub Secrets
# (Manual: Go to Settings > Secrets and variables > Actions)

# Update local .env.sandbox file
# (Manual: Edit PARTNER_CLIENT_SECRET)

# Test authentication
pnpm cli tenants list --config ./config/tenants.sandbox.yaml
```

**Mark old secret for deletion:**
- Don't delete immediately (allow 24-48 hours grace period)
- After validation, delete old secret in Azure Portal

### NextAuth Secret Rotation (Optional - Every 180 Days)

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update Key Vault
az keyvault secret set \
  --vault-name agentsync-sandbox-kv \
  --name sandbox-nextauth-secret \
  --value "$NEW_SECRET"

# Update GitHub secret
# (Manual)

# Update .env.sandbox
sed -i '' "s/NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$NEW_SECRET/" .env.sandbox
```

---

## Test Data Refresh

### Regenerate Mock Data

**When test scenarios change:**

```bash
# Regenerate demo deployment history
pnpm cli generate-demo-data --output ./packages/web/.demo-deployments-v2.json

# Refresh tenant status
pnpm cli tenants sync --config ./config/tenants.sandbox.yaml
```

### Update Test Solutions

**When adding new features to test:**

1. Update agent in Copilot Studio (in source environment)
2. Export new version
3. Increment version number (e.g., `0.2.0` → `0.3.0`)
4. Save to `test-solutions/`
5. Update test files to use new version
6. Commit and push

```bash
# Example: Create new version
cp test-solutions/CustomerServiceAgent.zip \
   test-solutions/CustomerServiceAgent_0.3.0.zip

git add test-solutions/
git commit -m "feat(test): Update CustomerServiceAgent to v0.3.0"
```

---

## Monitoring & Alerts

### Health Check Endpoint

Add monitoring for sandbox health:

```bash
# Check sandbox health
curl http://localhost:3000/api/sandbox/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-02-03T12:00:00Z",
  "environment": "sandbox",
  "checks": {
    "database": { "status": "ok", "responseTime": 5 },
    "redis": { "status": "ok", "responseTime": 2 },
    "azureAd": { "status": "ok", "responseTime": 150 },
    "powerPlatform": { "status": "ok", "responseTime": 200 }
  }
}
```

### GitHub Actions Monitoring

**Set up notifications:**

1. Go to GitHub repository
2. Go to **Settings** > **Notifications**
3. Enable "Actions" notifications
4. Select: **"Only notifications for failed workflows"**

**Or use Slack integration:**
```yaml
# Add to .github/workflows/sandbox-e2e.yml

- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
    payload: |
      {
        "text": "❌ Sandbox E2E tests failed",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*E2E Test Failure*\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
          }
        }]
      }
```

### Redis Queue Monitoring

**Check queue health:**

```bash
# Check active jobs
redis-cli LLEN bull:tenant-deployments:active

# Check waiting jobs
redis-cli LLEN bull:tenant-deployments:waiting

# Check failed jobs (should be 0 or very low)
redis-cli LLEN bull:tenant-deployments:failed

# Get failed job details
redis-cli LRANGE bull:tenant-deployments:failed 0 -1
```

**Alert thresholds:**
- Failed jobs > 10: Investigate immediately
- Waiting jobs > 50: Check worker is running
- Active jobs stuck > 30 min: Check for hanging deployments

---

## Troubleshooting Failed Tests

### E2E Test Failures

**Step 1: Check GitHub Actions logs**
```bash
gh run view --log-failed
```

**Step 2: Check common causes**

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| Timeout | Slow Power Platform API | Increase timeout in test |
| Authentication failed | Expired client secret | Rotate secret (see above) |
| Connection not found | Missing connection mapping | Update tenants.sandbox.yaml |
| Solution import error | Invalid solution file | Re-export from source |
| Redis connection failed | Redis not running in CI | Check services configuration |

**Step 3: Run test locally**

```bash
# Set up sandbox environment
export $(cat .env.sandbox | xargs)

# Start services
docker start agentsync-sandbox-redis
pnpm worker &
pnpm web &

# Run specific failing test
pnpm exec playwright test sandbox-deployment.spec.ts --grep "deploy agent to Contoso"
```

**Step 4: Check Power Platform environment**

```bash
# Verify environment accessible
pac admin list

# Check solution status in target environment
pac solution list --environment https://contoso-sandbox.crm.dynamics.com
```

### Integration Test Failures

**Check Azure AD authentication:**
```bash
# Test token acquisition
az account get-access-token \
  --resource https://contoso-sandbox.crm.dynamics.com \
  --tenant <sandbox-tenant-id>
```

**Check Redis connectivity:**
```bash
redis-cli -h localhost -p 6379 ping
# Should return: PONG
```

### Performance Issues

**If tests are slow (> 20 min):**

1. **Check solution size:**
   ```bash
   ls -lh ./test-solutions/*.zip
   # Should be < 1 MB
   ```

2. **Reduce test concurrency:**
   ```yaml
   # In tenants.sandbox.yaml
   settings:
     rateLimit:
       maxConcurrent: 1  # Reduce from 2
   ```

3. **Skip health checks in tests:**
   ```yaml
   tenants:
     - name: "Contoso Sandbox"
       healthCheck:
         enabled: false  # Temporarily disable
   ```

---

## Runbook Checklists

### Daily Checklist
- [ ] Automated cleanup script ran successfully
- [ ] No critical test failures in past 24 hours
- [ ] Redis memory usage < 80%

### Weekly Checklist
- [ ] Review E2E test success rate
- [ ] Check M365 Developer subscription expiration
- [ ] Clear Redis queue backlog (if any)
- [ ] Review GitHub Actions logs for patterns

### Monthly Checklist
- [ ] Review Azure costs (target: < $30/month)
- [ ] Check Power Platform capacity usage
- [ ] Rotate client secrets (if < 14 days to expiry)
- [ ] Update test solutions with new versions
- [ ] Delete old deployment records (> 30 days)
- [ ] Run full E2E test suite manually
- [ ] Update documentation if processes changed

### Quarterly Checklist
- [ ] Review and update test scenarios
- [ ] Audit GitHub secrets and Key Vault access
- [ ] Review sandbox architecture for optimizations
- [ ] Renew M365 Developer subscription (if needed)
- [ ] Team training on sandbox usage (if new members)

---

## Emergency Procedures

### Full Sandbox Reset

**If sandbox is completely broken:**

```bash
# 1. Stop all services
docker stop agentsync-sandbox-redis
pkill -f "pnpm web"
pkill -f "pnpm worker"

# 2. Clear all data
rm -rf ./data/agentsync-sandbox.db
rm -rf ./sandbox-data/*
redis-cli FLUSHALL

# 3. Delete all solutions from Power Platform
./scripts/cleanup-power-platform-solutions.sh

# 4. Restart from scratch
docker start agentsync-sandbox-redis
pnpm build
pnpm web &
pnpm worker &

# 5. Run first test deployment
pnpm cli deploy \
  --solution ./test-solutions/CustomerServiceAgent.zip \
  --tenant "Contoso Sandbox" \
  --config ./config/tenants.sandbox.yaml
```

### Recover from Expired M365 Subscription

**If M365 Developer subscription expires:**

1. Go to https://developer.microsoft.com/microsoft-365/profile
2. Click "Renew subscription"
3. Confirm renewal
4. Wait 10-15 minutes for reactivation
5. Test access:
   ```bash
   pac admin list
   ```

6. If renewal fails:
   - Create new M365 Developer subscription
   - Update tenant IDs in configuration files
   - Re-create Power Platform environments
   - Re-configure app registration

---

## Contact & Support

**For sandbox issues:**
- Check [SANDBOX_SETUP.md](./SANDBOX_SETUP.md) first
- Review GitHub Issues
- Ask in team Slack/chat

**For Azure/M365 issues:**
- Azure Support: https://azure.microsoft.com/support/
- Power Platform Community: https://powerusers.microsoft.com/

---

**Last updated:** 2026-02-03
**Review frequency:** Monthly
