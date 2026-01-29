/**
 * Demo Mode Middleware Helpers
 *
 * Provides utilities for handling demo mode logic consistently across API routes.
 * Reduces duplication and ensures consistent behavior.
 */

import { NextResponse } from 'next/server'
import { isDemoMode } from '@agentsync/core'

/**
 * Result type for demo/real mode handlers
 */
export type ModeHandlerResult<T> = T | NextResponse

/**
 * Wraps an API route handler with demo mode support.
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   return withDemoMode({
 *     demo: async () => {
 *       // Demo mode logic
 *       return NextResponse.json({ demoMode: true, data: mockData })
 *     },
 *     real: async () => {
 *       // Real mode logic with Redis/database
 *       return NextResponse.json({ demoMode: false, data: realData })
 *     },
 *   })
 * }
 * ```
 */
export async function withDemoMode<T extends NextResponse>({
  demo,
  real,
}: {
  demo: () => Promise<T>
  real: () => Promise<T>
}): Promise<T> {
  if (isDemoMode()) {
    return demo()
  }
  return real()
}

/**
 * Type guard to check if we're in demo mode.
 * Re-exported from core for convenience.
 */
export { isDemoMode }

/**
 * Standard error response helper
 */
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Standard not found response helper
 */
export function notFoundResponse(resource: string = 'Resource') {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}

/**
 * Standard success response with demo mode flag
 */
export function successResponse<T extends object>(data: T, demoMode: boolean = false) {
  return NextResponse.json({ demoMode, ...data })
}
