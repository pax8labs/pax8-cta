import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeploymentCard } from './DeploymentCard'
import type { DeploymentJob } from '@agentsync/core'

const createMockDeployment = (overrides: Partial<DeploymentJob> = {}): DeploymentJob => ({
  id: 'deploy-123',
  solutionName: 'Test Agent',
  solutionVersion: '1.0.0',
  solutionId: 'solution-1',
  status: 'in_progress',
  totalTenants: 10,
  completedTenants: 5,
  failedTenants: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: 'user-1',
  ...overrides,
})

describe('DeploymentCard', () => {
  describe('rendering', () => {
    it('should render solution name and version', () => {
      const deployment = createMockDeployment()
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('Test Agent')).toBeInTheDocument()
      expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    })

    it('should render deployment ID (truncated)', () => {
      const deployment = createMockDeployment({ id: 'deploy-12345678' })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('deploy-1')).toBeInTheDocument()
    })

    it('should render tenant progress', () => {
      const deployment = createMockDeployment({
        completedTenants: 5,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText(/tenants/)).toBeInTheDocument()
    })
  })

  describe('status badges', () => {
    it.each([
      ['pending', 'Pending'],
      ['scheduled', 'Scheduled'],
      ['awaiting_approval', 'Awaiting Approval'],
      ['approved', 'Approved'],
      ['rejected', 'Rejected'],
      ['in_progress', 'In Progress'],
      ['completed', 'Completed'],
      ['failed', 'Failed'],
      ['cancelled', 'Cancelled'],
      ['rolling_back', 'Rolling Back'],
      ['rolled_back', 'Rolled Back'],
    ] as const)('should render %s status badge', (status, label) => {
      const deployment = createMockDeployment({ status })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  describe('progress indicator', () => {
    it('should show progress bar when in_progress', () => {
      const deployment = createMockDeployment({
        status: 'in_progress',
        completedTenants: 5,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('50% complete')).toBeInTheDocument()
    })

    it('should not show progress bar when completed', () => {
      const deployment = createMockDeployment({
        status: 'completed',
        completedTenants: 10,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText(/% complete/)).not.toBeInTheDocument()
    })

    it('should not show progress bar when failed', () => {
      const deployment = createMockDeployment({
        status: 'failed',
        completedTenants: 5,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText(/% complete/)).not.toBeInTheDocument()
    })
  })

  describe('failed tenants', () => {
    it('should show failed count when there are failures', () => {
      const deployment = createMockDeployment({
        status: 'failed',
        completedTenants: 5,
        failedTenants: 3,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('3 failed')).toBeInTheDocument()
    })

    it('should not show failed count when no failures', () => {
      const deployment = createMockDeployment({
        status: 'completed',
        completedTenants: 10,
        failedTenants: 0,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText(/failed$/)).not.toBeInTheDocument()
    })
  })

  describe('success rate', () => {
    it('should show success rate for completed deployments with no failures', () => {
      const deployment = createMockDeployment({
        status: 'completed',
        completedTenants: 10,
        failedTenants: 0,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('(100%)')).toBeInTheDocument()
    })

    it('should not show success rate when there are failures', () => {
      const deployment = createMockDeployment({
        status: 'completed',
        completedTenants: 7,
        failedTenants: 3,
        totalTenants: 10,
      })
      render(<DeploymentCard deployment={deployment} />)

      // The success rate is only shown when failedTenants === 0
      expect(screen.queryByText(/\(\d+%\)/)).not.toBeInTheDocument()
    })
  })

  describe('duration', () => {
    it('should show duration in seconds', () => {
      const deployment = createMockDeployment({
        durationMs: 45000, // 45 seconds
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('45s')).toBeInTheDocument()
    })

    it('should show duration in minutes and seconds', () => {
      const deployment = createMockDeployment({
        durationMs: 150000, // 2 minutes 30 seconds
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('2m 30s')).toBeInTheDocument()
    })

    it('should show duration in hours and minutes', () => {
      const deployment = createMockDeployment({
        durationMs: 5400000, // 1 hour 30 minutes
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('1h 30m')).toBeInTheDocument()
    })

    it('should not show duration when not available', () => {
      const deployment = createMockDeployment({
        durationMs: undefined,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText(/\d+[hms]/)).toBeNull()
    })
  })

  describe('trigger types', () => {
    it.each([
      ['manual', 'Manual'],
      ['scheduled', 'Scheduled'],
      ['webhook', 'Webhook'],
      ['cli', 'CLI'],
      ['api', 'API'],
    ] as const)('should show %s trigger', (trigger, label) => {
      const deployment = createMockDeployment({ triggeredBy: trigger })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('should not show trigger when not available', () => {
      const deployment = createMockDeployment({ triggeredBy: undefined })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText('Manual')).not.toBeInTheDocument()
      expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
      expect(screen.queryByText('Webhook')).not.toBeInTheDocument()
      expect(screen.queryByText('CLI')).not.toBeInTheDocument()
      expect(screen.queryByText('API')).not.toBeInTheDocument()
    })
  })

  describe('rollback indicator', () => {
    it('should show rollback badge when canRollback is true', () => {
      const deployment = createMockDeployment({ canRollback: true })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('Rollback')).toBeInTheDocument()
    })

    it('should not show rollback badge when canRollback is false', () => {
      const deployment = createMockDeployment({ canRollback: false })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.queryByText('Rollback')).not.toBeInTheDocument()
    })
  })

  describe('relative time', () => {
    it('should show "Just now" for recent deployments', () => {
      const deployment = createMockDeployment({
        createdAt: new Date().toISOString(),
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('Just now')).toBeInTheDocument()
    })

    it('should show minutes ago for recent deployments', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      const deployment = createMockDeployment({
        createdAt: thirtyMinsAgo,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('30m ago')).toBeInTheDocument()
    })

    it('should show hours ago for older deployments', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      const deployment = createMockDeployment({
        createdAt: fiveHoursAgo,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('5h ago')).toBeInTheDocument()
    })

    it('should show days ago for multi-day deployments', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const deployment = createMockDeployment({
        createdAt: threeDaysAgo,
      })
      render(<DeploymentCard deployment={deployment} />)

      expect(screen.getByText('3d ago')).toBeInTheDocument()
    })
  })

  describe('link', () => {
    it('should link to deployment detail page', () => {
      const deployment = createMockDeployment({ id: 'deploy-abc123' })
      render(<DeploymentCard deployment={deployment} />)

      const link = screen.getByRole('link')
      expect(link).toHaveAttribute('href', '/deployments/deploy-abc123')
    })
  })
})
