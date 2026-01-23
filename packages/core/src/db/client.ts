import { coreLogger } from '../services/logger.js';

const logger = coreLogger.child({ service: 'database' });

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  poolSize?: number;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// PostgreSQL client using native fetch (for serverless compatibility)
// In production, you'd use 'pg' package with connection pooling
class PostgresClient implements DatabaseClient {
  constructor(_config: DatabaseConfig) {
    // Config stored for future implementation with pg package
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();

    try {
      // This is a simplified implementation
      // In production, use the 'pg' package:
      // const { Pool } = require('pg');
      // const pool = new Pool(this.config);
      // const result = await pool.query(sql, params);

      logger.debug('Executing query', {
        sql: sql.substring(0, 100),
        paramCount: params?.length ?? 0,
      });

      // Placeholder for actual implementation
      throw new Error('PostgreSQL client not configured. Install pg package and configure connection.');
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Query failed', error as Error, {
        sql: sql.substring(0, 100),
        durationMs: duration,
      });
      throw error;
    }
  }

  async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    await this.query('BEGIN');
    try {
      const result = await fn(this);
      await this.query('COMMIT');
      return result;
    } catch (error) {
      await this.query('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    // Close all pool connections
    logger.info('Closing database connections');
  }
}

// In-memory database for testing and development
class InMemoryDatabaseClient implements DatabaseClient {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map();

  constructor() {
    // Initialize tables
    this.tables.set('deployments', new Map());
    this.tables.set('tenant_deployments', new Map());
    this.tables.set('audit_logs', new Map());
    this.tables.set('rollback_snapshots', new Map());
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const normalizedSql = sql.toLowerCase().trim();

    // Simple SQL parsing for common operations
    if (normalizedSql.startsWith('insert into')) {
      return this.handleInsert(sql, params) as QueryResult<T>;
    } else if (normalizedSql.startsWith('select')) {
      return this.handleSelect(sql, params) as QueryResult<T>;
    } else if (normalizedSql.startsWith('update')) {
      return this.handleUpdate(sql, params) as QueryResult<T>;
    } else if (normalizedSql.startsWith('delete')) {
      return this.handleDelete(sql, params) as QueryResult<T>;
    }

    return { rows: [], rowCount: 0 };
  }

  private handleInsert(
    sql: string,
    params?: unknown[]
  ): QueryResult {
    const tableMatch = sql.match(/insert into\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return { rows: [], rowCount: 0 };

    const id = crypto.randomUUID();
    const record: Record<string, unknown> = { id };

    // Extract column names and values from SQL
    const columnsMatch = sql.match(/\(([^)]+)\)\s*values/i);
    if (columnsMatch && params) {
      const columns = columnsMatch[1].split(',').map((c) => c.trim());
      columns.forEach((col, i) => {
        if (params[i] !== undefined) {
          record[col] = params[i];
        }
      });
    }

    record.created_at = new Date().toISOString();
    table.set(id, record);

    return { rows: [record], rowCount: 1 };
  }

  private handleSelect(
    sql: string,
    params?: unknown[]
  ): QueryResult {
    const tableMatch = sql.match(/from\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return { rows: [], rowCount: 0 };

    let rows = Array.from(table.values());

    // Simple WHERE clause handling
    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\$1/i);
    if (whereMatch && params && params[0]) {
      const column = whereMatch[1];
      rows = rows.filter((r) => r[column] === params[0]);
    }

    // Simple ORDER BY handling
    const orderMatch = sql.match(/order by\s+(\w+)\s+(asc|desc)?/i);
    if (orderMatch) {
      const column = orderMatch[1];
      const direction = orderMatch[2]?.toLowerCase() === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        const aVal = a[column] as string | number | undefined;
        const bVal = b[column] as string | number | undefined;
        if (aVal === undefined || bVal === undefined) return 0;
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }

    // Simple LIMIT handling
    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      rows = rows.slice(0, parseInt(limitMatch[1]));
    }

    return { rows, rowCount: rows.length };
  }

  private handleUpdate(
    sql: string,
    params?: unknown[]
  ): QueryResult {
    const tableMatch = sql.match(/update\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return { rows: [], rowCount: 0 };

    // Find the record to update
    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\$(\d+)/i);
    if (!whereMatch || !params) return { rows: [], rowCount: 0 };

    const whereColumn = whereMatch[1];
    const whereParamIndex = parseInt(whereMatch[2]) - 1;
    const whereValue = params[whereParamIndex];

    let updatedCount = 0;
    for (const [id, record] of table.entries()) {
      if (record[whereColumn] === whereValue) {
        // Extract SET clause
        const setMatch = sql.match(/set\s+(.+?)\s+where/i);
        if (setMatch) {
          const setClauses = setMatch[1].split(',');
          setClauses.forEach((clause) => {
            const [column, paramRef] = clause.split('=').map((s) => s.trim());
            const paramMatch = paramRef.match(/\$(\d+)/);
            if (paramMatch) {
              const paramIndex = parseInt(paramMatch[1]) - 1;
              record[column] = params[paramIndex];
            }
          });
        }
        record.updated_at = new Date().toISOString();
        table.set(id, record);
        updatedCount++;
      }
    }

    return { rows: [], rowCount: updatedCount };
  }

  private handleDelete(
    sql: string,
    params?: unknown[]
  ): QueryResult {
    const tableMatch = sql.match(/delete from\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };

    const tableName = tableMatch[1].toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) return { rows: [], rowCount: 0 };

    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\$1/i);
    if (!whereMatch || !params) return { rows: [], rowCount: 0 };

    const column = whereMatch[1];
    const value = params[0];

    let deletedCount = 0;
    for (const [id, record] of table.entries()) {
      if (record[column] === value) {
        table.delete(id);
        deletedCount++;
      }
    }

    return { rows: [], rowCount: deletedCount };
  }

  async transaction<T>(fn: (client: DatabaseClient) => Promise<T>): Promise<T> {
    // In-memory doesn't need real transactions
    return fn(this);
  }

  async close(): Promise<void> {
    this.tables.clear();
  }
}

// Database client factory
export function createDatabaseClient(config?: DatabaseConfig): DatabaseClient {
  const connectionString = config?.connectionString || process.env.DATABASE_URL;

  if (connectionString) {
    logger.info('Using PostgreSQL database');
    return new PostgresClient({ connectionString, ...config });
  }

  logger.warn('No database configured, using in-memory storage');
  return new InMemoryDatabaseClient();
}

// Singleton instance
let dbInstance: DatabaseClient | null = null;

export function getDatabase(): DatabaseClient {
  if (!dbInstance) {
    dbInstance = createDatabaseClient();
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
