# Testing Guide for Recent Changes

## Quick Wins Implementation - Testing Checklist

### 1. Scheduled Deployments UI (#149)

**Location:** Settings → Schedules tab

**Test Scenarios:**

✅ **View Configuration Schedule**
- Navigate to Settings → Schedules
- Verify cron expression is displayed
- Check "Next 5 runs" shows correct timestamps
- Confirm timezone is shown

✅ **Register Schedule**
1. Enter solution name (e.g., "MyAgent")
2. Enter solution path (e.g., "./solutions/MyAgent.zip")
3. Click "Register Schedule"
4. Verify success message appears
5. Check schedule appears in "Registered Schedules" list

✅ **Remove All Schedules**
1. Click "Remove All" button
2. Confirm dialog appears
3. Verify schedules are cleared

✅ **Dark Mode**
- Toggle dark mode in settings
- Verify schedules page renders correctly

---

### 2. Webhook Management UI (#30)

**Location:** Settings → Webhooks tab

**Test Scenarios:**

✅ **Create Webhook**
1. Click "Create Webhook"
2. Enter webhook name (e.g., "GitHub Actions")
3. Click "Create"
4. **IMPORTANT:** Copy the webhook secret (shown once!)
5. Verify webhook appears in list

✅ **View Webhook Details**
- Click on a webhook card
- Check webhook ID is displayed
- Verify last used timestamp (if applicable)
- Check invocation statistics

✅ **Enable/Disable Webhook**
1. Click "Disable" on an enabled webhook
2. Verify status changes to "Disabled"
3. Click "Enable" to re-enable

✅ **Regenerate Secret**
1. Click "Regenerate Secret"
2. Confirm dialog
3. **IMPORTANT:** Copy the new secret (shown once!)
4. Verify success message

✅ **Delete Webhook**
1. Click "Delete"
2. Confirm dialog
3. Verify webhook is removed from list

✅ **View Invocation History**
1. Select a webhook
2. Scroll down to "Invocation History"
3. Verify past invocations are listed
4. Check status indicators (success/failed/invalid_signature)
5. Click "View payload" to expand details

✅ **Test Webhook (Advanced)**
Use curl or Postman to test the webhook endpoint:
```bash
# Generate timestamp and signature (see documentation in UI)
curl -X POST http://localhost:3000/api/webhooks/deploy \
  -H "Authorization: Bearer <webhook-secret>" \
  -H "x-webhook-timestamp: $(date +%s)000" \
  -H "x-webhook-signature: <hmac-sha256-signature>" \
  -H "Content-Type: application/json" \
  -d '{
    "solution": "TestAgent",
    "version": "1.0.0",
    "tenants": "all",
    "metadata": {
      "commit": "abc123",
      "branch": "main"
    }
  }'
```

---

### 3. Standard Error Responses (#147)

**Location:** All API endpoints (demonstrated in `/api/webhooks/deploy`)

**Test Scenarios:**

✅ **Missing Authorization**
```bash
curl -X POST http://localhost:3000/api/webhooks/deploy \
  -H "Content-Type: application/json" \
  -d '{"solution": "Test", "tenants": "all"}'
```
**Expected Response:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authorization header...",
  }
}
```

✅ **Invalid Payload**
```bash
curl -X POST http://localhost:3000/api/webhooks/deploy \
  -H "Authorization: Bearer invalid-secret" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```
**Expected Response:**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid webhook payload",
    "details": {...}
  }
}
```

✅ **Invalid Webhook Secret**
```bash
curl -X POST http://localhost:3000/api/webhooks/deploy \
  -H "Authorization: Bearer wrong-secret-12345" \
  -H "Content-Type: application/json" \
  -d '{"solution": "Test", "tenants": "all"}'
```
**Expected Response:**
```json
{
  "error": {
    "code": "WEBHOOK_NOT_FOUND",
    "message": "Webhook not found or disabled"
  }
}
```

---

### 4. Solution Diff Preview (#6)

**Location:** Can be integrated into deployment creation flow

