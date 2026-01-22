import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
  HealthCheckService: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(),
}))

describe('GET /api/tenants/[id]/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return unknown status when no health check has been run', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health')
    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('unknown')
    expect(data.message).toContain('No health check')
    expect(data.lastCheck).toBeNull()
  })

  it('should return last health check result', async () => {
    const { getDatabase } = await import('@/lib/db')

    const mockResult = {
      healthy: 1,
      checks: JSON.stringify([{ name: 'test', passed: true }]),
      total_duration_ms: 500,
      checked_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(mockResult),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health')
    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('healthy')
    expect(data.healthy).toBe(true)
    expect(data.checks).toBeDefined()
    expect(data.totalDurationMs).toBe(500)
    expect(data.lastCheck).toBe('2024-01-01T00:00:00Z')
  })

  it('should return unhealthy status', async () => {
    const { getDatabase } = await import('@/lib/db')

    const mockResult = {
      healthy: 0,
      checks: JSON.stringify([{ name: 'test', passed: false }]),
      total_duration_ms: 300,
      checked_at: '2024-01-01T00:00:00Z',
    }

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(mockResult),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health')
    const response = await GET(request, { params })
    const data = await response.json()

    expect(data.status).toBe('unhealthy')
    expect(data.healthy).toBe(false)
  })

  it('should handle database errors gracefully', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockImplementation(() => {
      throw new Error('Database not initialized')
    })

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health')
    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to get health check status')
  })
})

describe('POST /api/tenants/[id]/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 404 for unknown tenant in demo mode', async () => {
    const params = Promise.resolve({ id: 'nonexistent-tenant' })
    const request = new NextRequest('http://localhost/api/tenants/nonexistent-tenant/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Tenant not found')
  })

  it('should run health check in demo mode', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.demoMode).toBe(true)
    expect(data.tenantId).toBe('11111111-1111-1111-1111-111111111111')
    expect(data.tenantName).toBeDefined()
    expect(data.checks).toBeDefined()
    expect(Array.isArray(data.checks)).toBe(true)
    expect(data.totalDurationMs).toBeGreaterThan(0)
  })

  it('should include health check results', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(data.checks.length).toBeGreaterThan(0)

    const check = data.checks[0]
    expect(check).toHaveProperty('name')
    expect(check).toHaveProperty('passed')
    expect(check).toHaveProperty('message')
    expect(check).toHaveProperty('durationMs')
  })

  it('should aggregate check results correctly', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    // healthy should be true only if all checks passed
    const allPassed = data.checks.every((c: any) => c.passed)
    expect(data.healthy).toBe(allPassed)
  })

  it('should save health check result to database', async () => {
    const { getDatabase } = await import('@/lib/db')

    const mockRun = vi.fn()

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        run: mockRun,
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    await POST(request, { params })

    expect(mockRun).toHaveBeenCalled()
  })

  it('should handle database save errors gracefully', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockImplementation(() => {
      throw new Error('Database not initialized')
    })

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    // Should still return 200 even if database save fails
    expect(response.status).toBe(200)
    expect(data.healthy).toBeDefined()
  })

  it('should return 500 for missing config in non-demo mode', async () => {
    const { isDemoMode, loadConfig } = await import('@agentsync/core')

    vi.mocked(isDemoMode).mockReturnValue(false)
    vi.mocked(loadConfig).mockResolvedValue(null as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Configuration not found')
  })

  it('should return 404 for tenant not in config in non-demo mode', async () => {
    const { isDemoMode, loadConfig } = await import('@agentsync/core')

    vi.mocked(isDemoMode).mockReturnValue(false)
    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [
        { tenantId: '22222222-2222-2222-2222-222222222222', name: 'Other Tenant' },
      ],
      partner: { clientId: 'client', tenantId: 'partner-tenant' },
      settings: {},
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('not found in configuration')
  })

  it('should require client secret in non-demo mode', async () => {
    const { isDemoMode, loadConfig } = await import('@agentsync/core')

    vi.mocked(isDemoMode).mockReturnValue(false)
    vi.mocked(loadConfig).mockResolvedValue({
      tenants: [
        { tenantId: '11111111-1111-1111-1111-111111111111', name: 'Test Tenant', environmentUrl: 'https://test.crm.dynamics.com' },
      ],
      partner: { clientId: 'client', tenantId: 'partner-tenant' },
      settings: {},
    } as any)

    // Clear the environment variable
    delete process.env.AZURE_CLIENT_SECRET

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('AZURE_CLIENT_SECRET')
  })

  it('should include timestamp in response', async () => {
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(getDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
      }),
    } as any)

    const params = Promise.resolve({ id: '11111111-1111-1111-1111-111111111111' })
    const request = new NextRequest('http://localhost/api/tenants/11111111-1111-1111-1111-111111111111/health', {
      method: 'POST',
    })
    const response = await POST(request, { params })
    const data = await response.json()

    expect(data.checkedAt).toBeDefined()
    expect(typeof data.checkedAt).toBe('string')

    // Should be valid ISO date
    const date = new Date(data.checkedAt)
    expect(date.toString()).not.toBe('Invalid Date')
  })
})
