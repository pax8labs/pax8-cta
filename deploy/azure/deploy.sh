#!/bin/bash
# Azure deployment script for Copilot Studio Deployer
#
# Prerequisites:
#   - Azure CLI installed and logged in
#   - Bicep CLI installed (comes with Azure CLI)
#
# Usage:
#   ./deploy.sh -g <resource-group> -e <environment> -c <config-file>

set -e

# Default values
ENVIRONMENT="prod"
LOCATION="eastus"

usage() {
    echo "Usage: $0 -g <resource-group> [-e <environment>] [-l <location>]"
    echo ""
    echo "Options:"
    echo "  -g    Resource group name (required)"
    echo "  -e    Environment name (default: prod)"
    echo "  -l    Azure region (default: eastus)"
    echo "  -h    Show this help message"
    exit 1
}

while getopts "g:e:l:h" opt; do
    case $opt in
        g) RESOURCE_GROUP="$OPTARG" ;;
        e) ENVIRONMENT="$OPTARG" ;;
        l) LOCATION="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

if [ -z "$RESOURCE_GROUP" ]; then
    echo "Error: Resource group is required"
    usage
fi

echo "=== Copilot Studio Deployer - Azure Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo ""

# Create resource group if it doesn't exist
echo "Creating resource group if needed..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# Prompt for secrets
echo ""
echo "Please provide the following secrets:"
read -sp "Azure AD Client ID: " AZURE_AD_CLIENT_ID
echo ""
read -sp "Azure AD Client Secret: " AZURE_AD_CLIENT_SECRET
echo ""
read -sp "Azure AD Tenant ID: " AZURE_AD_TENANT_ID
echo ""
read -sp "Partner Client Secret (GDAP): " PARTNER_CLIENT_SECRET
echo ""

# Generate NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "Generated NextAuth secret."

# Deploy Bicep template
echo ""
echo "Deploying infrastructure..."
az deployment group create \
    --resource-group "$RESOURCE_GROUP" \
    --template-file "$(dirname "$0")/bicep/main.bicep" \
    --parameters \
        environmentName="$ENVIRONMENT" \
        location="$LOCATION" \
        azureAdClientId="$AZURE_AD_CLIENT_ID" \
        azureAdClientSecret="$AZURE_AD_CLIENT_SECRET" \
        azureAdTenantId="$AZURE_AD_TENANT_ID" \
        partnerClientSecret="$PARTNER_CLIENT_SECRET" \
        nextAuthSecret="$NEXTAUTH_SECRET" \
    --output table

# Get outputs
WEB_URL=$(az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name main \
    --query "properties.outputs.webAppUrl.value" \
    --output tsv)

echo ""
echo "=== Deployment Complete ==="
echo "Web Dashboard: $WEB_URL"
echo ""
echo "Next steps:"
echo "1. Deploy your code to the App Service (use GitHub Actions or az webapp deploy)"
echo "2. Upload your tenants.yaml config to the web app"
echo "3. Configure Azure AD redirect URI: $WEB_URL/api/auth/callback/azure-ad"
