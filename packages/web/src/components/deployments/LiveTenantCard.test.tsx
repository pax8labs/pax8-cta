import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LiveTenantCard } from './LiveTenantCard'
import { TenantProgress, STEP_ORDER } from './types'

const createMockTenant = (overrides: Partial<TenantProgress> = {}): TenantProgress => ({
  tenantId: 'tenant-123',
  tenantName: 'Test Tenant',
  status: 'in_progress',
  currentStep: 'importing',
  steps: STEP_ORDER.reduce((acc, step) => ({
    ...acc,
    [step]: { status: 'pending' }
  }), {} as TenantProgress['steps']),
  ...overrides,
})

describe('LiveTenantCard', () => {
  it('should render tenant name', () => {
    const tenant = createMockTenant()
    render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

    expect(screen.getByText('Test Tenant')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const onClick = vi.fn()
    const tenant = createMockTenant()
    render(<LiveTenantCard tenant={tenant} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  describe('in_progress status', () => {
    it('should show current step when in progress', () => {
      const tenant = createMockTenant({ status: 'in_progress', currentStep: 'importing' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByText(/Importing.../)).toBeInTheDocument()
    })

    it('should show blue progress bar', () => {
      const tenant = createMockTenant({ status: 'in_progress' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      const progressBar = document.querySelector('.bg-blue-500')
      expect(progressBar).toBeInTheDocument()
    })

    it('should have blue border', () => {
      const tenant = createMockTenant({ status: 'in_progress' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByRole('button')).toHaveClass('border-blue-300')
    })
  })

  describe('completed status', () => {
    it('should show 100% progress when completed', () => {
      const tenant = createMockTenant({ status: 'completed' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('should show green progress bar', () => {
      const tenant = createMockTenant({ status: 'completed' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      const progressBar = document.querySelector('.bg-emerald-500')
      expect(progressBar).toBeInTheDocument()
    })

    it('should have green border', () => {
      const tenant = createMockTenant({ status: 'completed' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByRole('button')).toHaveClass('border-emerald-200')
    })

    it('should show duration when completed', () => {
      const startedAt = new Date(Date.now() - 120000).toISOString() // 2 minutes ago
      const completedAt = new Date().toISOString()
      const tenant = createMockTenant({
        status: 'completed',
        startedAt,
        completedAt
      })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByText('2m')).toBeInTheDocument()
    })
  })

  describe('failed status', () => {
    it('should show error message when failed', () => {
      const tenant = createMockTenant({
        status: 'failed',
        error: 'Connection timeout'
      })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByText('Connection timeout')).toBeInTheDocument()
    })

    it('should show red progress bar', () => {
      const tenant = createMockTenant({ status: 'failed' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      const progressBar = document.querySelector('.bg-rose-500')
      expect(progressBar).toBeInTheDocument()
    })

    it('should have red border', () => {
      const tenant = createMockTenant({ status: 'failed' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByRole('button')).toHaveClass('border-rose-200')
    })
  })

  describe('progress calculation', () => {
    it('should calculate progress based on completed steps', () => {
      const tenant = createMockTenant({
        status: 'in_progress',
        steps: {
          authenticating: { status: 'completed' },
          validating: { status: 'completed' },
          exporting: { status: 'completed' },
          uploading: { status: 'completed' },
          importing: { status: 'in_progress' },
          configuring: { status: 'pending' },
          verifying: { status: 'pending' },
          completing: { status: 'pending' },
        }
      })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      // 4 out of 8 steps = 50%
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('should show 0% when no steps completed', () => {
      const tenant = createMockTenant({
        status: 'in_progress',
      })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByText('0%')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have accessible label', () => {
      const tenant = createMockTenant({ tenantName: 'Acme Corp' })
      render(<LiveTenantCard tenant={tenant} onClick={vi.fn()} />)

      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'View details for Acme Corp')
    })
  })
})
