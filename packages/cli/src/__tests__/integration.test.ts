/**
 * Copyright 2024 Pax8 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Integration tests demonstrating CLI test utilities
 *
 * These tests run the CLI as a subprocess and verify end-to-end behavior.
 * They serve as examples for how to write integration tests for new commands.
 */

import { describe, it, expect } from 'vitest';
import {
  runCli,
  runCliExpectSuccess,
  runCliExpectFailure,
  parseTable,
  getColumn,
  findRow,
  extractJson,
  stripAnsi,
  containsText,
} from './test-utils.js';
import { DEMO_TENANTS } from './fixtures/index.js';

describe('CLI Integration Tests', () => {
  describe('runCli utility', () => {
    it('should capture stdout and stderr', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('agentsync');
      expect(result.stderr).toBe('');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle non-zero exit codes', async () => {
      const result = await runCli(['nonexistent-command']);

      expect(result.exitCode).not.toBe(0);
    });

    it('should respect environment variables', async () => {
      const result = await runCli(['demo', 'status'], {
        env: { DEMO_MODE: 'true' },
      });

      expect(result.exitCode).toBe(0);
      expect(containsText(result.output, 'Demo mode')).toBe(true);
    });
  });

  describe('runCliExpectSuccess utility', () => {
    it('should return result on success', async () => {
      const result = await runCliExpectSuccess(['--version']);
      expect(result.stdout).toContain('0.1.0');
    });

    it('should throw on failure', async () => {
      // In demo mode, ship succeeds even with missing file - use a validation error instead
      await expect(
        runCliExpectSuccess(['ship', '--solution', './test.zip']) // Missing --all or --tag
      ).rejects.toThrow();
    });
  });

  describe('runCliExpectFailure utility', () => {
    it('should return result on failure', async () => {
      const result = await runCliExpectFailure(['ship']); // Missing required args
      expect(result.exitCode).not.toBe(0);
    });

    it('should throw on unexpected success', async () => {
      await expect(runCliExpectFailure(['--help'])).rejects.toThrow(
        'unexpectedly succeeded'
      );
    });
  });

  describe('fleet list command', () => {
    it('should list all tenants in demo mode', async () => {
      const result = await runCliExpectSuccess(['fleet', 'list']);

      expect(containsText(result.output, 'DEMO MODE')).toBe(true);
      expect(containsText(result.output, 'Destination')).toBe(true);
      expect(containsText(result.output, 'Fleet size')).toBe(true);
    });

    it('should show correct tenant count', async () => {
      const result = await runCliExpectSuccess(['fleet', 'list']);

      const enabledCount = DEMO_TENANTS.filter((t) => t.enabled).length;
      expect(containsText(result.output, `${enabledCount} active`)).toBe(true);
    });

    it('should filter by tag', async () => {
      const result = await runCliExpectSuccess([
        'fleet',
        'list',
        '--tag',
        'enterprise',
      ]);

      // Should only show enterprise tenants
      expect(containsText(result.output, 'Contoso')).toBe(true);
      expect(containsText(result.output, 'enterprise')).toBe(true);
    });
  });

  describe('parseTable utility', () => {
    it('should parse CLI table output', async () => {
      const result = await runCliExpectSuccess(['fleet', 'list']);
      const table = parseTable(result.stdout);

      expect(table.headers).toContain('Destination');
      expect(table.headers).toContain('Tags');
      expect(table.rows.length).toBeGreaterThan(0);
    });

    it('should extract column values', async () => {
      const result = await runCliExpectSuccess(['fleet', 'list']);
      const table = parseTable(result.stdout);
      const destinations = getColumn(table, 'Destination');

      expect(destinations).toContain('Contoso Corporation');
      expect(destinations).toContain('Fabrikam Inc');
    });

    it('should find row by column value', async () => {
      const result = await runCliExpectSuccess(['fleet', 'list']);
      const table = parseTable(result.stdout);
      const cohoRow = findRow(table, 'Destination', 'Coho');

      expect(cohoRow).toBeDefined();
      expect(cohoRow?.['Tags']).toContain('hospitality');
    });
  });

  describe('demo command', () => {
    it('should show demo mode status', async () => {
      const result = await runCliExpectSuccess(['demo', 'status']);

      // Should show some indication of demo mode state
      expect(
        containsText(result.output, 'Demo mode') ||
          containsText(result.output, 'DEMO') ||
          containsText(result.output, 'enabled') ||
          containsText(result.output, 'disabled')
      ).toBe(true);
    });

    it('should toggle demo mode on', async () => {
      const result = await runCliExpectSuccess(['demo', 'on']);

      expect(
        containsText(result.output, 'enabled') ||
          containsText(result.output, 'Demo mode')
      ).toBe(true);
    });
  });

  describe('ship command (dry run)', () => {
    it('should preview deployment in demo mode', async () => {
      const result = await runCliExpectSuccess([
        'ship',
        '--solution',
        './test.zip',
        '--all',
      ]);

      expect(containsText(result.output, 'DEMO MODE')).toBe(true);
      expect(containsText(result.output, 'Shipment dispatched')).toBe(true);
      expect(containsText(result.output, 'Tracking #')).toBe(true);
    });

    it('should show deployment ID', async () => {
      const result = await runCliExpectSuccess([
        'ship',
        '--solution',
        './test.zip',
        '--tag',
        'enterprise',
      ]);

      // Should contain a deployment ID
      expect(result.output).toMatch(/dep-demo-[a-z0-9]+/);
    });

    it('should fail when no tenants match tag', async () => {
      const result = await runCliExpectFailure([
        'ship',
        '--solution',
        './test.zip',
        '--tag',
        'nonexistent-tag',
      ]);

      expect(containsText(result.output, 'No destinations matched')).toBe(true);
    });
  });

  describe('track command', () => {
    it('should track deployment status', async () => {
      const result = await runCliExpectSuccess([
        'track',
        '--shipment',
        'dep-demo-test123',
      ]);

      expect(containsText(result.output, 'DEMO MODE')).toBe(true);
      // Should show tracking information - look for shipment details
      expect(
        containsText(result.output, 'Tracking') ||
          containsText(result.output, 'Status') ||
          containsText(result.output, 'Shipment') ||
          containsText(result.output, 'dep-demo')
      ).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should show helpful error for missing required options', async () => {
      const result = await runCliExpectFailure([
        'ship',
        '--solution',
        './test.zip',
      ]); // Missing --all or --tag

      expect(containsText(result.output, 'Must specify')).toBe(true);
    });

    it('should show help on unknown command', async () => {
      const result = await runCli(['unknown-command']);

      expect(result.exitCode).not.toBe(0);
    });
  });
});

