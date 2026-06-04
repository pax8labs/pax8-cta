# GDAP End-to-End Integration Tests

These tests verify the full token acquisition, GDAP delegation, and Dataverse access flow
against real Microsoft Azure AD and Graph API endpoints. They require two M365 Developer
Program tenants (partner + customer) with an active GDAP relationship.

## Prerequisites

### 1. Create M365 Developer Tenants

You need **two** tenants: one acting as the MSP (partner) and one acting as the customer.

1. Go to the [M365 Developer Program](https://developer.microsoft.com/en-us/microsoft-365/dev-program)
2. Sign up (free) and create your first developer tenant — this will be the **partner** tenant
3. Note the tenant domain (e.g., `partner.onmicrosoft.com`) and tenant ID
4. Repeat to create a second tenant for the **customer** side
   - You may need a second Microsoft account or use a different browser profile
   - Note this tenant's ID as well

### 2. Register an Azure AD App (Partner Tenant)

In the **partner** tenant's Azure portal:

1. Go to **Azure Active Directory** > **App registrations** > **New registration**
2. Name: `Pax8 CTA GDAP E2E` (or similar)
3. Supported account types: **Accounts in any organizational directory** (Multitenant)
4. Redirect URI: Leave blank (we use client credentials only)
5. Click **Register**

After registration:

1. Note the **Application (client) ID**
2. Go to **Certificates & secrets** > **New client secret**
   - Description: `E2E tests`
   - Expiration: 6 months (or 24 months)
   - Copy the secret **Value** immediately (it will not be shown again)

#### Required API Permissions

Add the following **Application** permissions and grant admin consent:

| API             | Permission                                 | Type        |
| --------------- | ------------------------------------------ | ----------- |
| Microsoft Graph | `DelegatedAdminRelationship.ReadWrite.All` | Application |
| Microsoft Graph | `Application.Read.All`                     | Application |
| Microsoft Graph | `Directory.Read.All`                       | Application |
| Dynamics CRM    | `user_impersonation`                       | Delegated   |

> Click **Grant admin consent for [tenant]** after adding all permissions.

### 3. Establish a GDAP Relationship

GDAP relationships are managed via Partner Center or the Graph API. Since developer
tenants may not have full Partner Center access, you can create the relationship via
the Graph API directly.

#### Option A: Partner Center (if available)

1. Log in to [Partner Center](https://partner.microsoft.com/dashboard)
2. Go to **Customers** > **Request a reseller relationship**
3. Send the invitation link to the customer tenant admin
4. In the customer tenant, accept the relationship and grant admin consent
5. Assign the **Power Platform Administrator** role to the GDAP relationship

#### Option B: Graph API (for dev tenants)

```bash
# Authenticate as partner tenant admin
# Create the GDAP relationship request
curl -X POST "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships" \
  -H "Authorization: Bearer $PARTNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Pax8 CTA E2E Test",
    "customer": {
      "tenantId": "<CUSTOMER_TENANT_ID>"
    },
    "accessDetails": {
      "unifiedRoles": [
        {
          "roleDefinitionId": "11648597-926c-4cf3-9c36-bcebb0ba8dcc"
        }
      ]
    },
    "duration": "P730D"
  }'
```

The `roleDefinitionId` above is for **Power Platform Administrator**.

Then, in the **customer** tenant, approve the relationship:

```bash
# Authenticate as customer tenant admin
curl -X POST "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships/<RELATIONSHIP_ID>/requests" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve"
  }'
```

### 4. Set Environment Variables

The E2E tests require these environment variables:

```bash
# Partner (MSP) tenant credentials
GDAP_PARTNER_TENANT_ID=<partner-tenant-guid>
GDAP_CLIENT_ID=<app-registration-client-id>
GDAP_CLIENT_SECRET=<app-registration-client-secret>

# Customer tenant to test against
GDAP_CUSTOMER_TENANT_ID=<customer-tenant-guid>

# Optional: specific Dataverse environment URL in the customer tenant
GDAP_CUSTOMER_ENVIRONMENT_URL=https://<org>.crm.dynamics.com
```

For local development, create a `.env.gdap-e2e` file in the repo root (it is gitignored).

For CI, store these as GitHub Actions secrets and reference them in the workflow.

### 5. Run the Tests

```bash
# Run GDAP E2E tests only
pnpm --filter @pax8-cta/core test -- --run src/__tests__/gdap-e2e/

# These tests are excluded from the default test suite. They only run when
# the required GDAP_* environment variables are present.
```

## CI Configuration

These tests run as a **separate, non-blocking CI job** (they should not gate PRs).
See `.github/workflows/gdap-e2e.yml` for the workflow configuration.

## Troubleshooting

| Error                       | Cause                       | Fix                                                                   |
| --------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `AADSTS700016`              | App not found in tenant     | Verify Client ID and that the app is multi-tenant                     |
| `AADSTS7000215`             | Invalid client secret       | Regenerate the secret in Azure portal                                 |
| `403 Forbidden` on Graph    | Missing API permissions     | Grant admin consent for the required permissions                      |
| No GDAP relationships found | Relationship not active     | Check Partner Center or re-create via Graph API                       |
| Dataverse 401               | GDAP delegation not working | Ensure Power Platform Admin role is assigned in the GDAP relationship |
