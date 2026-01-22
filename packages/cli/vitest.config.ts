import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000, // 30s for slower integration tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'dist/**',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/node_modules/**',
        'src/__tests__/**',
      ],
      thresholds: {
        // Updated coverage thresholds after adding comprehensive tests
        lines: 72,
        functions: 75,
        branches: 75,
        statements: 72,
      },
    },
  },
});
