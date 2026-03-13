# GDAP Recording Fixtures

Sanitized recordings of Microsoft Graph API responses for GDAP endpoints.
Used by MSW-based integration tests to replay realistic API interactions.

## How to update

1. Run the recording script against a real partner tenant:
   ```bash
   PARTNER_TENANT_ID=... PARTNER_CLIENT_ID=... PARTNER_CLIENT_SECRET=... \
     npx tsx packages/core/src/__tests__/fixtures/gdap-recordings/record.ts
   ```
2. The script auto-sanitizes tenant IDs, display names, and tokens
3. Review the generated JSON files before committing
4. Tests in `gdap-client.msw.test.ts` replay these fixtures via MSW

## Fixture files

- `active-relationships.json` — Happy path: multiple active GDAP relationships
- `empty-relationships.json` — No relationships found
- `mixed-status.json` — Mix of active, expired, and pending relationships
- `expiring-soon.json` — Relationship expiring within 30 days
- `no-power-platform-role.json` — Active relationship missing Power Platform Admin role
- `error-unauthorized.json` — 401 response for invalid credentials
- `error-forbidden.json` — 403 response for insufficient permissions
- `error-throttled.json` — 429 response with Retry-After header
