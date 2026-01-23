/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   npm install -g pm2
 *   pm2 start deploy/pm2.config.cjs
 *   pm2 logs
 *   pm2 status
 *   pm2 stop all
 *
 * Prerequisites:
 *   - Node.js 20+
 *   - Redis running locally or remotely
 *   - pnpm install && pnpm build
 */

module.exports = {
  apps: [
    {
      name: 'csd-web',
      cwd: './packages/web',
      script: 'npm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        CONFIG_PATH: process.env.CONFIG_PATH || '../../config/tenants.yaml',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3001',
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
        AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
        AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
        AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '500M',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'csd-worker',
      cwd: './packages/worker',
      script: 'node',
      args: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
        CONFIG_PATH: process.env.CONFIG_PATH || '../../config/tenants.yaml',
        PARTNER_CLIENT_SECRET: process.env.PARTNER_CLIENT_SECRET,
        WORKER_CONCURRENCY: process.env.WORKER_CONCURRENCY || '5',
        SNAPSHOT_DIR: process.env.SNAPSHOT_DIR || './snapshots',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
