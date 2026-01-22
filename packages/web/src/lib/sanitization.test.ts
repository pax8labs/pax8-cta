import { describe, it, expect } from 'vitest'

// Test the sanitization functions from the error report route
// We'll create standalone functions that mirror the route's logic for testing

// Sanitize string fields - limit length and remove potential sensitive data
function sanitizeString(value: unknown, maxLength: number = 10000): string | undefined {
  if (typeof value !== 'string') return undefined
  let sanitized = value.slice(0, maxLength)
  sanitized = sanitized.replace(/(?:Bearer|token|api[_-]?key|password|secret)[:\s=]+[^\s"']+/gi, '[REDACTED]')
  return sanitized
}

// Sanitize context object - limit depth and remove sensitive keys
function sanitizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object') return {}

  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization', 'cookie', 'session']
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
      continue
    }
    if (typeof value === 'object' && value !== null) {
      try {
        sanitized[key] = JSON.stringify(value).slice(0, 500)
      } catch {
        sanitized[key] = '[Unable to serialize]'
      }
    } else if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 500)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

describe('sanitizeString', () => {
  it('should return undefined for non-string values', () => {
    expect(sanitizeString(123)).toBeUndefined()
    expect(sanitizeString(null)).toBeUndefined()
    expect(sanitizeString(undefined)).toBeUndefined()
    expect(sanitizeString({})).toBeUndefined()
    expect(sanitizeString([])).toBeUndefined()
  })

  it('should return string values unchanged if no sensitive data', () => {
    expect(sanitizeString('hello world')).toBe('hello world')
    expect(sanitizeString('error at line 42')).toBe('error at line 42')
  })

  it('should truncate strings to max length', () => {
    const longString = 'a'.repeat(100)
    expect(sanitizeString(longString, 50)).toBe('a'.repeat(50))
  })

  it('should redact Bearer tokens', () => {
    expect(sanitizeString('Bearer abc123xyz')).toBe('[REDACTED]')
    expect(sanitizeString('Authorization: Bearer abc123xyz')).toBe('Authorization: [REDACTED]')
    expect(sanitizeString('header Bearer eyJhbGciOiJI...')).toBe('header [REDACTED]')
  })

  it('should redact API keys', () => {
    expect(sanitizeString('api_key=sk_live_abc123')).toBe('[REDACTED]')
    expect(sanitizeString('api-key: my-secret-key')).toBe('[REDACTED]')
    expect(sanitizeString('apiKey=12345')).toBe('[REDACTED]')
  })

  it('should redact tokens', () => {
    expect(sanitizeString('token: abc123')).toBe('[REDACTED]')
    expect(sanitizeString('token=secret_token_value')).toBe('[REDACTED]')
  })

  it('should redact passwords', () => {
    expect(sanitizeString('password: myP@ssw0rd!')).toBe('[REDACTED]')
    expect(sanitizeString('password=hunter2')).toBe('[REDACTED]')
  })

  it('should redact secrets', () => {
    expect(sanitizeString('secret: my_secret_value')).toBe('[REDACTED]')
    expect(sanitizeString('client_secret=abc123')).toBe('client_[REDACTED]')
  })

  it('should handle multiple sensitive values', () => {
    const input = 'token: abc123 and password: hunter2'
    const result = sanitizeString(input)
    expect(result).toBe('[REDACTED] and [REDACTED]')
  })

  it('should be case insensitive', () => {
    expect(sanitizeString('TOKEN: abc123')).toBe('[REDACTED]')
    expect(sanitizeString('PASSWORD=secret')).toBe('[REDACTED]')
    expect(sanitizeString('Api_Key: xyz')).toBe('[REDACTED]')
  })

  it('should preserve text around redacted values', () => {
    expect(sanitizeString('Error: invalid token: abc123 at line 5')).toBe(
      'Error: invalid [REDACTED] at line 5'
    )
  })
})

describe('sanitizeContext', () => {
  it('should return empty object for null/undefined', () => {
    expect(sanitizeContext(null)).toEqual({})
    expect(sanitizeContext(undefined)).toEqual({})
  })

  it('should return empty object for non-objects', () => {
    expect(sanitizeContext('string')).toEqual({})
    expect(sanitizeContext(123)).toEqual({})
  })

  it('should pass through non-sensitive keys', () => {
    const context = {
      userId: 'user123',
      action: 'login',
      timestamp: 1234567890,
    }
    expect(sanitizeContext(context)).toEqual(context)
  })

  it('should redact password fields', () => {
    const context = {
      username: 'john',
      password: 'secret123',
    }
    expect(sanitizeContext(context)).toEqual({
      username: 'john',
      password: '[REDACTED]',
    })
  })

  it('should redact token fields', () => {
    const context = {
      accessToken: 'abc123',
      refreshToken: 'xyz789',
      userId: 'user1',
    }
    expect(sanitizeContext(context)).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      userId: 'user1',
    })
  })

  it('should redact apiKey fields', () => {
    const context = {
      apiKey: 'sk_live_abc',
      api_key: 'pk_test_xyz',
    }
    expect(sanitizeContext(context)).toEqual({
      apiKey: '[REDACTED]',
      api_key: '[REDACTED]',
    })
  })

  it('should redact authorization fields', () => {
    const context = {
      authorization: 'Bearer token123',
      authorizationHeader: 'Basic abc',
    }
    expect(sanitizeContext(context)).toEqual({
      authorization: '[REDACTED]',
      authorizationHeader: '[REDACTED]',
    })
  })

  it('should redact cookie and session fields', () => {
    const context = {
      cookie: 'session_id=abc',
      sessionId: 'sess_123',
      session: { user: 'john' },
    }
    expect(sanitizeContext(context)).toEqual({
      cookie: '[REDACTED]',
      sessionId: '[REDACTED]',
      session: '[REDACTED]',
    })
  })

  it('should truncate long string values', () => {
    const longValue = 'a'.repeat(1000)
    const context = { description: longValue }
    const result = sanitizeContext(context)
    expect((result.description as string).length).toBe(500)
  })

  it('should stringify nested objects', () => {
    const context = {
      user: { name: 'John', age: 30 },
    }
    const result = sanitizeContext(context)
    expect(result.user).toBe('{"name":"John","age":30}')
  })

  it('should truncate stringified objects', () => {
    const context = {
      largeObject: { data: 'x'.repeat(600) },
    }
    const result = sanitizeContext(context)
    expect((result.largeObject as string).length).toBe(500)
  })

  it('should handle circular references gracefully', () => {
    const circular: Record<string, unknown> = { name: 'test' }
    circular.self = circular

    const context = { data: circular }
    const result = sanitizeContext(context)
    expect(result.data).toBe('[Unable to serialize]')
  })

  it('should preserve non-string primitive values', () => {
    const context = {
      count: 42,
      enabled: true,
      ratio: 0.5,
    }
    expect(sanitizeContext(context)).toEqual(context)
  })

  it('should be case insensitive for sensitive keys', () => {
    const context = {
      PASSWORD: 'secret',
      Token: 'abc',
      API_KEY: 'xyz',
    }
    expect(sanitizeContext(context)).toEqual({
      PASSWORD: '[REDACTED]',
      Token: '[REDACTED]',
      API_KEY: '[REDACTED]',
    })
  })

  it('should redact partial matches of sensitive keys', () => {
    const context = {
      userPassword: 'secret',
      authToken: 'token123',
      myApiKey: 'key456',
    }
    expect(sanitizeContext(context)).toEqual({
      userPassword: '[REDACTED]',
      authToken: '[REDACTED]',
      myApiKey: '[REDACTED]',
    })
  })
})
