/**
 * Bearer Token Store (Backend)
 *
 * Verifies server-issued bearer tokens created by the frontend.
 * Tokens are loaded from data/bearer_tokens.json (shared with frontend).
 *
 * Token format: "bearer_<random>" and the backend looks up the full token.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('BEARER_TOKEN_STORE');

interface BearerTokenRecord {
  privyUserId: string;
  bearerToken: string;
  createdAt: string;
  issuedAt: number;
}

// In-memory cache for fast lookups (rebuilds from disk on each access to stay in sync)
let bearerTokensByPrivyUserId: Map<string, BearerTokenRecord> | null = null;

/**
 * Get the data directory for persistent storage (shared with frontend).
 */
function getDataDir(): string {
  return join(process.cwd(), 'data');
}

/**
 * Load bearer tokens from disk and cache them.
 */
function loadBearerTokensFromDisk(): Map<string, BearerTokenRecord> {
  const dataDir = getDataDir();
  const filePath = join(dataDir, 'bearer_tokens.json');

  const cache = new Map<string, BearerTokenRecord>();

  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8');
      const records = JSON.parse(data) as BearerTokenRecord[];
      for (const record of records) {
        cache.set(record.privyUserId, record);
      }
      logger.debug('Loaded bearer tokens from disk', {
        count: records.length,
      });
    }
  } catch (error) {
    logger.warn('Failed to load bearer tokens from disk', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return cache;
}

/**
 * Verify if a bearer token is valid and return the Privy user ID.
 */
export function verifyBearerToken(token: string): string | null {
  if (!token || !token.startsWith('bearer_')) {
    return null;
  }

  // Load fresh tokens from disk (stay in sync with backend persistence).
  const cache = loadBearerTokensFromDisk();

  // Find the record by the full bearer token, not by a parsed user ID.
  // This avoids failures for Privy user IDs containing characters like @ or .
  const record = Array.from(cache.values()).find((r) => r.bearerToken === token);

  if (!record) {
    return null;
  }

  logger.debug('Bearer token verified for user', { privyUserId: record.privyUserId });
  return record.privyUserId;
}

/**
 * Get all bearer tokens for a Privy user (debugging).
 */
export function getBearerTokensForUser(privyUserId: string): BearerTokenRecord | null {
  const cache = loadBearerTokensFromDisk();
  return cache.get(privyUserId) || null;
}

/**
 * List all active bearer tokens (admin).
 */
export function listAllBearerTokens(): BearerTokenRecord[] {
  const cache = loadBearerTokensFromDisk();
  return Array.from(cache.values()).map((r) => ({
    ...r,
    bearerToken: r.bearerToken.substring(0, 20) + '...',
  }));
}
