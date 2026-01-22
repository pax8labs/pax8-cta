import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/api-middleware', () => ({
  requireRoles: vi.fn(),
  logAuthFailure: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  deploymentRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}))

vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => false),
  loadConfig: vi.fn(),
  DEMO_TENANTS: [],
}))

describe('POST /api/deployments/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('File Validation', () => {
    it('should reject requests without a solution file', async () => {
      const { requireRoles } = await import('@/lib/api-middleware')
      const { deploymentRateLimit } = await import('@/lib/rate-limit')

      // Mock auth and rate limit passing
      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: 'test', email: 'test@example.com', roles: ['admin'] }
      } as any)
      vi.mocked(deploymentRateLimit).mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 60000 })

      // Create form data without solution file
      const formData = new FormData()
      formData.append('tenantIds', JSON.stringify(['tenant-1']))

      const request = new NextRequest('http://localhost/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Solution file is required')
    })

    it('should reject files that are too large', async () => {
      const { requireRoles } = await import('@/lib/api-middleware')
      const { deploymentRateLimit } = await import('@/lib/rate-limit')

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: 'test', email: 'test@example.com', roles: ['admin'] }
      } as any)
      vi.mocked(deploymentRateLimit).mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 60000 })

      // Create a file larger than 100MB
      const largeFile = new File(
        [new ArrayBuffer(101 * 1024 * 1024)], // 101MB
        'large-solution.zip',
        { type: 'application/zip' }
      )

      const formData = new FormData()
      formData.append('solution', largeFile)
      formData.append('tenantIds', JSON.stringify(['tenant-1']))

      const request = new NextRequest('http://localhost/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('File too large')
    })

    it('should reject files with invalid extensions', async () => {
      const { requireRoles } = await import('@/lib/api-middleware')
      const { deploymentRateLimit } = await import('@/lib/rate-limit')

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: 'test', email: 'test@example.com', roles: ['admin'] }
      } as any)
      vi.mocked(deploymentRateLimit).mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 60000 })

      // Create a file with wrong extension
      const invalidFile = new File(
        ['test content'],
        'malicious.exe',
        { type: 'application/octet-stream' }
      )

      const formData = new FormData()
      formData.append('solution', invalidFile)
      formData.append('tenantIds', JSON.stringify(['tenant-1']))

      const request = new NextRequest('http://localhost/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid file extension')
      expect(data.allowedExtensions).toContain('.zip')
    })

    it('should accept valid ZIP files within size limits', async () => {
      const { requireRoles } = await import('@/lib/api-middleware')
      const { deploymentRateLimit } = await import('@/lib/rate-limit')
      const { isDemoMode } = await import('@agentsync/core')

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: 'test', email: 'test@example.com', roles: ['admin'] }
      } as any)
      vi.mocked(deploymentRateLimit).mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 60000 })
      vi.mocked(isDemoMode).mockReturnValue(true) // Use demo mode to avoid file system operations

      // Create a valid ZIP file
      const validFile = new File(
        [new ArrayBuffer(1024 * 1024)], // 1MB
        'valid-solution_managed.zip',
        { type: 'application/zip' }
      )

      const formData = new FormData()
      formData.append('solution', validFile)
      formData.append('tenantIds', JSON.stringify(['11111111-1111-1111-1111-111111111111']))

      const request = new NextRequest('http://localhost/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)

      // In demo mode, should create deployment successfully
      expect(response.status).toBe(200)
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const { requireRoles } = await import('@/lib/api-middleware')
      const { deploymentRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')

      vi.mocked(requireRoles).mockResolvedValue({
        user: { id: 'test', email: 'test@example.com', roles: ['admin'] }
      } as any)
      vi.mocked(deploymentRateLimit).mockResolvedValue({
        success: false,
        remaining: 0,
        reset: Date.now() + 60000
      })
      vi.mocked(createRateLimitResponse).mockReturnValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }) as any
      )

      const validFile = new File(['test'], 'test.zip', { type: 'application/zip' })
      const formData = new FormData()
      formData.append('solution', validFile)
      formData.append('tenantIds', JSON.stringify(['tenant-1']))

      const request = new NextRequest('http://localhost/api/deployments/create', {
        method: 'POST',
        body: formData,
      })

      const response = await POST(request)

      expect(response.status).toBe(429)
    })
  })
})
