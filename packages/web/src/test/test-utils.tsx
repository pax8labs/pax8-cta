import { ReactElement, ReactNode } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { SWRConfig } from 'swr'

// Wrapper that provides common providers for testing
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      {children}
    </SWRConfig>
  )
}

// Custom render that includes providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options })
}

// Re-export everything from testing-library
export * from '@testing-library/react'

// Override render with custom version
export { customRender as render }

// Helper to create mock fetch responses
export function mockFetchResponse<T>(data: T, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response)
}

// Helper to create mock fetch that rejects
export function mockFetchError(message: string) {
  return Promise.reject(new Error(message))
}

// Helper to wait for async operations
export function waitForNextTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

// Mock agent data factory
export function createMockAgent(overrides: Partial<import('@/types/agent').Agent> = {}): import('@/types/agent').Agent {
  return {
    id: 'agent-1',
    uniqueName: 'test_agent',
    friendlyName: 'Test Agent',
    version: '1.0.0',
    isManaged: true,
    status: 'active',
    deployedTenants: [],
    totalDeployments: 0,
    ...overrides,
  }
}

// Mock solution metadata factory
export function createMockSolutionMetadata(
  overrides: Partial<import('@/types/agent').SolutionMetadata> = {}
): import('@/types/agent').SolutionMetadata {
  return {
    uniqueName: 'test_solution',
    friendlyName: 'Test Solution',
    version: '1.0.0',
    publisherName: 'Test Publisher',
    isManaged: true,
    ...overrides,
  }
}
