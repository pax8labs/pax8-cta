/**
 * Integration tests for deployment repository
 * Tests database operations with a real SQLite database
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  createTestDatabase,
  cleanupTestDatabase,
  createTestDeploymentBatch,
  createTestDeployment,
  insertDeploymentBatch,
  insertDeployment,
} from '../test-helpers'

// Import repository functions (we'll mock getDatabase)
import * as deploymentRepo from '@/lib/repositories/deployment-repository'
import * as db from '@/lib/db'

describe('Deployment Repository Integration Tests', () => {
  let testDb: Database.Database

  beforeEach(() => {
    // Create fresh test database
    testDb = createTestDatabase()

    // Mock getDatabase to return our test database
    vi.spyOn(db, 'getDatabase').mockReturnValue(testDb)
  })

  afterEach(() => {
    // Clean up test database
    vi.restoreAllMocks()
    cleanupTestDatabase(testDb)
  })

  describe('createBatch', () => {
    it('should create a deployment batch', () => {
      const batch = createTestDeploymentBatch()

      deploymentRepo.createBatch(batch)

      // Verify in database
      const result = testDb.prepare('SELECT * FROM deployment_batches WHERE id = ?').get(batch.id)
      expect(result).toBeDefined()
      expect(result).toMatchObject({
        id: batch.id,
        solution_name: batch.solutionName,
        status: batch.status,
      })
    })

    it('should handle multiple batches', () => {
      const batch1 = createTestDeploymentBatch()
      const batch2 = createTestDeploymentBatch()

      deploymentRepo.createBatch(batch1)
      deploymentRepo.createBatch(batch2)

      const count = testDb.prepare('SELECT COUNT(*) as count FROM deployment_batches').get() as { count: number }
      expect(count.count).toBe(2)
    })
  })

  describe('createDeployment', () => {
    it('should create a deployment', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment = createTestDeployment({ batchId: batch.id })

      deploymentRepo.createDeployment(deployment)

      // Verify in database
      const result = testDb.prepare('SELECT * FROM deployments WHERE id = ?').get(deployment.id)
      expect(result).toBeDefined()
      expect(result).toMatchObject({
        id: deployment.id,
        batch_id: batch.id,
        tenant_id: deployment.tenantId,
        status: deployment.status,
      })
    })

    it('should enforce foreign key constraint', () => {
      const deployment = createTestDeployment({ batchId: 'non-existent-batch' })

      // Should throw because batch doesn't exist
      expect(() => {
        deploymentRepo.createDeployment(deployment)
      }).toThrow()
    })
  })

  describe('getBatch', () => {
    it('should retrieve an existing batch', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())

      const result = deploymentRepo.getBatch(batch.id)

      expect(result).toBeDefined()
      expect(result?.id).toBe(batch.id)
      expect(result?.solutionName).toBe(batch.solutionName)
      expect(result?.status).toBe(batch.status)
    })

    it('should return null for non-existent batch', () => {
      const result = deploymentRepo.getBatch('non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('getDeployment', () => {
    it('should retrieve an existing deployment', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment = insertDeployment(testDb, createTestDeployment({ batchId: batch.id }))

      const result = deploymentRepo.getDeployment(deployment.id)

      expect(result).toBeDefined()
      expect(result?.id).toBe(deployment.id)
      expect(result?.tenantId).toBe(deployment.tenantId)
      expect(result?.status).toBe(deployment.status)
    })

    it('should return null for non-existent deployment', () => {
      const result = deploymentRepo.getDeployment('non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('getDeploymentsByBatch', () => {
    it('should retrieve all deployments for a batch', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment1 = insertDeployment(testDb, createTestDeployment({ batchId: batch.id }))
      const deployment2 = insertDeployment(testDb, createTestDeployment({ batchId: batch.id }))

      const results = deploymentRepo.getDeploymentsByBatch(batch.id)

      expect(results).toHaveLength(2)
      expect(results.map(d => d.id)).toContain(deployment1.id)
      expect(results.map(d => d.id)).toContain(deployment2.id)
    })

    it('should return empty array for batch with no deployments', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())

      const results = deploymentRepo.getDeploymentsByBatch(batch.id)

      expect(results).toEqual([])
    })

    it('should not return deployments from other batches', () => {
      const batch1 = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const batch2 = insertDeploymentBatch(testDb, createTestDeploymentBatch())

      insertDeployment(testDb, createTestDeployment({ batchId: batch1.id }))
      const deployment2 = insertDeployment(testDb, createTestDeployment({ batchId: batch2.id }))

      const results = deploymentRepo.getDeploymentsByBatch(batch2.id)

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(deployment2.id)
    })
  })

  describe('getDeploymentsByTenant', () => {
    it('should retrieve all deployments for a tenant', () => {
      const batch1 = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const batch2 = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const tenantId = 'tenant-123'

      const deployment1 = insertDeployment(testDb, createTestDeployment({
        batchId: batch1.id,
        tenantId
      }))
      const deployment2 = insertDeployment(testDb, createTestDeployment({
        batchId: batch2.id,
        tenantId
      }))

      const results = deploymentRepo.getDeploymentsByTenant(tenantId)

      expect(results).toHaveLength(2)
      expect(results.map(d => d.id)).toContain(deployment1.id)
      expect(results.map(d => d.id)).toContain(deployment2.id)
    })

    it('should return empty array for tenant with no deployments', () => {
      const results = deploymentRepo.getDeploymentsByTenant('non-existent-tenant')

      expect(results).toEqual([])
    })
  })

  describe('listBatches', () => {
    it('should list all batches', () => {
      insertDeploymentBatch(testDb, createTestDeploymentBatch())
      insertDeploymentBatch(testDb, createTestDeploymentBatch())
      insertDeploymentBatch(testDb, createTestDeploymentBatch())

      const results = deploymentRepo.listBatches()

      expect(results).toHaveLength(3)
    })

    it('should respect limit parameter', () => {
      insertDeploymentBatch(testDb, createTestDeploymentBatch())
      insertDeploymentBatch(testDb, createTestDeploymentBatch())
      insertDeploymentBatch(testDb, createTestDeploymentBatch())

      const results = deploymentRepo.listBatches({ limit: 2 })

      expect(results).toHaveLength(2)
    })

    it('should respect offset parameter', () => {
      const batch1 = insertDeploymentBatch(testDb, createTestDeploymentBatch({
        createdAt: '2026-01-01T00:00:00Z'
      }))
      const batch2 = insertDeploymentBatch(testDb, createTestDeploymentBatch({
        createdAt: '2026-01-02T00:00:00Z'
      }))
      const batch3 = insertDeploymentBatch(testDb, createTestDeploymentBatch({
        createdAt: '2026-01-03T00:00:00Z'
      }))

      const results = deploymentRepo.listBatches({ offset: 1, limit: 2 })

      expect(results).toHaveLength(2)
      // Should skip the most recent (batch3)
      expect(results.map(b => b.id)).not.toContain(batch3.id)
    })

    it('should filter by status', () => {
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'pending' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'in_progress' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'completed' }))

      const results = deploymentRepo.listBatches({ status: 'pending' })

      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('pending')
    })
  })

  describe('updateBatchStatus', () => {
    it('should update batch status', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'pending' }))

      deploymentRepo.updateBatchStatus(batch.id, 'in_progress')

      const result = deploymentRepo.getBatch(batch.id)
      expect(result?.status).toBe('in_progress')
    })

    it('should update timestamp when updating status', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const originalUpdatedAt = batch.updatedAt

      // Wait a bit to ensure timestamp changes
      const waitMs = 10
      const start = Date.now()
      while (Date.now() - start < waitMs) {
        // busy wait
      }

      deploymentRepo.updateBatchStatus(batch.id, 'in_progress')

      const result = deploymentRepo.getBatch(batch.id)
      expect(result?.updatedAt).not.toBe(originalUpdatedAt)
    })
  })

  describe('updateDeploymentStatus', () => {
    it('should update deployment status', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment = insertDeployment(testDb, createTestDeployment({
        batchId: batch.id,
        status: 'pending'
      }))

      deploymentRepo.updateDeploymentStatus(deployment.id, 'in_progress')

      const result = deploymentRepo.getDeployment(deployment.id)
      expect(result?.status).toBe('in_progress')
    })

    it('should allow setting error message', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment = insertDeployment(testDb, createTestDeployment({ batchId: batch.id }))

      deploymentRepo.updateDeploymentStatus(deployment.id, 'failed', 'Test error message')

      const result = deploymentRepo.getDeployment(deployment.id)
      expect(result?.status).toBe('failed')
      expect(result?.error).toBe('Test error message')
    })
  })

  describe('getBatchStats', () => {
    it('should return correct stats', () => {
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'pending' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'pending' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'in_progress' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'completed' }))
      insertDeploymentBatch(testDb, createTestDeploymentBatch({ status: 'failed' }))

      const stats = deploymentRepo.getBatchStats()

      expect(stats.total).toBe(5)
      expect(stats.pending).toBe(2)
      expect(stats.in_progress).toBe(1)
      expect(stats.completed).toBe(1)
      expect(stats.failed).toBe(1)
    })

    it('should return zero stats for empty database', () => {
      const stats = deploymentRepo.getBatchStats()

      expect(stats.total).toBe(0)
      expect(stats.pending).toBe(0)
      expect(stats.in_progress).toBe(0)
      expect(stats.completed).toBe(0)
      expect(stats.failed).toBe(0)
    })
  })

  describe('CASCADE rules', () => {
    it('should cascade delete deployments when batch is deleted', () => {
      const batch = insertDeploymentBatch(testDb, createTestDeploymentBatch())
      const deployment = insertDeployment(testDb, createTestDeployment({ batchId: batch.id }))

      // Delete the batch
      testDb.prepare('DELETE FROM deployment_batches WHERE id = ?').run(batch.id)

      // Deployment should also be deleted due to CASCADE
      const result = testDb.prepare('SELECT * FROM deployments WHERE id = ?').get(deployment.id)
      expect(result).toBeUndefined()
    })
  })

  describe('Index usage', () => {
    it('should use index for status queries', () => {
      // Insert many batches
      for (let i = 0; i < 100; i++) {
        insertDeploymentBatch(testDb, createTestDeploymentBatch({
          status: i % 2 === 0 ? 'pending' : 'completed'
        }))
      }

      // Query with EXPLAIN QUERY PLAN to verify index usage
      const plan = testDb.prepare(`
        EXPLAIN QUERY PLAN
        SELECT * FROM deployment_batches WHERE status = 'pending'
      `).all()

      const planText = JSON.stringify(plan)
      expect(planText).toContain('idx_batches_status')
    })
  })
})
