// Azure Bicep template for Copilot Studio Deployer
// Deploys: App Service (web), Container App (worker), Azure Cache for Redis
//
// Usage:
//   az deployment group create \
//     --resource-group your-rg \
//     --template-file main.bicep \
//     --parameters environmentName=prod

@description('Environment name (dev, staging, prod)')
param environmentName string = 'prod'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Azure AD Client ID for authentication')
@secure()
param azureAdClientId string

@description('Azure AD Client Secret')
@secure()
param azureAdClientSecret string

@description('Azure AD Tenant ID')
param azureAdTenantId string

@description('Partner Client Secret for GDAP')
@secure()
param partnerClientSecret string

@description('NextAuth secret for session encryption')
@secure()
param nextAuthSecret string

var prefix = 'csd-${environmentName}'
var tags = {
  Environment: environmentName
  Application: 'CopilotStudioDeployer'
}

// Azure Cache for Redis
resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: '${prefix}-redis'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: {
      'maxmemory-policy': 'volatile-lru'
    }
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${prefix}-plan'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Web App (Dashboard)
resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '${prefix}-web'
  location: location
  tags: tags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'REDIS_URL'
          value: 'rediss://:${redis.listKeys().primaryKey}@${redis.properties.hostName}:${redis.properties.sslPort}'
        }
        {
          name: 'NEXTAUTH_URL'
          value: 'https://${prefix}-web.azurewebsites.net'
        }
        {
          name: 'NEXTAUTH_SECRET'
          value: nextAuthSecret
        }
        {
          name: 'AZURE_AD_CLIENT_ID'
          value: azureAdClientId
        }
        {
          name: 'AZURE_AD_CLIENT_SECRET'
          value: azureAdClientSecret
        }
        {
          name: 'AZURE_AD_TENANT_ID'
          value: azureAdTenantId
        }
      ]
    }
  }
}

// Container Apps Environment (for worker)
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${prefix}-env'
  location: location
  tags: tags
  properties: {
    zoneRedundant: false
  }
}

// Worker Container App
resource workerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-worker'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        {
          name: 'redis-url'
          value: 'rediss://:${redis.listKeys().primaryKey}@${redis.properties.hostName}:${redis.properties.sslPort}'
        }
        {
          name: 'partner-client-secret'
          value: partnerClientSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: 'ghcr.io/your-org/copilot-studio-deployer-worker:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'PARTNER_CLIENT_SECRET'
              secretRef: 'partner-client-secret'
            }
            {
              name: 'WORKER_CONCURRENCY'
              value: '5'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'queue-scaling'
            custom: {
              type: 'redis'
              metadata: {
                listName: 'bull:tenant-deployment:wait'
                listLength: '10'
              }
              auth: [
                {
                  secretRef: 'redis-url'
                  triggerParameter: 'address'
                }
              ]
            }
          }
        ]
      }
    }
  }
}

// Outputs
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output redisHostname string = redis.properties.hostName
