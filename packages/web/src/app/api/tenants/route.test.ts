import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/api-middleware', () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
  logAuthFailure: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  apiRateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}))

vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(),
  DEMO_CONFIG: {
    partner: {
      tenantId: 'partner-123',
      clientId: 'client-456',
    },
    source: 'demo',
    tenants: [
      {
        name: 'Contoso Corporation',
        tenantId: '11111111-1111-1111-1111-111111111111',
        environmentUrl: 'https://contoso.crm.dynamics.com',
        tags: ['production'],
        enabled: true,
        metadata: { tier: 'premium' },
      },
      {
        name: 'Fabrikam Inc',
        tenantId: '22222222-2222-2222-2222-222222222222',
        environmentUrl: 'https://fabrikam.crm.dynamics.com',
        tags: ['test'],
        enabled: true,
        metadata: {},
      },
    ],
  },
  TenantDiscoveryService: vi.fn(),
  getEffectiveIntegrationSettings: vi.fn(),
}))

vi.mock('@/lib/demo-store', () => ({
  demoDeployedAgents: new Map([
    ['11111111-1111-1111-1111-111111111111', [
      { solutionName: 'Agent1', version: '1.0.0', status: 'active' }
    ]],
  ]),
  demoTenantStatus: new Map(),
  initializeDemoAgents: vi.fn(),
}))

describe('GET /api/tenants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should require authentication', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any
    )

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(vi.mocked(requireAuth)).toHaveBeenCalled()
  })

  it('should enforce rate limiting', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit, createRateLimitResponse } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 60000,
    })

    vi.mocked(createRateLimitResponse).mockReturnValue(
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }) as any
    )

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)

    expect(response.status).toBe(429)
    expect(vi.mocked(apiRateLimit)).toHaveBeenCalledWith(request, 'user@example.com')
  })

  it('should return demo tenants in demo mode', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')
    const { isDemoMode } = await import('@agentsync/core')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    vi.mocked(isDemoMode).mockReturnValue(true)

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.demoMode).toBe(true)
    expect(data.discoveryMode).toBe(false)
    expect(data.tenants).toBeDefined()
    expect(Array.isArray(data.tenants)).toBe(true)
  })

  it('should include partner configuration in response', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    expect(data.partner).toBeDefined()
    expect(data.partner).toHaveProperty('tenantId')
    expect(data.partner).toHaveProperty('clientId')
  })

  it('should include tenant metadata fields', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    const tenant = data.tenants[0]

    expect(tenant).toHaveProperty('name')
    expect(tenant).toHaveProperty('tenantId')
    expect(tenant).toHaveProperty('environmentUrl')
    expect(tenant).toHaveProperty('tags')
    expect(tenant).toHaveProperty('enabled')
    expect(tenant).toHaveProperty('metadata')
    expect(tenant).toHaveProperty('deployedAgents')
  })

  it('should return correct tenant count', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    expect(data.tenants.length).toBe(2)
  })

  it('should include deployed agents for tenants', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    // First tenant should have deployed agents
    const firstTenant = data.tenants[0]
    expect(firstTenant.deployedAgents).toBeDefined()
    expect(Array.isArray(firstTenant.deployedAgents)).toBe(true)
    expect(firstTenant.deployedAgents.length).toBeGreaterThan(0)
  })

  it('should return empty deployedAgents array when none exist', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    // Second tenant should have empty deployed agents
    const secondTenant = data.tenants[1]
    expect(secondTenant.deployedAgents).toEqual([])
  })

  it('should initialize demo agents before returning data', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')
    const { initializeDemoAgents } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    await GET(request)

    expect(vi.mocked(initializeDemoAgents)).toHaveBeenCalled()
  })

  it('should include tenant tags', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    const firstTenant = data.tenants[0]
    expect(firstTenant.tags).toEqual(['production'])
  })

  it('should include source information', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { apiRateLimit } = await import('@/lib/rate-limit')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(apiRateLimit).mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })

    const request = new NextRequest('http://localhost/api/tenants')
    const response = await GET(request)
    const data = await response.json()

    expect(data.source).toBe('demo')
  })
})
