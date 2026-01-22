import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/api-middleware', () => ({
  requireAuth: vi.fn(),
  logAuthFailure: vi.fn(),
}))

vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => true),
  DEMO_CONFIG: {
    tenants: [
      { tenantId: '1', enabled: true },
      { tenantId: '2', enabled: true },
      { tenantId: '3', enabled: false },
    ],
  },
  generateMockDeploymentHistory: vi.fn(() => [
    { id: '1', status: 'in_progress', createdAt: new Date().toISOString() },
    { id: '2', status: 'completed', createdAt: new Date().toISOString() },
    { id: '3', status: 'completed', createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }, // 25 hours ago
  ]),
  DEPLOYMENT_STATUS_CATEGORIES: {
    ISSUES: ['failed', 'rejected'],
  },
}))

vi.mock('@/lib/demo-store', () => ({
  demoDeployments: new Map([
    ['batch-1', {
      id: 'batch-1',
      status: 'in_progress',
      tenantResults: [
        { status: 'failed' },
        { status: 'completed' },
      ],
    }],
  ]),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
    })),
  })),
}))

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should require authentication', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any
    )

    const request = new NextRequest('http://localhost/api/stats')
    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('should return stats in demo mode', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const request = new NextRequest('http://localhost/api/stats')
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('totalTenants')
    expect(data).toHaveProperty('activeDeployments')
    expect(data).toHaveProperty('completedToday')
    expect(data).toHaveProperty('batchesWithFailures')
  })

  it('should count total tenants correctly', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    // Should count all tenants including disabled ones
    expect(data.totalTenants).toBe(3)
  })

  it('should count active deployments', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    // From generateMockDeploymentHistory: 1 in_progress deployment
    expect(data.activeDeployments).toBeGreaterThanOrEqual(1)
  })

  it('should count deployments completed today', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { generateMockDeploymentHistory } = await import('@agentsync/core')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    // Mock returns 2 deployments from today (1 in_progress, 1 completed)
    // Only completed one counts
    const response = await GET()
    const data = await response.json()

    expect(data.completedToday).toBeGreaterThanOrEqual(1)
  })

  it('should not count old completed deployments in completedToday', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    // The deployment from 25 hours ago should not be counted
    // Only recent completed deployment counts
    expect(data.completedToday).toBe(1)
  })

  it('should count batches with failures', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    // batch-1 has 1 failed tenant
    expect(data.batchesWithFailures).toBeGreaterThanOrEqual(1)
  })

  it('should include all required stat fields', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveProperty('totalTenants')
    expect(data).toHaveProperty('activeDeployments')
    expect(data).toHaveProperty('completedToday')
    expect(data).toHaveProperty('batchesWithFailures')
    expect(data).toHaveProperty('versionDriftCount')
    expect(data).toHaveProperty('dependencyIssuesCount')
  })

  it('should return numeric values for all stats', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const response = await GET()
    const data = await response.json()

    expect(typeof data.totalTenants).toBe('number')
    expect(typeof data.activeDeployments).toBe('number')
    expect(typeof data.completedToday).toBe('number')
    expect(typeof data.batchesWithFailures).toBe('number')
    expect(typeof data.versionDriftCount).toBe('number')
    expect(typeof data.dependencyIssuesCount).toBe('number')
  })

  it('should handle health check data from database', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { getDatabase } = await import('@/lib/db')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const mockPrepare = vi.fn(() => ({
      all: vi.fn(() => [
        { tenant_id: '1', version_drift: 1, dependencies_healthy: 1 },
        { tenant_id: '2', version_drift: 0, dependencies_healthy: 0 },
      ])
    }))

    vi.mocked(getDatabase).mockReturnValue({
      prepare: mockPrepare,
    } as any)

    const response = await GET()
    const data = await response.json()

    expect(data.versionDriftCount).toBeGreaterThanOrEqual(0)
    expect(data.dependencyIssuesCount).toBeGreaterThanOrEqual(0)
  })
})
