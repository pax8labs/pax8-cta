import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookService } from '../services/webhook.js';
import { Webhook } from '../config/schema.js';

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let fetchMock: ReturnType<typeof vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    webhookService = new WebhookService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with webhooks', () => {
      const webhooks: Webhook[] = [
        {
          url: 'https://example.com/webhook',
          events: ['deployment.started'],
          retries: 3,
        },
      ];

      const service = new WebhookService(webhooks);
      expect(service).toBeDefined();
    });
  });

  describe('addWebhook', () => {
    it('should add a webhook', () => {
      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        retries: 3,
      });

      // We can test this indirectly by sending a notification
    });
  });

  describe('removeWebhook', () => {
    it('should remove a webhook by URL', async () => {
      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        retries: 0,
      });

      webhookService.removeWebhook('https://example.com/webhook');

      // After removal, sending should not call fetch
      fetchMock.mockResolvedValue({ ok: true });

      const result = await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(result.sent).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('sendNotification', () => {
    it('should send notification to subscribed webhooks', async () => {
      fetchMock.mockResolvedValue({ ok: true });

      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        retries: 0,
      });

      const result = await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not send to webhooks not subscribed to the event', async () => {
      fetchMock.mockResolvedValue({ ok: true });

      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.completed'],
        retries: 0,
      });

      const result = await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(result.sent).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle webhook failures', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        retries: 0,
      });

      const result = await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should send to multiple webhooks', async () => {
      fetchMock.mockResolvedValue({ ok: true });

      webhookService.addWebhook({
        url: 'https://example1.com/webhook',
        events: ['deployment.started'],
        retries: 0,
      });

      webhookService.addWebhook({
        url: 'https://example2.com/webhook',
        events: ['deployment.started'],
        retries: 0,
      });

      const result = await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(result.sent).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should include custom headers', async () => {
      fetchMock.mockResolvedValue({ ok: true });

      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        headers: { 'X-API-Key': 'secret-key' },
        retries: 0,
      });

      await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
          }),
        })
      );
    });

    it('should include signature when secret is configured', async () => {
      fetchMock.mockResolvedValue({ ok: true });

      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: ['deployment.started'],
        secret: 'my-secret',
        retries: 0,
      });

      await webhookService.sendNotification('deployment.started', {
        deploymentId: 'test-123',
        solutionName: 'TestSolution',
        status: 'in_progress',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.stringMatching(/^sha256=[a-f0-9]+$/),
          }),
        })
      );
    });
  });

  describe('helper methods', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue({ ok: true });
      webhookService.addWebhook({
        url: 'https://example.com/webhook',
        events: [
          'deployment.started',
          'deployment.completed',
          'deployment.failed',
          'tenant.started',
          'tenant.completed',
          'tenant.failed',
          'wave.started',
          'wave.completed',
          'rollback.started',
          'rollback.completed',
        ],
        retries: 0,
      });
    });

    it('notifyDeploymentStarted should send correct event', async () => {
      await webhookService.notifyDeploymentStarted('dep-123', 'TestSolution', 5);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"event":"deployment.started"'),
        })
      );
    });

    it('notifyDeploymentCompleted should send correct event', async () => {
      await webhookService.notifyDeploymentCompleted('dep-123', 'TestSolution', 4, 1);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"event":"deployment.completed"'),
        })
      );
    });

    it('notifyTenantStarted should include tenant info', async () => {
      await webhookService.notifyTenantStarted(
        'dep-123',
        'TestSolution',
        '00000000-0000-0000-0000-000000000001',
        'Contoso',
        1
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"tenantName":"Contoso"'),
        })
      );
    });

    it('notifyTenantFailed should include error', async () => {
      await webhookService.notifyTenantFailed(
        'dep-123',
        'TestSolution',
        '00000000-0000-0000-0000-000000000001',
        'Contoso',
        'Import failed: missing dependencies'
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('Import failed: missing dependencies'),
        })
      );
    });

    it('notifyWaveCompleted should include wave number', async () => {
      await webhookService.notifyWaveCompleted('dep-123', 'TestSolution', 2, 5, 0);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"waveNumber":2'),
        })
      );
    });

    it('notifyRollbackStarted should include version info', async () => {
      await webhookService.notifyRollbackStarted(
        'dep-123',
        'TestSolution',
        '00000000-0000-0000-0000-000000000001',
        'Contoso',
        '1.0.0.5'
      );

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          body: expect.stringContaining('"previousVersion":"1.0.0.5"'),
        })
      );
    });
  });
});
