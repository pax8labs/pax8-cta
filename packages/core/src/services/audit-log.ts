export type AuditAction =
  | 'deployment.created'
  | 'deployment.started'
  | 'deployment.completed'
  | 'deployment.failed'
  | 'deployment.cancelled'
  | 'deployment.retried'
  | 'rollback.initiated'
  | 'rollback.completed'
  | 'rollback.failed'
  | 'solution.exported'
  | 'solution.imported'
  | 'tenant.added'
  | 'tenant.updated'
  | 'tenant.removed'
  | 'config.changed'
  | 'user.login'
  | 'user.logout'
  | 'api.access'
  | 'scheduled.deployment.triggered'
  | 'scheduled.deployment.registered'
  | 'scheduled.deployment.removed';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: AuditAction;
  userId: string;
  userEmail?: string;
  userRoles?: string[];
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export interface AuditLogQuery {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditLogStorage {
  write(entry: AuditLogEntry): Promise<void>;
  query(query: AuditLogQuery): Promise<AuditLogEntry[]>;
  count(query: AuditLogQuery): Promise<number>;
}

// In-memory storage for development/testing
class InMemoryAuditStorage implements AuditLogStorage {
  private entries: AuditLogEntry[] = [];
  private maxEntries = 10000;

  async write(entry: AuditLogEntry): Promise<void> {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    const results = this.entries.filter((entry) => {
      if (query.startDate && entry.timestamp < query.startDate) return false;
      if (query.endDate && entry.timestamp > query.endDate) return false;
      if (query.userId && entry.userId !== query.userId) return false;
      if (query.action && entry.action !== query.action) return false;
      if (query.resourceType && entry.resourceType !== query.resourceType) return false;
      if (query.resourceId && entry.resourceId !== query.resourceId) return false;
      if (query.success !== undefined && entry.success !== query.success) return false;
      return true;
    });

    const offset = query.offset || 0;
    const limit = query.limit || 100;

    return results.slice(offset, offset + limit);
  }

  async count(query: AuditLogQuery): Promise<number> {
    const results = await this.query({ ...query, limit: undefined, offset: undefined });
    return results.length;
  }
}

// Console/structured logging storage
class ConsoleAuditStorage implements AuditLogStorage {
  private structuredLogging: boolean;

  constructor(structuredLogging = true) {
    this.structuredLogging = structuredLogging;
  }

  async write(entry: AuditLogEntry): Promise<void> {
    if (this.structuredLogging) {
      console.log(JSON.stringify({
        level: entry.success ? 'info' : 'warn',
        type: 'audit',
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      }));
    } else {
      const status = entry.success ? 'SUCCESS' : 'FAILED';
      console.log(
        `[AUDIT] ${entry.timestamp.toISOString()} ${status} ${entry.action} ` +
        `user=${entry.userId} resource=${entry.resourceType}/${entry.resourceId || 'n/a'}`
      );
    }
  }

  async query(_query: AuditLogQuery): Promise<AuditLogEntry[]> {
    // Console storage doesn't support querying
    return [];
  }

  async count(_query: AuditLogQuery): Promise<number> {
    return 0;
  }
}

export class AuditLogService {
  private storages: AuditLogStorage[] = [];

  constructor(storages?: AuditLogStorage[]) {
    if (storages && storages.length > 0) {
      this.storages = storages;
    } else {
      // Default: use both in-memory and console logging
      this.storages = [
        new InMemoryAuditStorage(),
        new ConsoleAuditStorage(process.env.NODE_ENV === 'production'),
      ];
    }
  }

  async log(
    action: AuditAction,
    context: {
      userId: string;
      userEmail?: string;
      userRoles?: string[];
      resourceType: string;
      resourceId?: string;
      resourceName?: string;
      details?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      success?: boolean;
      errorMessage?: string;
    }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      action,
      userId: context.userId,
      userEmail: context.userEmail,
      userRoles: context.userRoles,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      resourceName: context.resourceName,
      details: context.details,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: context.success ?? true,
      errorMessage: context.errorMessage,
    };

    await Promise.all(this.storages.map((storage) => storage.write(entry)));
  }

  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    // Use the first storage that supports querying
    for (const storage of this.storages) {
      const results = await storage.query(query);
      if (results.length > 0) {
        return results;
      }
    }
    return [];
  }

  async count(query: AuditLogQuery): Promise<number> {
    for (const storage of this.storages) {
      const count = await storage.count(query);
      if (count > 0) {
        return count;
      }
    }
    return 0;
  }

  // Convenience methods for common actions
  async logDeploymentCreated(
    userId: string,
    deploymentId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.log('deployment.created', {
      userId,
      resourceType: 'deployment',
      resourceId: deploymentId,
      details,
    });
  }

  async logDeploymentCompleted(
    userId: string,
    deploymentId: string,
    success: boolean,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.log(success ? 'deployment.completed' : 'deployment.failed', {
      userId,
      resourceType: 'deployment',
      resourceId: deploymentId,
      success,
      details,
    });
  }

  async logRollback(
    userId: string,
    tenantId: string,
    tenantName: string,
    previousVersion: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.log(success ? 'rollback.completed' : 'rollback.failed', {
      userId,
      resourceType: 'tenant',
      resourceId: tenantId,
      resourceName: tenantName,
      success,
      errorMessage,
      details: { previousVersion },
    });
  }

  async logUserLogin(
    userId: string,
    userEmail: string,
    ipAddress: string,
    userAgent: string,
    success: boolean
  ): Promise<void> {
    await this.log('user.login', {
      userId,
      userEmail,
      resourceType: 'auth',
      ipAddress,
      userAgent,
      success,
    });
  }

  async logApiAccess(
    userId: string,
    method: string,
    path: string,
    ipAddress: string,
    statusCode: number
  ): Promise<void> {
    await this.log('api.access', {
      userId,
      resourceType: 'api',
      resourceId: path,
      success: statusCode < 400,
      details: { method, statusCode },
      ipAddress,
    });
  }
}

// Singleton instance
let auditLogInstance: AuditLogService | null = null;

export function getAuditLog(): AuditLogService {
  if (!auditLogInstance) {
    auditLogInstance = new AuditLogService();
  }
  return auditLogInstance;
}
