/**
 * State Store Tests
 *
 * Validates file-based persistence round-trip and missing-key behavior.
 * Uses the real filesystem (data/ directory).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { saveState, loadState } from '../src/utils/store.js';

describe('saveState / loadState', () => {
  const testDir = join(process.cwd(), 'data');

  afterEach(() => {
    const testFile = join(testDir, 'test-key.json');
    if (existsSync(testFile)) rmSync(testFile);
  });

  it('round-trips a plain object', () => {
    const data = { agents: [{ id: '1', name: 'bot' }], count: 42 };
    saveState('test-key', data);
    const loaded = loadState<typeof data>('test-key');
    expect(loaded).toEqual(data);
  });

  it('returns null for a missing key', () => {
    const result = loadState('nonexistent-key-xyz');
    expect(result).toBeNull();
  });

  it('requires DATA_DIR in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDataDir = process.env.DATA_DIR;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.DATA_DIR;

      await vi.resetModules();

      await expect(import('../src/utils/store.js')).rejects.toThrow(
        'DATA_DIR must be set in production for shared state persistence.'
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalDataDir === undefined) {
        delete process.env.DATA_DIR;
      } else {
        process.env.DATA_DIR = originalDataDir;
      }
      await vi.resetModules();
    }
  });
});
