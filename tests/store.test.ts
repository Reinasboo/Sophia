/**
 * State Store Tests
 *
 * Validates file-based persistence round-trip and missing-key behavior.
 * Uses the real filesystem (data/ directory).
 */

import { describe, it, expect, afterEach } from 'vitest';
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
});
