import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

// Mock dependencies
vi.mock('@agentsync/core', () => ({
  loadConfig: vi.fn(),
  getClientSecret: vi.fn(),
  TokenManager: vi.fn(),
  DataverseClient: vi.fn(),
  AgentResolver: vi.fn(),
}))

describe('GET /api/bots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return list of bots with solutions', async () => {
    const { loadConfig, getClientSecret, TokenManager, DataverseClient, AgentResolver } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 'partner-tenant', clientId: 'client-123' },
      source: { environmentUrl: 'https://source.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockReturnValue('secret-456')

    const mockListBotsWithSolutions = vi.fn().mockResolvedValue([
      {
        bot: {
          botid: 'bot-1',
          name: 'HR Support Bot',
          schemaname: 'cr_hrsupportbot',
          statecode: 0,
          createdon: '2024-01-01T00:00:00Z',
          modifiedon: '2024-01-15T10:00:00Z',
        },
        solution: {
          solutionid: 'sol-1',
          uniquename: 'HRSolution',
          friendlyname: 'HR Solution',
          version: '1.0.0',
          ismanaged: true,
        },
      },
      {
        bot: {
          botid: 'bot-2',
          name: 'IT Helpdesk Bot',
          schemaname: 'cr_ithelpdesk',
          statecode: 1,
          createdon: '2024-02-01T00:00:00Z',
          modifiedon: '2024-02-10T14:30:00Z',
        },
        solution: null,
      },
    ])

    vi.mocked(AgentResolver).mockImplementation(() => ({
      listBotsWithSolutions: mockListBotsWithSolutions,
    }) as any)

    vi.mocked(TokenManager).mockImplementation(() => ({}) as any)
    vi.mocked(DataverseClient).mockImplementation(() => ({}) as any)

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.bots).toHaveLength(2)
    expect(data.count).toBe(2)
  })

  it('should include bot metadata', async () => {
    const { loadConfig, getClientSecret, TokenManager, DataverseClient, AgentResolver } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 'tenant-1', clientId: 'client-1' },
      source: { environmentUrl: 'https://test.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockReturnValue('secret')

    vi.mocked(AgentResolver).mockImplementation(() => ({
      listBotsWithSolutions: vi.fn().mockResolvedValue([
        {
          bot: {
            botid: 'bot-123',
            name: 'Test Bot',
            schemaname: 'cr_testbot',
            statecode: 0,
            createdon: '2024-01-01T00:00:00Z',
            modifiedon: '2024-01-02T00:00:00Z',
          },
          solution: {
            solutionid: 'sol-123',
            uniquename: 'TestSolution',
            friendlyname: 'Test Solution',
            version: '2.0.0',
            ismanaged: false,
          },
        },
      ]),
    }) as any)

    vi.mocked(TokenManager).mockImplementation(() => ({}) as any)
    vi.mocked(DataverseClient).mockImplementation(() => ({}) as any)

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    const bot = data.bots[0]
    expect(bot).toHaveProperty('id')
    expect(bot).toHaveProperty('name')
    expect(bot).toHaveProperty('schemaName')
    expect(bot).toHaveProperty('status')
    expect(bot).toHaveProperty('createdOn')
    expect(bot).toHaveProperty('modifiedOn')
    expect(bot).toHaveProperty('solution')
  })

  it('should map bot status correctly', async () => {
    const { loadConfig, getClientSecret, AgentResolver } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 't', clientId: 'c' },
      source: { environmentUrl: 'https://test.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockReturnValue('s')

    vi.mocked(AgentResolver).mockImplementation(() => ({
      listBotsWithSolutions: vi.fn().mockResolvedValue([
        {
          bot: {
            botid: 'active-bot',
            name: 'Active Bot',
            schemaname: 'active',
            statecode: 0,
            createdon: '2024-01-01T00:00:00Z',
            modifiedon: '2024-01-01T00:00:00Z',
          },
          solution: null,
        },
        {
          bot: {
            botid: 'inactive-bot',
            name: 'Inactive Bot',
            schemaname: 'inactive',
            statecode: 1,
            createdon: '2024-01-01T00:00:00Z',
            modifiedon: '2024-01-01T00:00:00Z',
          },
          solution: null,
        },
      ]),
    }) as any)

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(data.bots[0].status).toBe('Active')
    expect(data.bots[1].status).toBe('Inactive')
  })

  it('should handle bots without solutions', async () => {
    const { loadConfig, getClientSecret, AgentResolver } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 't', clientId: 'c' },
      source: { environmentUrl: 'https://test.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockReturnValue('s')

    vi.mocked(AgentResolver).mockImplementation(() => ({
      listBotsWithSolutions: vi.fn().mockResolvedValue([
        {
          bot: {
            botid: 'bot-1',
            name: 'Standalone Bot',
            schemaname: 'standalone',
            statecode: 0,
            createdon: '2024-01-01T00:00:00Z',
            modifiedon: '2024-01-01T00:00:00Z',
          },
          solution: null,
        },
      ]),
    }) as any)

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(data.bots[0].solution).toBeNull()
  })

  it('should handle config load errors', async () => {
    const { loadConfig } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'))

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Config not found')
  })

  it('should handle missing client secret', async () => {
    const { loadConfig, getClientSecret } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 't', clientId: 'c' },
      source: { environmentUrl: 'https://test.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockImplementation(() => {
      throw new Error('Client secret not configured')
    })

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Client secret not configured')
  })

  it('should handle API errors', async () => {
    const { loadConfig, getClientSecret, AgentResolver } = await import('@agentsync/core')

    vi.mocked(loadConfig).mockResolvedValue({
      partner: { tenantId: 't', clientId: 'c' },
      source: { environmentUrl: 'https://test.crm.dynamics.com' },
      tenants: [],
    } as any)

    vi.mocked(getClientSecret).mockReturnValue('s')

    vi.mocked(AgentResolver).mockImplementation(() => ({
      listBotsWithSolutions: vi.fn().mockRejectedValue(new Error('API timeout')),
    }) as any)

    const request = new NextRequest('http://localhost/api/bots')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('API timeout')
  })
})