describe('Output parsing utilities', () => {
  describe('stripAnsi', () => {
    it('should remove ANSI color codes', () => {
      const input = '\x1B[32mgreen\x1B[0m text';
      expect(stripAnsi(input)).toBe('green text');
    });

    it('should handle multiple codes', () => {
      const input = '\x1B[1m\x1B[31mBold Red\x1B[0m';
      expect(stripAnsi(input)).toBe('Bold Red');
    });
  });

  describe('containsText', () => {
    it('should find text ignoring ANSI codes', () => {
      const output = '\x1B[32mSuccess\x1B[0m: Operation completed';
      expect(containsText(output, 'Success')).toBe(true);
      expect(containsText(output, 'completed')).toBe(true);
      expect(containsText(output, 'failure')).toBe(false);
    });
  });

  describe('extractJson', () => {
    it('should extract JSON from mixed output', () => {
      const output = 'Some text\n{"key": "value"}\nMore text';
      const json = extractJson(output);
      expect(json).toEqual({ key: 'value' });
    });

    it('should extract JSON arrays', () => {
      const output = 'Header\n[{"id": 1}, {"id": 2}]\nFooter';
      const json = extractJson(output);
      expect(json).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should return null for invalid JSON', () => {
      const output = 'No JSON here';
      expect(extractJson(output)).toBeNull();
    });
  });
});
