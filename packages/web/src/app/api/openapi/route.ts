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

import { NextResponse } from "next/server";

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Copilot Studio Deployer API",
    description: "Multi-tenant Copilot Studio deployment automation API for MSPs",
    version: "1.0.0",
    contact: {
      name: "API Support",
    },
    license: {
      name: "MIT",
    },
  },
  servers: [
    {
      url: "{protocol}://{host}",
      variables: {
        protocol: {
          enum: ["http", "https"],
          default: "https",
        },
        host: {
          default: "localhost:3001",
        },
      },
    },
  ],
  tags: [
    { name: "deployments", description: "Deployment operations" },
    { name: "tenants", description: "Tenant management" },
    { name: "solutions", description: "Solution operations" },
    { name: "health", description: "Health check endpoints" },
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["health"],
        summary: "Health check",
        description: "Returns the health status of the service",
        operationId: "getHealth",
        responses: {
          200: {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/health/ready": {
      get: {
        tags: ["health"],
        summary: "Readiness check",
        description: "Returns the readiness status including dependency checks",
        operationId: "getReadiness",
        responses: {
          200: {
            description: "Service is ready",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReadinessResponse",
                },
              },
            },
          },
          503: {
            description: "Service is not ready",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ReadinessResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/deployments": {
      get: {
        tags: ["deployments"],
        summary: "List deployments",
        description: "Returns a list of all deployments",
        operationId: "listDeployments",
        security: [{ azureAd: [] }],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50 },
            description: "Maximum number of results to return",
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "failed", "cancelled"],
            },
            description: "Filter by status",
          },
        ],
        responses: {
          200: {
            description: "List of deployments",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Deployment" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["deployments"],
        summary: "Create a new deployment",
        description: "Creates a new deployment job",
        operationId: "createDeployment",
        security: [{ azureAd: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateDeploymentRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Deployment created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Deployment" },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          429: { $ref: "#/components/responses/TooManyRequests" },
        },
      },
    },
    "/api/deployments/{id}": {
      get: {
        tags: ["deployments"],
        summary: "Get deployment details",
        description: "Returns detailed information about a specific deployment",
        operationId: "getDeployment",
        security: [{ azureAd: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Deployment ID",
          },
        ],
        responses: {
          200: {
            description: "Deployment details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeploymentDetails" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/deployments/{id}/cancel": {
      post: {
        tags: ["deployments"],
        summary: "Cancel a deployment",
        description: "Cancels a pending or in-progress deployment",
        operationId: "cancelDeployment",
        security: [{ azureAd: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Deployment cancelled",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    cancelled: { type: "integer" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/deployments/{id}/retry": {
      post: {
        tags: ["deployments"],
        summary: "Retry failed jobs",
        description: "Retries all failed tenant deployments for a deployment",
        operationId: "retryDeployment",
        security: [{ azureAd: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "Jobs retried",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    retried: { type: "integer" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/tenants": {
      get: {
        tags: ["tenants"],
        summary: "List tenants",
        description: "Returns a list of all configured tenants",
        operationId: "listTenants",
        security: [{ azureAd: [] }],
        responses: {
          200: {
            description: "List of tenants",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Tenant" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/solutions": {
      get: {
        tags: ["solutions"],
        summary: "List solutions",
        description: "Returns a list of available solutions",
        operationId: "listSolutions",
        security: [{ azureAd: [] }],
        responses: {
          200: {
            description: "List of solutions",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Solution" },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/solutions/export": {
      post: {
        tags: ["solutions"],
        summary: "Export a solution",
        description: "Exports a solution from the source environment",
        operationId: "exportSolution",
        security: [{ azureAd: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["solutionName"],
                properties: {
                  solutionName: { type: "string" },
                  managed: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Solution exported",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    size: { type: "integer" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      azureAd: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
            tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
            scopes: {
              openid: "OpenID Connect",
              profile: "User profile",
              email: "User email",
            },
          },
        },
      },
    },
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy"] },
          timestamp: { type: "string", format: "date-time" },
          version: { type: "string" },
        },
      },
      ReadinessResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ready", "not_ready"] },
          timestamp: { type: "string", format: "date-time" },
          checks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                status: { type: "string", enum: ["healthy", "unhealthy"] },
                latency: { type: "integer" },
                error: { type: "string" },
              },
            },
          },
        },
      },
      Deployment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          solutionName: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "failed", "cancelled", "scheduled"],
          },
          totalTenants: { type: "integer" },
          completedTenants: { type: "integer" },
          failedTenants: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      DeploymentDetails: {
        allOf: [
          { $ref: "#/components/schemas/Deployment" },
          {
            type: "object",
            properties: {
              tenantResults: {
                type: "array",
                items: { $ref: "#/components/schemas/TenantDeploymentResult" },
              },
            },
          },
        ],
      },
      TenantDeploymentResult: {
        type: "object",
        properties: {
          tenantId: { type: "string", format: "uuid" },
          tenantName: { type: "string" },
          status: { type: "string" },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          error: { type: "string" },
          attemptNumber: { type: "integer" },
          durationMs: { type: "integer" },
        },
      },
      CreateDeploymentRequest: {
        type: "object",
        required: ["solutionPath", "tenantIds"],
        properties: {
          solutionPath: { type: "string" },
          tenantIds: {
            type: "array",
            items: { type: "string", format: "uuid" },
            minItems: 1,
          },
          options: {
            type: "object",
            properties: {
              parallel: { type: "integer", default: 5 },
              continueOnFailure: { type: "boolean", default: false },
              dryRun: { type: "boolean", default: false },
            },
          },
        },
      },
      Tenant: {
        type: "object",
        properties: {
          name: { type: "string" },
          tenantId: { type: "string", format: "uuid" },
          environmentUrl: { type: "string", format: "uri" },
          tags: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" },
        },
      },
      Solution: {
        type: "object",
        properties: {
          name: { type: "string" },
          uniqueName: { type: "string" },
          version: { type: "string" },
          isManaged: { type: "boolean" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
          details: { type: "array", items: { type: "object" } },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Unauthorized: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      TooManyRequests: {
        description: "Rate limit exceeded",
        headers: {
          "Retry-After": {
            schema: { type: "integer" },
            description: "Seconds until the rate limit resets",
          },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
