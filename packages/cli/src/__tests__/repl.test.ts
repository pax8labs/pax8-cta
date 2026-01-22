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

import { describe, it, expect } from 'vitest';
import { parseCommandLine, startRepl } from '../lib/repl.js';

describe('REPL Module', () => {
  describe('parseCommandLine', () => {
    it('should split simple commands by spaces', () => {
      const result = parseCommandLine('agents list');
      expect(result).toEqual(['agents', 'list']);
    });

    it('should handle multiple spaces between arguments', () => {
      const result = parseCommandLine('agents   list   --json');
      expect(result).toEqual(['agents', 'list', '--json']);
    });

    it('should handle leading and trailing spaces', () => {
      const result = parseCommandLine('  agents list  ');
      expect(result).toEqual(['agents', 'list']);
    });

    it('should handle single-quoted arguments', () => {
      const result = parseCommandLine("tenants show 'Contoso Corporation'");
      expect(result).toEqual(['tenants', 'show', 'Contoso Corporation']);
    });

    it('should handle double-quoted arguments', () => {
      const result = parseCommandLine('tenants show "Contoso Corporation"');
      expect(result).toEqual(['tenants', 'show', 'Contoso Corporation']);
    });

    it('should handle quoted strings with spaces', () => {
      const result = parseCommandLine('deploy --comment "this is a test comment"');
      expect(result).toEqual(['deploy', '--comment', 'this is a test comment']);
    });

    it('should handle empty input', () => {
      const result = parseCommandLine('');
      expect(result).toEqual([]);
    });

    it('should handle only spaces', () => {
      const result = parseCommandLine('   ');
      expect(result).toEqual([]);
    });

    it('should handle single argument', () => {
      const result = parseCommandLine('help');
      expect(result).toEqual(['help']);
    });

    it('should handle mixed quotes and regular args', () => {
      const result = parseCommandLine('deploy --tenant contoso --comment "deploy to prod"');
      expect(result).toEqual(['deploy', '--tenant', 'contoso', '--comment', 'deploy to prod']);
    });

    it('should handle flags with equals sign', () => {
      const result = parseCommandLine('status --format=json');
      expect(result).toEqual(['status', '--format=json']);
    });

    it('should handle complex commands', () => {
      const result = parseCommandLine('deployments create --solution "Customer Agent" --tenants all --dry-run');
      expect(result).toEqual(['deployments', 'create', '--solution', 'Customer Agent', '--tenants', 'all', '--dry-run']);
    });
  });

  describe('startRepl', () => {
    it('should be a function export', () => {
      expect(startRepl).toBeDefined();
      expect(typeof startRepl).toBe('function');
    });
  });
});
