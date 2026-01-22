import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAgentUpload, useEnvironmentBrowser } from './useAgentUpload'

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'

describe('useAgentUpload', () => {
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('file validation', () => {
    it('should reject non-zip files', async () => {
      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))

      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(toast.error).toHaveBeenCalledWith(
        'Please select a .zip file exported from Copilot Studio'
      )
      expect(result.current.selectedFile).toBeNull()
    })

    it('should accept zip files', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.0.0',
              publisherName: 'Test',
              isManaged: true,
            },
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))

      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(result.current.selectedFile).toBe(file)
      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  describe('upload flow', () => {
    it('should set uploading state during upload', async () => {
      let resolvePromise: (value: unknown) => void
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(promise)

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      act(() => {
        result.current.handleFileSelect(file)
      })

      expect(result.current.isUploading).toBe(true)

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ metadata: {} }),
        })
        await promise
      })

      expect(result.current.isUploading).toBe(false)
    })

    it('should handle upload error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Upload failed' }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(result.current.uploadError).toBe('Upload failed')
      expect(toast.error).toHaveBeenCalledWith('Upload failed')
      expect(result.current.selectedFile).toBeNull()
    })

    it('should handle network error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error')
      )

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(result.current.uploadError).toBe('Network error')
      expect(toast.error).toHaveBeenCalledWith('Network error')
    })
  })

  describe('conflict resolution', () => {
    it('should detect conflict and show options', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conflict: true,
            existingAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.0.0',
              status: 'active',
              createdAt: '2024-01-01',
            },
            newAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
            },
            metadata: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
              publisherName: 'Test',
              isManaged: true,
            },
            urlTemplates: [],
            solutionBase64: 'base64data',
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(result.current.conflict).not.toBeNull()
      expect(result.current.conflict?.existingAgent.uniqueName).toBe('test_agent')
      expect(result.current.newAgentName).toBe('test_agent_v2')
      expect(result.current.newAgentFriendlyName).toBe('Test Agent (Copy)')
    })

    it('should resolve conflict with update', async () => {
      // First call - upload returns conflict
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conflict: true,
            existingAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.0.0',
              status: 'active',
              createdAt: '2024-01-01',
            },
            newAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
            },
            metadata: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
              publisherName: 'Test',
              isManaged: true,
            },
            urlTemplates: [],
            solutionBase64: 'base64data',
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      // Second call - resolve conflict
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await act(async () => {
        await result.current.handleResolveConflict('update')
      })

      expect(global.fetch).toHaveBeenLastCalledWith(
        '/api/solutions/upload/resolve',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"update"'),
        })
      )
      expect(toast.success).toHaveBeenCalledWith('Agent updated')
      expect(mockOnSuccess).toHaveBeenCalled()
    })

    it('should resolve conflict with create', async () => {
      // First call - upload returns conflict
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conflict: true,
            existingAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.0.0',
              status: 'active',
              createdAt: '2024-01-01',
            },
            newAgent: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
            },
            metadata: {
              uniqueName: 'test_agent',
              friendlyName: 'Test Agent',
              version: '1.1.0',
              publisherName: 'Test',
              isManaged: true,
            },
            urlTemplates: [],
            solutionBase64: 'base64data',
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      // Set custom name
      act(() => {
        result.current.setNewAgentName('custom_agent')
        result.current.setNewAgentFriendlyName('Custom Agent')
      })

      // Second call - resolve conflict
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      await act(async () => {
        await result.current.handleResolveConflict('create')
      })

      const lastCallBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]?.body
      )
      expect(lastCallBody.action).toBe('create')
      expect(lastCallBody.newUniqueName).toBe('custom_agent')
      expect(lastCallBody.newFriendlyName).toBe('Custom Agent')
      expect(toast.success).toHaveBeenCalledWith('Agent created')
    })
  })

  describe('drag and drop', () => {
    it('should handle drag over', () => {
      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))

      const event = {
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent

      act(() => {
        result.current.handleDragOver(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(result.current.isDragging).toBe(true)
    })

    it('should handle drag leave', () => {
      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))

      // First set dragging
      const overEvent = {
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent

      act(() => {
        result.current.handleDragOver(overEvent)
      })

      expect(result.current.isDragging).toBe(true)

      act(() => {
        result.current.handleDragLeave()
      })

      expect(result.current.isDragging).toBe(false)
    })

    it('should handle drop', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            metadata: {
              uniqueName: 'dropped_agent',
              friendlyName: 'Dropped Agent',
              version: '1.0.0',
              publisherName: 'Test',
              isManaged: true,
            },
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))

      const file = new File(['content'], 'solution.zip', {
        type: 'application/zip',
      })
      const event = {
        preventDefault: vi.fn(),
        dataTransfer: {
          files: [file],
        },
      } as unknown as React.DragEvent

      await act(async () => {
        result.current.handleDrop(event)
      })

      expect(event.preventDefault).toHaveBeenCalled()
      expect(result.current.isDragging).toBe(false)
      expect(result.current.metadata?.uniqueName).toBe('dropped_agent')
    })
  })

  describe('reset', () => {
    it('should reset all state', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            conflict: true,
            existingAgent: { uniqueName: 'test', friendlyName: 'Test', version: '1.0', status: 'active', createdAt: '2024-01-01' },
            newAgent: { uniqueName: 'test', friendlyName: 'Test', version: '1.1' },
            metadata: { uniqueName: 'test', friendlyName: 'Test', version: '1.1', publisherName: 'P', isManaged: true },
            urlTemplates: [],
            solutionBase64: 'data',
          }),
      })

      const { result } = renderHook(() => useAgentUpload(mockOnSuccess))
      const file = new File(['content'], 'solution.zip', { type: 'application/zip' })

      await act(async () => {
        await result.current.handleFileSelect(file)
      })

      expect(result.current.conflict).not.toBeNull()

      act(() => {
        result.current.reset()
      })

      expect(result.current.selectedFile).toBeNull()
      expect(result.current.metadata).toBeNull()
      expect(result.current.uploadError).toBeNull()
      expect(result.current.conflict).toBeNull()
      expect(result.current.newAgentName).toBe('')
      expect(result.current.newAgentFriendlyName).toBe('')
    })
  })
})

