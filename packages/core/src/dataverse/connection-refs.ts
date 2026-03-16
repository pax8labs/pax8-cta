/**
 * Copyright 2024 Pax8, Inc.
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

import { DataverseClient } from "./client.js";
import { ConnectionMapping, EnvironmentVariable } from "../config/schema.js";

/**
 * Connection Reference record from Dataverse
 */
export interface ConnectionReferenceRecord {
  connectionreferenceid: string;
  connectionreferencelogicalname: string;
  connectionreferencedisplayname: string;
  connectionid: string | null;
  connectorid: string;
  statecode: number;
  statuscode: number;
}

/**
 * Environment Variable Definition record
 */
export interface EnvironmentVariableDefinitionRecord {
  environmentvariabledefinitionid: string;
  schemaname: string;
  displayname: string;
  type: number; // 100000000=String, 100000001=Number, 100000002=Boolean, 100000003=JSON, 100000004=Data Source
  defaultvalue: string | null;
}

/**
 * Environment Variable Value record
 */
export interface EnvironmentVariableValueRecord {
  environmentvariablevalueid: string;
  value: string;
  environmentvariabledefinitionid: string;
}

/**
 * Operations for managing Connection References and Environment Variables
 */
export class ConnectionOperations {
  constructor(private client: DataverseClient) {}

  // ============================================================================
  // Connection References
  // ============================================================================

  /**
   * List all connection references in the environment
   */
  async listConnectionReferences(): Promise<ConnectionReferenceRecord[]> {
    const result = await this.client.get<{ value: ConnectionReferenceRecord[] }>(
      "/connectionreferences",
      {
        $select:
          "connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectionid,connectorid,statecode,statuscode",
        $orderby: "connectionreferencelogicalname asc",
      }
    );
    return result.value;
  }

  /**
   * Get a connection reference by logical name
   */
  async getConnectionReferenceByLogicalName(
    logicalName: string
  ): Promise<ConnectionReferenceRecord | null> {
    const result = await this.client.get<{ value: ConnectionReferenceRecord[] }>(
      "/connectionreferences",
      {
        $filter: `connectionreferencelogicalname eq '${logicalName}'`,
        $select:
          "connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectionid,connectorid,statecode,statuscode",
      }
    );
    return result.value[0] || null;
  }

  /**
   * Update the connection ID for a connection reference
   */
  async updateConnectionReference(
    connectionReferenceId: string,
    connectionId: string
  ): Promise<void> {
    await this.client.patch(`/connectionreferences(${connectionReferenceId})`, {
      connectionid: connectionId,
    });
  }

