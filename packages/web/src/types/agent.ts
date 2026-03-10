/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Agent-related type definitions
 */

export interface DeployedTenant {
  tenantId: string;
  tenantName: string;
  version: string;
  deployedAt: string;
  status: "active" | "failed" | "updating";
}

export interface ConnectionReference {
  name: string;
  connectorId: string;
  required: boolean;
  displayName?: string;
}

export interface EnvironmentVariable {
  name: string;
  type: "string" | "number" | "boolean" | "secret";
  required: boolean;
  defaultValue?: string;
}

export type AgentStatus = "active" | "deprecated" | "archived";

export interface Agent {
  id: string;
  uniqueName: string;
  friendlyName: string;
  version: string;
  isManaged: boolean;
  isCustom?: boolean;
  status: AgentStatus;
  description?: string;
  publisherName?: string;
  category?: string;
  capabilities?: string[];
  tags?: string[];
  deployedTenants: DeployedTenant[];
  totalDeployments: number;
  // Extended details
  dependencies?: string[];
  connectionReferences?: ConnectionReference[];
  environmentVariables?: EnvironmentVariable[];
  lastPublished?: string;
  sizeKb?: number;
  changelog?: string;
}

export interface SolutionMetadata {
  uniqueName: string;
  friendlyName: string;
  version: string;
  publisherName: string;
  isManaged: boolean;
  description?: string;
  connectionReferences?: ConnectionReference[];
  knowledgeSources?: string[];
  tenantSpecificValues?: TenantSpecificValue[];
}

export type TenantSpecificValueType =
  | "sharepoint_url"
  | "dataverse_url"
  | "custom_url"
  | "environment_variable"
  | "connection_reference";

export interface TenantSpecificValue {
  type: TenantSpecificValueType;
  value: string;
  location: string;
  description?: string;
}

export interface UploadConflict {
  existingAgent: {
    uniqueName: string;
    friendlyName: string;
    version: string;
    status: string;
    createdAt: string;
  };
  newAgent: {
    uniqueName: string;
    friendlyName: string;
    version: string;
  };
  metadata: SolutionMetadata;
  urlTemplates: UrlTemplate[];
  solutionBase64: string;
}

export interface UrlTemplate {
  id: string;
  type: "sharepoint" | "dynamics_crm" | "onmicrosoft" | "custom";
  originalUrl: string;
  templatePattern: string;
  extractedTenant: string;
  fileLocations: string[];
  confirmed: boolean;
}

export interface Environment {
  id: string;
  displayName: string;
  environmentUrl: string;
  type: string;
  isDefault?: boolean;
}

export interface SourceSolution {
  name: string;
  uniqueName: string;
  version: string;
  publisherId: string;
  installedOn: string;
  isManaged: boolean;
  description?: string;
}