**Test as Component:**

Create a test page to render the component:

```tsx
import { SolutionDiffPreview } from '@/components/SolutionDiffPreview'

export default function TestPage() {
  return (
    <div className="p-8">
      <SolutionDiffPreview
        solutionPath="./solutions/TestAgent.zip"
        tenantId="your-tenant-id"
        onConfirm={() => console.log('Confirmed!')}
        onCancel={() => console.log('Cancelled')}
      />
    </div>
  )
}
```

✅ **View Diff Data**
- Component should auto-load diff from API
- Check loading state appears initially
- Verify solution metadata displays
- Check tenant information is shown

✅ **View Changes**
1. Click "Added" tab
   - Verify green badges for new components
   - Check component names and types
2. Click "Modified" tab
   - Verify blue badges for changed components
   - Check change details are shown
3. Click "Removed" tab
   - Verify red badges for deleted components

✅ **Warnings**
- If diff includes warnings, verify amber warning box appears
- Check warning messages are clear

✅ **Actions**
1. Click "Cancel" - should trigger onCancel callback
2. Click "Confirm & Deploy" - should trigger onConfirm callback

✅ **Error Handling**
- Simulate API error (invalid path/tenantId)
- Verify error message displays
- Click "Retry" to reload

---

## Integration Testing

### Webhook → Deployment Flow
1. Create a webhook in Settings → Webhooks
2. Trigger deployment via webhook API
3. Check deployment appears in Deployments page
4. Verify "triggeredBy" shows "Webhook" badge
5. Check invocation history in Settings → Webhooks

### Schedule → Deployment Flow
1. Configure schedule in tenants.yaml
2. Register schedule in Settings → Schedules
3. Wait for scheduled time (or trigger manually)
4. Verify deployment is created
5. Check deployment shows "Scheduled" trigger

---

## Manual Testing Checklist

### UI/UX
- [ ] All tabs in Settings page work correctly
- [ ] Dark mode renders properly in all new components
- [ ] Forms validate input correctly
- [ ] Success/error messages are clear
- [ ] Loading states display properly
- [ ] Responsive design works on mobile

### Functionality
- [ ] Webhooks can be created and deleted
- [ ] Webhook secrets are generated securely
- [ ] Invocation history is logged correctly
- [ ] Schedules can be registered and removed
- [ ] Solution diff loads and displays correctly
- [ ] Error responses follow standard format

### Security
- [ ] Webhook signature validation works
- [ ] Timestamp validation prevents replay attacks
- [ ] Rate limiting is applied (100 req/hour)
- [ ] Admin-only endpoints require authentication
- [ ] Secrets are only shown once on creation

---

## Known Issues

### Pre-existing Test Failures
- Some approval route tests failing (not related to our changes)
- Some health check tests failing (not related to our changes)
- These should be addressed separately in #148

### Edge Cases to Test
- [ ] Very long solution diffs (>100 components)
- [ ] Webhook invocations with missing headers
- [ ] Schedule registration with invalid cron
- [ ] Multiple simultaneous webhook calls

---

## Performance Testing

### Load Testing
```bash
# Test webhook rate limiting
for i in {1..150}; do
  curl -X POST http://localhost:3000/api/webhooks/deploy \
    -H "Authorization: Bearer <secret>" &
done
# Should see 429 errors after 100 requests
```

### Response Times
- Webhook endpoints should respond in <200ms
- Schedule listing should load in <100ms
- Solution diff should complete in <5s (depends on solution size)

---

## Next Steps

1. **Manual Testing:** Go through each test scenario above
2. **Integration:** Test webhook → deployment → invocation logging flow
3. **Documentation:** Review inline documentation in Settings pages
4. **Production:** Test with real Power Platform environments
5. **Monitoring:** Check logs for any errors during testing

---

## Reporting Issues

If you find issues during testing:

1. **Check logs:** `npm run dev` output
2. **Browser console:** For frontend errors
3. **Network tab:** For API call failures
4. **Create issue:** Use GitHub issues with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Browser/environment details
