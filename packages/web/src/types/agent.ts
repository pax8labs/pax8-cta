/**
 * Agent-related type definitions
 */

export interface DeployedTenant {
  tenantId: string
  tenantName: string
  version: string
  deployedAt: string
  status: 'active' | 'failed' | 'updating'
}

export interface ConnectionReference {
  name: string
  connectorId: string
  required: boolean
  displayName?: string
}

export interface EnvironmentVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'secret'
  required: boolean
  defaultValue?: string
}

export type AgentStatus = 'active' | 'deprecated' | 'archived'

export interface Agent {
  id: string
  uniqueName: string
  friendlyName: string
  version: string
  isManaged: boolean
  isCustom?: boolean
  status: AgentStatus
  description?: string
  publisherName?: string
  category?: string
  capabilities?: string[]
  tags?: string[]
  deployedTenants: DeployedTenant[]
  totalDeployments: number
  // Extended details
  dependencies?: string[]
  connectionReferences?: ConnectionReference[]
  environmentVariables?: EnvironmentVariable[]
  lastPublished?: string
  sizeKb?: number
  changelog?: string
}

export interface SolutionMetadata {
  uniqueName: string
  friendlyName: string
  version: string
  publisherName: string
  isManaged: boolean
  description?: string
  connectionReferences?: ConnectionReference[]
  knowledgeSources?: string[]
  tenantSpecificValues?: TenantSpecificValue[]
}

export interface TenantSpecificValue {
  type: string
  value: string
  location: string
  description?: string
}

export interface UploadConflict {
  existingAgent: {
    uniqueName: string
    friendlyName: string
    version: string
    status: string
    createdAt: string
  }
  newAgent: {
    uniqueName: string
    friendlyName: string
    version: string
  }
  metadata: SolutionMetadata
  urlTemplates: UrlTemplate[]
  solutionBase64: string
}

export interface UrlTemplate {
  id: string
  type: 'sharepoint' | 'dynamics_crm' | 'onmicrosoft' | 'custom'
  originalUrl: string
  templatePattern: string
  extractedTenant: string
  fileLocations: string[]
  confirmed: boolean
}

export interface Environment {
  id: string
  displayName: string
  environmentUrl: string
  type: string
  isDefault?: boolean
}

export interface SourceSolution {
  name: string
  uniqueName: string
  version: string
  publisherId: string
  installedOn: string
  isManaged: boolean
  description?: string
}