describe('useEnvironmentBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('loading environments', () => {
    it('should load environments and auto-select default', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            environments: [
              { id: 'env1', displayName: 'Dev', environmentUrl: 'https://dev.crm.dynamics.com', type: 'dev', isDefault: false },
              { id: 'env2', displayName: 'Prod', environmentUrl: 'https://prod.crm.dynamics.com', type: 'prod', isDefault: true },
            ],
          }),
      })

      const { result } = renderHook(() => useEnvironmentBrowser())

      await act(async () => {
        await result.current.loadEnvironments()
      })

      expect(result.current.environments).toHaveLength(2)
      expect(result.current.selectedEnvironment).toBe('https://prod.crm.dynamics.com')
    })

    it('should select first environment if no default', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            environments: [
              { id: 'env1', displayName: 'Dev', environmentUrl: 'https://dev.crm.dynamics.com', type: 'dev' },
              { id: 'env2', displayName: 'Prod', environmentUrl: 'https://prod.crm.dynamics.com', type: 'prod' },
            ],
          }),
      })

      const { result } = renderHook(() => useEnvironmentBrowser())

      await act(async () => {
        await result.current.loadEnvironments()
      })

      expect(result.current.selectedEnvironment).toBe('https://dev.crm.dynamics.com')
    })

    it('should handle environment loading error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to load')
      )

      const { result } = renderHook(() => useEnvironmentBrowser())

      await act(async () => {
        await result.current.loadEnvironments()
      })

      expect(toast.error).toHaveBeenCalledWith('Failed to load environments')
    })
  })

  describe('loading solutions', () => {
    it('should load solutions for selected environment', async () => {
      const { result } = renderHook(() => useEnvironmentBrowser())

      // Set selected environment first
      act(() => {
        result.current.setSelectedEnvironment('https://env.crm.dynamics.com')
      })

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            solutions: [
              { name: 'Agent1', uniqueName: 'agent1', version: '1.0.0', publisherId: 'pub1', installedOn: '2024-01-01', isManaged: true },
              { name: 'Agent2', uniqueName: 'agent2', version: '2.0.0', publisherId: 'pub2', installedOn: '2024-01-02', isManaged: false },
            ],
            sourceEnvironment: 'https://env.crm.dynamics.com',
          }),
      })

      await act(async () => {
        await result.current.loadSolutions()
      })

      expect(result.current.solutions).toHaveLength(2)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('environmentUrl=https%3A%2F%2Fenv.crm.dynamics.com')
      )
    })

    it('should include botsOnly param when showAgentsOnly is true', async () => {
      const { result } = renderHook(() => useEnvironmentBrowser())

      act(() => {
        result.current.setSelectedEnvironment('https://env.crm.dynamics.com')
      })

      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ solutions: [], sourceEnvironment: '' }),
      })

      await act(async () => {
        await result.current.loadSolutions()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('botsOnly=true')
      )
    })

    it('should not load without selected environment', async () => {
      const { result } = renderHook(() => useEnvironmentBrowser())

      await act(async () => {
        await result.current.loadSolutions()
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('importing solutions', () => {
    it('should import solution successfully', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useEnvironmentBrowser())
      const mockOnSuccess = vi.fn()

      const solution = {
        name: 'Test Agent',
        uniqueName: 'test_agent',
        version: '1.0.0',
        publisherId: 'pub1',
        installedOn: '2024-01-01',
        isManaged: true,
      }

      await act(async () => {
        await result.current.importSolution(solution, mockOnSuccess)
      })

      expect(toast.success).toHaveBeenCalledWith('Imported Test Agent')
      expect(mockOnSuccess).toHaveBeenCalled()
    })

    it('should handle import error', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Import failed' }),
      })

      const { result } = renderHook(() => useEnvironmentBrowser())
      const mockOnSuccess = vi.fn()

      const solution = {
        name: 'Test Agent',
        uniqueName: 'test_agent',
        version: '1.0.0',
        publisherId: 'pub1',
        installedOn: '2024-01-01',
        isManaged: true,
      }

      await act(async () => {
        await result.current.importSolution(solution, mockOnSuccess)
      })

      expect(toast.error).toHaveBeenCalledWith('Import failed')
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })

    it('should track importing state', async () => {
      let resolvePromise: (value: unknown) => void
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })

      ;(global.fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(promise)

      const { result } = renderHook(() => useEnvironmentBrowser())

      const solution = {
        name: 'Test',
        uniqueName: 'test',
        version: '1.0.0',
        publisherId: 'pub1',
        installedOn: '2024-01-01',
        isManaged: true,
      }

      act(() => {
        result.current.importSolution(solution, vi.fn())
      })

      expect(result.current.importingId).toBe('test')

      await act(async () => {
        resolvePromise!({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
        await promise
      })

      expect(result.current.importingId).toBeNull()
    })
  })
})
