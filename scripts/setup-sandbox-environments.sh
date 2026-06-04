#!/bin/bash
# Pax8 CTA Sandbox Environment Setup Script
# This script automates the creation of Power Platform environments for sandbox testing
#
# Prerequisites:
# - Power Platform CLI (pac) installed: https://learn.microsoft.com/power-platform/developer/cli/introduction
# - Authenticated with sandbox tenant: pac auth create --environment https://your-tenant.crm.dynamics.com
# - M365 Developer subscription with available environment quota
#
# Usage:
#   ./scripts/setup-sandbox-environments.sh
#
# What this script does:
# 1. Creates source environment for agent development
# 2. Creates 3 target environments for testing deployments
# 3. Waits for provisioning to complete
# 4. Outputs environment details for tenants.sandbox.yaml configuration

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Pax8 CTA Sandbox Environment Setup                    ║${NC}"
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v pac &> /dev/null; then
    echo -e "${RED}❌ Power Platform CLI (pac) not found${NC}"
    echo "   Install from: https://learn.microsoft.com/power-platform/developer/cli/introduction"
    exit 1
fi

echo -e "${GREEN}✓ Power Platform CLI found${NC}"

# Check if authenticated
if ! pac auth list &> /dev/null; then
    echo -e "${RED}❌ Not authenticated to Power Platform${NC}"
    echo "   Run: pac auth create --environment https://your-tenant.crm.dynamics.com"
    exit 1
fi

echo -e "${GREEN}✓ Authenticated to Power Platform${NC}"
echo ""

# Configuration
REGION="${REGION:-unitedstates}"
CURRENCY="${CURRENCY:-USD}"
LANGUAGE="${LANGUAGE:-1033}" # English

echo -e "${BLUE}Configuration:${NC}"
echo "  Region: $REGION"
echo "  Currency: $CURRENCY"
echo "  Language: $LANGUAGE"
echo ""

# Confirmation prompt
read -p "Create 4 new sandbox environments? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 1: Creating Source Environment${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Creating 'Pax8 CTA Dev Source' environment..."

# Create source environment
# Note: Remove --async flag if you want to wait for each environment to complete before moving on
pac admin create \
  --name "Pax8 CTA Dev Source" \
  --type Sandbox \
  --region "$REGION" \
  --currency "$CURRENCY" \
  --language "$LANGUAGE" || {
    echo -e "${RED}❌ Failed to create source environment${NC}"
    echo "   This might be due to environment quota limits or permissions"
    exit 1
  }

echo -e "${GREEN}✓ Source environment creation initiated${NC}"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 2: Creating Target Test Environments${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create target environment 1: Contoso
echo "Creating 'Contoso Sandbox' environment..."
pac admin create \
  --name "Contoso Sandbox" \
  --type Sandbox \
  --region "$REGION" \
  --currency "$CURRENCY" \
  --language "$LANGUAGE" || {
    echo -e "${YELLOW}⚠ Warning: Failed to create Contoso Sandbox${NC}"
  }

echo -e "${GREEN}✓ Contoso Sandbox creation initiated${NC}"
echo ""

# Create target environment 2: Fabrikam
echo "Creating 'Fabrikam Sandbox' environment..."
pac admin create \
  --name "Fabrikam Sandbox" \
  --type Sandbox \
  --region "$REGION" \
  --currency "$CURRENCY" \
  --language "$LANGUAGE" || {
    echo -e "${YELLOW}⚠ Warning: Failed to create Fabrikam Sandbox${NC}"
  }

echo -e "${GREEN}✓ Fabrikam Sandbox creation initiated${NC}"
echo ""

# Create target environment 3: Adventure Works
echo "Creating 'Adventure Works Sandbox' environment..."
pac admin create \
  --name "Adventure Works Sandbox" \
  --type Sandbox \
  --region "$REGION" \
  --currency "$CURRENCY" \
  --language "$LANGUAGE" || {
    echo -e "${YELLOW}⚠ Warning: Failed to create Adventure Works Sandbox${NC}"
  }

echo -e "${GREEN}✓ Adventure Works Sandbox creation initiated${NC}"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 3: Waiting for Provisioning${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Power Platform environments typically take 5-15 minutes to provision."
echo "You can check status with: pac admin list"
echo ""

WAIT_TIME=300  # 5 minutes
echo "Waiting ${WAIT_TIME} seconds before checking status..."
sleep $WAIT_TIME

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Step 4: Environment Status${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Listing all environments..."
pac admin list

echo ""
echo -e "${GREEN}✅ Sandbox environment setup initiated!${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Wait for all environments to finish provisioning (check with: pac admin list)"
echo ""
echo "2. Get environment URLs and IDs:"
echo "   pac admin list --json > environments.json"
echo ""
echo "3. Update config/tenants.sandbox.yaml with:"
echo "   - Source environment URL"
echo "   - Each target tenant's environment URL"
echo "   - Tenant IDs from Azure AD"
echo ""
echo "4. Create application users in each environment:"
echo "   - Go to https://admin.powerplatform.microsoft.com"
echo "   - For each environment: Settings > Users + permissions > Application users"
echo "   - Add your Pax8 CTA app registration"
echo "   - Grant System Administrator role"
echo ""
echo "5. Test authentication:"
echo "   az account get-access-token --resource <environment-url>"
echo ""
echo "6. Create and export test agents in source environment:"
echo "   - Go to https://copilotstudio.microsoft.com"
echo "   - Create minimal test agents"
echo "   - Export as managed solutions"
echo "   - Save to test-solutions/ directory"
echo ""
echo "For detailed setup instructions, see: docs/SANDBOX_SETUP.md"
echo ""
