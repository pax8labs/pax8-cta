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
}))

vi.mock('@/lib/demo-store', () => ({
  resolveDeployment: vi.fn(),
}))

vi.mock('@agentsync/worker', () => ({
  DeploymentQueueManager: vi.fn(),
}))

describe('GET /api/deployments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should require authentication', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')

    vi.mocked(requireAuth).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any
    )

    const request = new NextRequest('http://localhost/api/deployments/123')
    const response = await GET(request, { params: { id: '123' } })

    expect(response.status).toBe(401)
  })

  it('should return 404 when deployment not found', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(resolveDeployment).mockReturnValue(null)

    const request = new NextRequest('http://localhost/api/deployments/nonexistent')
    const response = await GET(request, { params: { id: 'nonexistent' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toContain('not found')
  })

  it('should return deployment details when found', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const mockDeployment = {
      id: 'deploy-123',
      solutionName: 'TestAgent',
      status: 'completed',
      createdAt: '2024-01-01T00:00:00Z',
      tenantResults: [
        { tenantId: 'tenant-1', status: 'completed' },
      ],
    }

    vi.mocked(resolveDeployment).mockReturnValue(mockDeployment as any)

    const request = new NextRequest('http://localhost/api/deployments/deploy-123')
    const response = await GET(request, { params: { id: 'deploy-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.demoMode).toBe(true)
    expect(data.id).toBe('deploy-123')
    expect(data.solutionName).toBe('TestAgent')
    expect(data.status).toBe('completed')
  })

  it('should include full deployment details', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    const mockDeployment = {
      id: 'deploy-123',
      solutionName: 'TestAgent',
      solutionVersion: '1.0.0',
      status: 'in_progress',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T01:00:00Z',
      tenantResults: [
        {
          tenantId: 'tenant-1',
          tenantName: 'Contoso',
          status: 'completed',
          startTime: '2024-01-01T00:30:00Z',
          endTime: '2024-01-01T00:45:00Z',
        },
        {
          tenantId: 'tenant-2',
          tenantName: 'Fabrikam',
          status: 'in_progress',
          startTime: '2024-01-01T00:50:00Z',
        },
      ],
    }

    vi.mocked(resolveDeployment).mockReturnValue(mockDeployment as any)

    const request = new NextRequest('http://localhost/api/deployments/deploy-123')
    const response = await GET(request, { params: { id: 'deploy-123' } })
    const data = await response.json()

    expect(data.tenantResults).toBeDefined()
    expect(data.tenantResults.length).toBe(2)
    expect(data.solutionVersion).toBe('1.0.0')
    expect(data.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('should call resolveDeployment with correct ID', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(resolveDeployment).mockReturnValue({
      id: 'test-deployment',
      status: 'completed',
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/test-deployment')
    await GET(request, { params: { id: 'test-deployment' } })

    expect(vi.mocked(resolveDeployment)).toHaveBeenCalledWith('test-deployment')
  })

  it('should include demoMode flag', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(resolveDeployment).mockReturnValue({
      id: 'deploy-123',
      status: 'completed',
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/deploy-123')
    const response = await GET(request, { params: { id: 'deploy-123' } })
    const data = await response.json()

    expect(data).toHaveProperty('demoMode')
    expect(data.demoMode).toBe(true)
  })

  it('should handle deployment with no tenant results', async () => {
    const { requireAuth } = await import('@/lib/api-middleware')
    const { resolveDeployment } = await import('@/lib/demo-store')

    vi.mocked(requireAuth).mockResolvedValue({
      user: { id: '1', email: 'user@example.com', roles: ['viewer'] }
    } as any)

    vi.mocked(resolveDeployment).mockReturnValue({
      id: 'deploy-123',
      solutionName: 'TestAgent',
      status: 'pending',
      createdAt: '2024-01-01T00:00:00Z',
      tenantResults: [],
    } as any)

    const request = new NextRequest('http://localhost/api/deployments/deploy-123')
    const response = await GET(request, { params: { id: 'deploy-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.tenantResults).toEqual([])
  })
})
