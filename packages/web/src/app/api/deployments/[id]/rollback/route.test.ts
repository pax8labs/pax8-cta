import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@/lib/api-middleware', () => ({
  requireRole: vi.fn(),
  logAuthFailure: vi.fn(),
}))

vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => true),
  loadConfig: vi.fn(() => Promise.resolve({ settings: {} })),
  RollbackService: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
}))

vi.mock('@/lib/demo-store', () => ({
  demoDeployments: new Map([
    ['deployment-1', {
      id: 'deployment-1',
      status: 'completed',
      updatedAt: '2024-01-01T00:00:00Z',
    }],
    ['deployment-2', {
      id: 'deployment-2',
      status: 'in_progress',
      updatedAt: '2024-01-01T00:00:00Z',
    }],
  ]),
  demoBatches: new Map(),
  demoDeploymentsV2: [],
}))

vi.mock('@/lib/repositories/deployment-repository', () => ({
  updateBatchStatus: vi.fn(),
}))

vi.mock('@/lib/repositories/snapshot-repository', () => ({
  getSnapshot: vi.fn(),
}))

vi.mock('@/lib/repositories/audit-repository', () => ({
  logDeploymentAction: vi.fn(),
}))

describe('POST /api/deployments/[id]/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should require Admin role', async () => {
    const { requireRole } = await import('@/lib/api-middleware')

    vi.mocked(requireRole).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) as any
    )

    const request = new NextRequest('http://localhost/api/deployments/123/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) })

    expect(response.status).toBe(403)
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith('admin')
  })

  it('should return 404 when deployment not found', async () => {
    const { requireRole } = await import('@/lib/api-middleware')

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: 'admin@example.com', roles: ['admin'] }
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/999/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: '999' }) })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('not found')
  })

  it('should only allow rollback of completed or failed deployments', async () => {
    const { requireRole } = await import('@/lib/api-middleware')

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: 'admin@example.com', roles: ['admin'] }
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/deployment-2/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'deployment-2' }) })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Can only rollback completed or failed deployments')
  })

  it('should successfully initiate rollback for completed deployment', async () => {
    const { requireRole } = await import('@/lib/api-middleware')
    const { updateBatchStatus } = await import('@/lib/repositories/deployment-repository')

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: 'admin@example.com', roles: ['admin'] }
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/deployment-1/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'deployment-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toContain('Rollback initiated')
    expect(data.status).toBe('rolling_back')
    expect(vi.mocked(updateBatchStatus)).toHaveBeenCalledWith('deployment-1', 'rolling_back')
  })

  it('should update deployment status to rolling_back', async () => {
    const { requireRole } = await import('@/lib/api-middleware')
    const { demoDeployments } = await import('@/lib/demo-store')

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: 'admin@example.com', roles: ['admin'] }
    } as any)

    // Get initial status
    const deployment = demoDeployments.get('deployment-1')
    expect(deployment?.status).toBe('completed')

    const request = new NextRequest('http://localhost/api/deployments/deployment-1/rollback', {
      method: 'POST',
    })

    await POST(request, { params: Promise.resolve({ id: 'deployment-1' }) })

    // Verify status changed
    const updatedDeployment = demoDeployments.get('deployment-1')
    expect(updatedDeployment?.status).toBe('rolling_back')
    expect(updatedDeployment?.updatedAt).not.toBe('2024-01-01T00:00:00Z')
  })

  it('should handle database update errors gracefully in demo mode', async () => {
    const { requireRole } = await import('@/lib/api-middleware')
    const { updateBatchStatus } = await import('@/lib/repositories/deployment-repository')

    vi.mocked(requireRole).mockResolvedValue({
      user: { email: 'admin@example.com', roles: ['admin'] }
    } as any)

    // Mock database error
    vi.mocked(updateBatchStatus).mockImplementation(() => {
      throw new Error('Database error')
    })

    const request = new NextRequest('http://localhost/api/deployments/deployment-1/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'deployment-1' }) })

    // Should still succeed in demo mode even if database update fails
    expect(response.status).toBe(200)
  })

  it('should restrict rollback to Admin role only, not Deployer', async () => {
    const { requireRole } = await import('@/lib/api-middleware')

    vi.mocked(requireRole).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403 }) as any
    )

    const request = new NextRequest('http://localhost/api/deployments/deployment-1/rollback', {
      method: 'POST',
    })

    const response = await POST(request, { params: Promise.resolve({ id: 'deployment-1' }) })

    expect(response.status).toBe(403)
    // Verify it's checking specifically for Admin, not Deployer
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith('admin')
  })
})
