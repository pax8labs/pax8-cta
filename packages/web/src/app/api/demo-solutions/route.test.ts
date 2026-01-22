import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

// Mock dependencies
vi.mock('@agentsync/core', () => ({
  isDemoMode: vi.fn(() => true),
  DEMO_SOLUTIONS: [
    {
      uniqueName: 'hr_agent',
      friendlyName: 'HR Agent',
      version: '1.0.0',
      description: 'HR support agent',
      publisherName: 'Microsoft',
      isManaged: true,
    },
    {
      uniqueName: 'it_agent',
      friendlyName: 'IT Agent',
      version: '2.1.0',
      description: 'IT helpdesk agent',
      publisherName: 'Contoso',
      isManaged: false,
    },
    {
      uniqueName: 'sales_agent',
      friendlyName: 'Sales Agent',
      version: '1.5.0',
      description: 'Sales assistant agent',
      publisherName: 'Fabrikam',
      isManaged: true,
    },
  ],
}))

describe('GET /api/demo-solutions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return list of demo solutions', async () => {
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.solutions).toBeDefined()
    expect(Array.isArray(data.solutions)).toBe(true)
    expect(data.solutions.length).toBe(3)
  })

  it('should include demo mode flag', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.demoMode).toBe(true)
  })

  it('should include descriptive message', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.message).toContain('sample')
    expect(data.message).toContain('Copilot Studio')
  })

  it('should include all solution metadata', async () => {
    const response = await GET()
    const data = await response.json()

    const solution = data.solutions[0]
    expect(solution).toHaveProperty('id')
    expect(solution).toHaveProperty('uniqueName')
    expect(solution).toHaveProperty('friendlyName')
    expect(solution).toHaveProperty('version')
    expect(solution).toHaveProperty('description')
    expect(solution).toHaveProperty('publisherName')
    expect(solution).toHaveProperty('isManaged')
    expect(solution).toHaveProperty('fileSizeBytes')
    expect(solution).toHaveProperty('downloadUrl')
    expect(solution).toHaveProperty('createdAt')
  })

  it('should generate unique IDs for solutions', async () => {
    const response = await GET()
    const data = await response.json()

    const ids = data.solutions.map((s: any) => s.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should map solution properties correctly', async () => {
    const response = await GET()
    const data = await response.json()

    const hrAgent = data.solutions.find((s: any) => s.uniqueName === 'hr_agent')
    expect(hrAgent).toBeDefined()
    expect(hrAgent.friendlyName).toBe('HR Agent')
    expect(hrAgent.version).toBe('1.0.0')
    expect(hrAgent.description).toBe('HR support agent')
    expect(hrAgent.publisherName).toBe('Microsoft')
    expect(hrAgent.isManaged).toBe(true)
  })

  it('should include download URLs', async () => {
    const response = await GET()
    const data = await response.json()

    data.solutions.forEach((solution: any) => {
      expect(solution.downloadUrl).toContain('/api/demo-solutions/')
      expect(solution.downloadUrl).toContain(solution.uniqueName)
    })
  })

  it('should include file sizes', async () => {
    const response = await GET()
    const data = await response.json()

    data.solutions.forEach((solution: any) => {
      expect(typeof solution.fileSizeBytes).toBe('number')
      expect(solution.fileSizeBytes).toBeGreaterThan(0)
      // Should be between 1-5 MB as per implementation
      expect(solution.fileSizeBytes).toBeGreaterThan(1024 * 1024)
      expect(solution.fileSizeBytes).toBeLessThan(5 * 1024 * 1024)
    })
  })

  it('should include creation timestamps', async () => {
    const response = await GET()
    const data = await response.json()

    data.solutions.forEach((solution: any) => {
      expect(solution.createdAt).toBeDefined()
      expect(typeof solution.createdAt).toBe('string')

      // Should be valid ISO date
      const date = new Date(solution.createdAt)
      expect(date.toString()).not.toBe('Invalid Date')
    })
  })

  it('should have staggered creation dates', async () => {
    const response = await GET()
    const data = await response.json()

    const dates = data.solutions.map((s: any) => new Date(s.createdAt).getTime())

    // All dates should be different
    const uniqueDates = new Set(dates)
    expect(uniqueDates.size).toBe(dates.length)

    // Dates should be in descending order (most recent first)
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThan(dates[i + 1])
    }
  })

  it('should handle all managed status values', async () => {
    const response = await GET()
    const data = await response.json()

    const managedStates = data.solutions.map((s: any) => s.isManaged)
    expect(managedStates).toContain(true)
    expect(managedStates).toContain(false)
  })
})