  /**
   * Apply connection mappings to the environment
   * Maps source connection references to target connections
   */
  async applyConnectionMappings(
    mappings: ConnectionMapping[]
  ): Promise<{ success: boolean; applied: number; errors: string[] }> {
    const errors: string[] = [];
    let applied = 0;

    for (const mapping of mappings) {
      try {
        // Find the connection reference by logical name
        const connRef = await this.getConnectionReferenceByLogicalName(mapping.sourceLogicalName);

        if (!connRef) {
          errors.push(`Connection reference not found: ${mapping.sourceLogicalName}`);
          continue;
        }

        // Update the connection ID
        await this.updateConnectionReference(
          connRef.connectionreferenceid,
          mapping.targetConnectionId
        );

        applied++;
      } catch (error) {
        errors.push(
          `Failed to map ${mapping.sourceLogicalName}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return {
      success: errors.length === 0,
      applied,
      errors,
    };
  }

  /**
   * Validate that all required connection references have connections assigned
   */
  async validateConnectionReferences(
    logicalNames: string[]
  ): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];

    for (const logicalName of logicalNames) {
      const connRef = await this.getConnectionReferenceByLogicalName(logicalName);

      if (!connRef) {
        missing.push(`${logicalName} (not found)`);
      } else if (!connRef.connectionid) {
        missing.push(`${logicalName} (no connection assigned)`);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  // ============================================================================
  // Environment Variables
  // ============================================================================

  /**
   * List all environment variable definitions in the environment
   */
  async listEnvironmentVariables(): Promise<EnvironmentVariableDefinitionRecord[]> {
    const result = await this.client.get<{ value: EnvironmentVariableDefinitionRecord[] }>(
      "/environmentvariabledefinitions",
      {
        $select: "environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue",
        $orderby: "schemaname asc",
      }
    );
    return result.value;
  }

  /**
   * Get an environment variable definition by schema name
   */
  async getEnvironmentVariableBySchemaName(
    schemaName: string
  ): Promise<EnvironmentVariableDefinitionRecord | null> {
    const result = await this.client.get<{ value: EnvironmentVariableDefinitionRecord[] }>(
      "/environmentvariabledefinitions",
      {
        $filter: `schemaname eq '${schemaName}'`,
        $select: "environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue",
      }
    );
    return result.value[0] || null;
  }

  /**
   * Get the current value of an environment variable
   */
  async getEnvironmentVariableValue(definitionId: string): Promise<string | null> {
    const result = await this.client.get<{ value: EnvironmentVariableValueRecord[] }>(
      "/environmentvariablevalues",
      {
        $filter: `_environmentvariabledefinitionid_value eq '${definitionId}'`,
        $select: "environmentvariablevalueid,value",
      }
    );
    return result.value[0]?.value || null;
  }

  /**
   * Set the value of an environment variable
   * Creates a new value record if none exists, updates if it does
   */
  async setEnvironmentVariableValue(
    schemaName: string,
    value: string | number | boolean
  ): Promise<void> {
    // Find the definition
    const definition = await this.getEnvironmentVariableBySchemaName(schemaName);
    if (!definition) {
      throw new Error(`Environment variable not found: ${schemaName}`);
    }

    const stringValue = typeof value === "string" ? value : JSON.stringify(value);

    // Check if a value record exists
    const existingValue = await this.client.get<{ value: EnvironmentVariableValueRecord[] }>(
      "/environmentvariablevalues",
      {
        $filter: `_environmentvariabledefinitionid_value eq '${definition.environmentvariabledefinitionid}'`,
        $select: "environmentvariablevalueid",
      }
    );

    if (existingValue.value.length > 0) {
      // Update existing value
      await this.client.patch(
        `/environmentvariablevalues(${existingValue.value[0].environmentvariablevalueid})`,
        {
          value: stringValue,
        }
      );
    } else {
      // Create new value record
      await this.client.post("/environmentvariablevalues", {
        value: stringValue,
        "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${definition.environmentvariabledefinitionid})`,
      });
    }
  }

  /**
   * Apply environment variable values to the environment
   */
  async applyEnvironmentVariables(
    variables: EnvironmentVariable[]
  ): Promise<{ success: boolean; applied: number; errors: string[] }> {
    const errors: string[] = [];
    let applied = 0;

    for (const variable of variables) {
      try {
        await this.setEnvironmentVariableValue(variable.schemaName, variable.value);
        applied++;
      } catch (error) {
        errors.push(
          `Failed to set ${variable.schemaName}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return {
      success: errors.length === 0,
      applied,
      errors,
    };
  }

  /**
   * Get current values for all environment variables (for snapshot/rollback)
   */
  async getCurrentEnvironmentVariableValues(): Promise<
    Map<string, { definitionId: string; value: string | null }>
  > {
    const definitions = await this.listEnvironmentVariables();
    const values = new Map<string, { definitionId: string; value: string | null }>();

    for (const def of definitions) {
      const value = await this.getEnvironmentVariableValue(def.environmentvariabledefinitionid);
      values.set(def.schemaname, {
        definitionId: def.environmentvariabledefinitionid,
        value,
      });
    }

    return values;
  }
}
