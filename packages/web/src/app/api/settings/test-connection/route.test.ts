import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

// Mock dependencies
vi.mock('@agentsync/core', () => ({
  getSettingsService: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
  PowerPlatformAdminClient: vi.fn(),
}))

describe('POST /api/settings/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fail when credentials not configured', async () => {
    const { getSettingsService } = await import('@agentsync/core')

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: undefined,
        partnerClientId: undefined,
        partnerClientSecret: undefined,
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(false)
    expect(data.error).toContain('not fully configured')
    expect(data.results[0].step).toBe('credentials')
    expect(data.results[0].success).toBe(false)
  })

  it('should test authentication step', async () => {
    const { getSettingsService, TokenManager } = await import('@agentsync/core')

    const mockGetGraphToken = vi.fn().mockResolvedValue('mock-token')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: mockGetGraphToken,
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    const authStep = data.results.find((r: any) => r.step === 'authentication')
    expect(authStep).toBeDefined()
    expect(authStep.success).toBe(true)
    expect(authStep.message).toContain('authenticated')
  })

  it('should handle authentication failure', async () => {
    const { getSettingsService, TokenManager } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    expect(data.success).toBe(false)
    expect(data.error).toContain('Authentication failed')

    const authStep = data.results.find((r: any) => r.step === 'authentication')
    expect(authStep.success).toBe(false)
    expect(authStep.details).toContain('Invalid credentials')
  })

  it('should test Power Platform Admin API access', async () => {
    const { getSettingsService, TokenManager, PowerPlatformAdminClient } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    const mockListEnvironments = vi.fn().mockResolvedValue([
      { id: 'env-1', name: 'Env 1' },
      { id: 'env-2', name: 'Env 2' },
    ])

    vi.mocked(PowerPlatformAdminClient).mockImplementation(() => ({
      listEnvironments: mockListEnvironments,
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    const adminStep = data.results.find((r: any) => r.step === 'powerplatform_admin')
    expect(adminStep).toBeDefined()
    expect(adminStep.success).toBe(true)
    expect(adminStep.details).toContain('2 environment(s)')
  })

  it('should continue on Power Platform Admin API failure', async () => {
    const { getSettingsService, TokenManager, PowerPlatformAdminClient } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    vi.mocked(PowerPlatformAdminClient).mockImplementation(() => ({
      listEnvironments: vi.fn().mockRejectedValue(new Error('No admin access')),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    // Should still pass overall even if admin API fails
    const adminStep = data.results.find((r: any) => r.step === 'powerplatform_admin')
    expect(adminStep.success).toBe(false)
    expect(adminStep.message).toContain('not accessible')
  })

  it('should test source environment when configured', async () => {
    const { getSettingsService, TokenManager, DataverseClient } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    const mockQuerySolutions = vi.fn().mockResolvedValue([
      { id: 'sol-1', name: 'Solution 1' },
      { id: 'sol-2', name: 'Solution 2' },
    ])

    vi.mocked(DataverseClient).mockImplementation(() => ({
      querySolutions: mockQuerySolutions,
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
        sourceEnvironmentUrl: 'https://source.crm.dynamics.com',
        sourceTenantId: 'source-tenant',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    const sourceStep = data.results.find((r: any) => r.step === 'source_environment')
    expect(sourceStep).toBeDefined()
    expect(sourceStep.success).toBe(true)
    expect(sourceStep.details).toContain('2 solution(s)')
  })

  it('should skip source environment test when not configured', async () => {
    const { getSettingsService, TokenManager } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
        sourceEnvironmentUrl: undefined,
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    const sourceStep = data.results.find((r: any) => r.step === 'source_environment')
    expect(sourceStep).toBeDefined()
    expect(sourceStep.success).toBe(true)
    expect(sourceStep.message).toContain('not configured')
    expect(sourceStep.message).toContain('optional')
  })

  it('should fail overall when source environment is inaccessible', async () => {
    const { getSettingsService, TokenManager, DataverseClient } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    vi.mocked(DataverseClient).mockImplementation(() => ({
      querySolutions: vi.fn().mockRejectedValue(new Error('Access denied')),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
        sourceEnvironmentUrl: 'https://source.crm.dynamics.com',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    expect(data.success).toBe(false)

    const sourceStep = data.results.find((r: any) => r.step === 'source_environment')
    expect(sourceStep.success).toBe(false)
    expect(sourceStep.details).toContain('Access denied')
  })

  it('should record test result', async () => {
    const { getSettingsService, TokenManager } = await import('@agentsync/core')

    const mockRecordTestResult = vi.fn()

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: mockRecordTestResult,
    } as any)

    const response = await POST()
    await response.json()

    expect(mockRecordTestResult).toHaveBeenCalled()
  })

  it('should include timestamp in response', async () => {
    const { getSettingsService, TokenManager } = await import('@agentsync/core')

    vi.mocked(TokenManager).mockImplementation(() => ({
      getGraphToken: vi.fn().mockResolvedValue('token'),
    }) as any)

    vi.mocked(getSettingsService).mockReturnValue({
      getDecryptedIntegrationSettings: vi.fn().mockResolvedValue({
        partnerTenantId: 'tenant-123',
        partnerClientId: 'client-456',
        partnerClientSecret: 'secret-789',
      }),
      recordTestResult: vi.fn(),
    } as any)

    const response = await POST()
    const data = await response.json()

    expect(data.testedAt).toBeDefined()
    expect(typeof data.testedAt).toBe('string')

    // Should be valid ISO date
    const date = new Date(data.testedAt)
    expect(date.toString()).not.toBe('Invalid Date')
  })

  it('should handle unexpected errors', async () => {
    const { getSettingsService } = await import('@agentsync/core')

    vi.mocked(getSettingsService).mockImplementation(() => {
      throw new Error('Service initialization failed')
    })

    const response = await POST()
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error).toBe('Connection test failed')
  })
})
