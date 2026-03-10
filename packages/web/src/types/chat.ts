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

// Chat message types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  action?: ChatAction;
}

// Actions that can be taken from chat
export interface ChatAction {
  type: "retry" | "cancel" | "navigate" | "deploy";
  label: string;
  deploymentId?: string;
  path?: string;
  requiresConfirmation: boolean;
  // For deploy actions
  agentName?: string;
  tenantIds?: string[];
  tenantNames?: string[];
}

// Intent classification
export type Intent =
  | { type: "query"; query: string }
  | { type: "retry_deployment"; deploymentId: string; deploymentName?: string }
  | { type: "cancel_deployment"; deploymentId: string; deploymentName?: string }
  | { type: "create_deployment"; agentName: string; tenantIds: string[]; tenantNames: string[] }
  | { type: "navigate"; page: string; path?: string }
  | { type: "unknown"; message: string };

// LLM response format
export interface LLMResponse {
  content: string;
  intent: Intent;
  actions?: ChatAction[];
}

// Chat state
export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
}

// Action confirmation
export interface ActionConfirmation {
  action: ChatAction;
  message: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}
