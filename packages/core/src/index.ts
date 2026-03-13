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

// Errors
export * from "./errors.js";

// Constants
export * from "./constants.js";

// Utilities
export * from "./utils/index.js";

// Configuration
export * from "./config/index.js";

// Authentication
export * from "./auth/index.js";

// Dataverse
export * from "./dataverse/index.js";

// Power Platform Admin
export * from "./powerplatform/index.js";

// Services
export * from "./services/index.js";

// Queue (in-memory alternative to Redis)
export * from "./queue/index.js";

// Repositories
export * from "./repositories/deployment.js";

// Mock/Demo data
export * from "./mock/demo-data.js";

// Test utilities are available at:
// import { createMockTokenManager, ... } from '@agentsync/core/dist/__tests__/test-utils.js'
// Do NOT export them from main index to avoid vitest being bundled in production
