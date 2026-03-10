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
 * Webhook security utilities
 * Handles HMAC signature validation and replay attack prevention
 */

import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_HEADER = "x-webhook-signature";
const TIMESTAMP_HEADER = "x-webhook-timestamp";
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookValidationResult {
  valid: boolean;
  error?: "missing_signature" | "missing_timestamp" | "expired" | "invalid_signature";
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateWebhookSignature(
  payload: string,
  timestamp: string,
  secret: string
): string {
  const message = `${timestamp}.${payload}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(message);
  return hmac.digest("hex");
}

/**
 * Validate webhook signature and timestamp
 */
export function validateWebhookSignature(
  payload: string,
  signature: string | null,
  timestamp: string | null,
  secret: string
): WebhookValidationResult {
  // Check for required headers
  if (!signature) {
    return { valid: false, error: "missing_signature" };
  }

  if (!timestamp) {
    return { valid: false, error: "missing_timestamp" };
  }

  // Validate timestamp (prevent replay attacks)
  const timestampMs = parseInt(timestamp, 10);
  if (isNaN(timestampMs)) {
    return { valid: false, error: "expired" };
  }

  const now = Date.now();
  const age = now - timestampMs;

  if (age < 0 || age > MAX_TIMESTAMP_AGE_MS) {
    return { valid: false, error: "expired" };
  }

  // Generate expected signature
  const expectedSignature = generateWebhookSignature(payload, timestamp, secret);

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: "invalid_signature" };
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return { valid: false, error: "invalid_signature" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "invalid_signature" };
  }
}

/**
 * Extract webhook headers from request
 */
export function extractWebhookHeaders(headers: Headers): {
  signature: string | null;
  timestamp: string | null;
} {
  return {
    signature: headers.get(SIGNATURE_HEADER),
    timestamp: headers.get(TIMESTAMP_HEADER),
  };
}

/**
 * Get header names for documentation
 */
export function getWebhookHeaderNames() {
  return {
    signature: SIGNATURE_HEADER,
    timestamp: TIMESTAMP_HEADER,
  };
}
