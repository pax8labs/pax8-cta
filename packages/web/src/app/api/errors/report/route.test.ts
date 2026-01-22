import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET } from './route'
import { NextRequest } from 'next/server'

// Mock the github-issue-reporter module
vi.mock('@/lib/github-issue-reporter', () => ({
  reportErrorToGitHub: vi.fn(),
  isGitHubReportingEnabled: vi.fn(),
}))

import { reportErrorToGitHub, isGitHubReportingEnabled } from '@/lib/github-issue-reporter'

const mockReportErrorToGitHub = reportErrorToGitHub as ReturnType<typeof vi.fn>
const mockIsGitHubReportingEnabled = isGitHubReportingEnabled as ReturnType<typeof vi.fn>

function createMockRequest(body: unknown, options: { contentLength?: string } = {}): NextRequest {
  const headers = new Headers({
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 Test Browser',
  })
  if (options.contentLength) {
    headers.set('content-length', options.contentLength)
  }

  return {
    headers,
    json: async () => body,
  } as unknown as NextRequest
}

describe('POST /api/errors/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGitHubReportingEnabled.mockReturnValue(true)
    mockReportErrorToGitHub.mockResolvedValue({
      success: true,
      issueUrl: 'https://github.com/test/repo/issues/123',
      issueNumber: 123,
    })
  })

  describe('request validation', () => {
    it('should reject requests that are too large', async () => {
      const request = createMockRequest({}, { contentLength: '200000' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(413)
      expect(data.error).toBe('Request body too large')
    })

    it('should reject invalid JSON', async () => {
      const request = {
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => { throw new Error('Invalid JSON') },
      } as unknown as NextRequest

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid JSON body')
    })

    it('should require error or errorMessage field', async () => {
      const request = createMockRequest({ context: { page: '/test' } })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Missing or invalid required field')
    })

    it('should accept errorMessage field', async () => {
      const request = createMockRequest({ errorMessage: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should accept error field', async () => {
      const request = createMockRequest({ error: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('sanitization', () => {
    it('should sanitize sensitive data from error message', async () => {
      const request = createMockRequest({
        errorMessage: 'Error: Bearer token123 was rejected',
      })

      await POST(request)

      expect(mockReportErrorToGitHub).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('[REDACTED]'),
        })
      )
    })

    it('should redact sensitive keys from context', async () => {
      const request = createMockRequest({
        errorMessage: 'Test error',
        context: {
          password: 'secret123',
          apiKey: 'key456',
          normalData: 'visible',
        },
      })

      await POST(request)

      expect(mockReportErrorToGitHub).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            password: '[REDACTED]',
            apiKey: '[REDACTED]',
            normalData: 'visible',
          }),
        })
      )
    })

    it('should truncate long strings', async () => {
      const longError = 'a'.repeat(2000)
      const request = createMockRequest({
        errorMessage: longError,
      })

      await POST(request)

      expect(mockReportErrorToGitHub).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      )
      const call = mockReportErrorToGitHub.mock.calls[0][0]
      expect(call.error.length).toBeLessThanOrEqual(1000)
    })
  })

  describe('source validation', () => {
    it('should accept valid source values', async () => {
      const request = createMockRequest({
        errorMessage: 'Test error',
        source: 'error_boundary',
      })

      await POST(request)

      expect(mockReportErrorToGitHub).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'error_boundary',
        })
      )
    })

    it('should default to global_error for invalid source', async () => {
      const request = createMockRequest({
        errorMessage: 'Test error',
        source: 'invalid_source',
      })

      await POST(request)

      expect(mockReportErrorToGitHub).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'global_error',
        })
      )
    })
  })

  describe('GitHub reporting', () => {
    it('should not report to GitHub when not enabled', async () => {
      mockIsGitHubReportingEnabled.mockReturnValue(false)
      const request = createMockRequest({ errorMessage: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.reported).toBe(false)
      expect(data.message).toContain('not configured')
      expect(mockReportErrorToGitHub).not.toHaveBeenCalled()
    })

    it('should return issue URL on successful report', async () => {
      const request = createMockRequest({ errorMessage: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.issueUrl).toBe('https://github.com/test/repo/issues/123')
      expect(data.issueNumber).toBe(123)
    })

    it('should handle deduplicated errors', async () => {
      mockReportErrorToGitHub.mockResolvedValue({
        success: false,
        deduplicated: true,
      })
      const request = createMockRequest({ errorMessage: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.deduplicated).toBe(true)
    })

    it('should handle rate limiting', async () => {
      mockReportErrorToGitHub.mockResolvedValue({
        success: false,
        rateLimited: true,
      })
      const request = createMockRequest({ errorMessage: 'Test error' })

      const response = await POST(request)
      const data = await response.json()

      expect(data.success).toBe(false)
      expect(data.rateLimited).toBe(true)
    })
  })
})

describe('GET /api/errors/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return enabled status when configured', async () => {
    mockIsGitHubReportingEnabled.mockReturnValue(true)

    const response = await GET()
    const data = await response.json()

    expect(data.enabled).toBe(true)
    expect(data.message).toContain('configured')
  })

  it('should return disabled status with instructions when not configured', async () => {
    mockIsGitHubReportingEnabled.mockReturnValue(false)

    const response = await GET()
    const data = await response.json()

    expect(data.enabled).toBe(false)
    expect(data.message).toContain('GITHUB_ISSUE_TOKEN')
  })
})
