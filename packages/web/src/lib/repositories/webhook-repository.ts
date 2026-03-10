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
 * Repository for webhook operations
 * Handles webhook configurations and invocation history
 */

import { getDatabase } from "../db";
import { randomBytes } from "crypto";

export interface Webhook {
  id: string;
  name: string;
  secret: string;
  enabled: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface WebhookInvocation {
  id: string;
  webhookId: string | null;
  payload: string;
  signature: string | null;
  status: "success" | "failed" | "invalid_signature" | "rate_limited";
  batchId: string | null;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  processedAt: string | null;
}

interface DbWebhook {
  id: string;
  name: string;
  secret: string;
  enabled: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  last_used_at: string | null;
}

interface DbWebhookInvocation {
  id: string;
  webhook_id: string | null;
  payload: string;
  signature: string | null;
  status: string;
  batch_id: string | null;
  error_message: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  processed_at: string | null;
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a new webhook configuration
 */
export function createWebhook(webhook: Webhook): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO webhooks (
      id, name, secret, enabled, created_at, created_by, updated_at, last_used_at
    ) VALUES (
      @id, @name, @secret, @enabled, @created_at, @created_by, @updated_at, @last_used_at
    )
  `);

  stmt.run({
    id: webhook.id,
    name: webhook.name,
    secret: webhook.secret,
    enabled: webhook.enabled ? 1 : 0,
    created_at: webhook.createdAt,
    created_by: webhook.createdBy,
    updated_at: webhook.updatedAt,
    last_used_at: webhook.lastUsedAt,
  });
}

/**
 * Get all webhook configurations
 */
export function listWebhooks(): Webhook[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM webhooks ORDER BY created_at DESC");
  const rows = stmt.all() as DbWebhook[];

  return rows.map(mapDbWebhook);
}

/**
 * Get a webhook by ID
 */
export function getWebhookById(id: string): Webhook | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM webhooks WHERE id = ?");
  const row = stmt.get(id) as DbWebhook | undefined;

  return row ? mapDbWebhook(row) : null;
}

/**
 * Get a webhook by secret (for validation)
 */
export function getWebhookBySecret(secret: string): Webhook | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM webhooks WHERE secret = ? AND enabled = 1");
  const row = stmt.get(secret) as DbWebhook | undefined;

  return row ? mapDbWebhook(row) : null;
}

/**
 * Update webhook configuration
 */
export function updateWebhook(id: string, updates: Partial<Webhook>): void {
  const db = getDatabase();
  const fields: string[] = [];
  const values: Record<string, string | number> = { id };

  if (updates.name !== undefined) {
    fields.push("name = @name");
    values.name = updates.name;
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = @enabled");
    values.enabled = updates.enabled ? 1 : 0;
  }
  if (updates.secret !== undefined) {
    fields.push("secret = @secret");
    values.secret = updates.secret;
  }

  fields.push("updated_at = @updated_at");
  values.updated_at = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE webhooks SET ${fields.join(", ")} WHERE id = @id
  `);
  stmt.run(values);
}

/**
 * Update last used timestamp
 */
export function updateWebhookLastUsed(id: string): void {
  const db = getDatabase();
  const stmt = db.prepare("UPDATE webhooks SET last_used_at = ? WHERE id = ?");
  stmt.run(new Date().toISOString(), id);
}

/**
 * Delete a webhook
 */
export function deleteWebhook(id: string): void {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM webhooks WHERE id = ?");
  stmt.run(id);
}

/**
 * Create a webhook invocation record
 */
export function createWebhookInvocation(invocation: WebhookInvocation): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO webhook_invocations (
      id, webhook_id, payload, signature, status, batch_id,
      error_message, ip_address, user_agent, created_at, processed_at
    ) VALUES (
      @id, @webhook_id, @payload, @signature, @status, @batch_id,
      @error_message, @ip_address, @user_agent, @created_at, @processed_at
    )
  `);

  stmt.run({
    id: invocation.id,
    webhook_id: invocation.webhookId,
    payload: invocation.payload,
    signature: invocation.signature,
    status: invocation.status,
    batch_id: invocation.batchId,
    error_message: invocation.errorMessage,
    ip_address: invocation.ipAddress,
    user_agent: invocation.userAgent,
    created_at: invocation.createdAt,
    processed_at: invocation.processedAt,
  });
}

/**
 * Get invocations for a webhook
 */
export function getWebhookInvocations(webhookId: string, limit = 100): WebhookInvocation[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM webhook_invocations
    WHERE webhook_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(webhookId, limit) as DbWebhookInvocation[];

  return rows.map(mapDbInvocation);
}

/**
 * Get recent invocations (all webhooks)
 */
export function getRecentInvocations(limit = 100): WebhookInvocation[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM webhook_invocations
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as DbWebhookInvocation[];

  return rows.map(mapDbInvocation);
}

/**
 * Map database row to Webhook object
 */
function mapDbWebhook(row: DbWebhook): Webhook {
  return {
    id: row.id,
    name: row.name,
    secret: row.secret,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * Map database row to WebhookInvocation object
 */
function mapDbInvocation(row: DbWebhookInvocation): WebhookInvocation {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    payload: row.payload,
    signature: row.signature,
    status: row.status as WebhookInvocation["status"],
    batchId: row.batch_id,
    errorMessage: row.error_message,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}
