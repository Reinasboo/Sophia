/**
 * State Store
 *
 * Simple file-based persistence for in-memory state.
 * Writes JSON files to the `data/` directory at the workspace root.
 *
 * Design goals:
 * - Zero extra dependencies (uses Node.js fs module)
 * - Synchronous writes so the caller knows when the data is safe
 * - Graceful: a corrupted or missing file never crashes the server
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('STORE');

const DATA_DIR = join(process.cwd(), 'data');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    logger.info('Created data directory', { path: DATA_DIR });
  }
}

/**
 * Persist an arbitrary value under `key`.
 * Written to `data/<key>.json`.
 * Errors are logged but never thrown.
 */
export function saveState<T>(key: string, data: T): void {
  // L-2 FIX: Validate key to prevent path traversal (e.g. "../../etc/passwd").
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw new Error(`Invalid state key: "${key}". Only alphanumeric, _ and - are allowed.`);
  }
  try {
    ensureDataDir();
    const filePath = join(DATA_DIR, `${key}.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to save state', { key, error: String(err) });
  }
}

/**
 * Load a previously saved value for `key`.
 * Returns `null` if the file doesn't exist or cannot be parsed.
 * Dates are NOT automatically revived — callers must revive them if needed.
 */
export function loadState<T>(key: string): T | null {
  // L-2 FIX: Same key validation on reads.
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw new Error(`Invalid state key: "${key}". Only alphanumeric, _ and - are allowed.`);
  }
  try {
    const filePath = join(DATA_DIR, `${key}.json`);
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error('Failed to load state', { key, error: String(err) });
    return null;
  }
}
