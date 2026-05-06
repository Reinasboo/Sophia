/**
 * Bearer Token Store (Frontend API Route)
 *
 * Manages server-issued bearer tokens for each Privy user.
 * Tokens are persistent across sessions and deployments.
 * Each user gets ONE unique bearer token that never expires.
 *
 * Token format: "bearer_<privy_user_id>_<32-byte-random>"
 *
 * This store is used by the privy-callback API route.
 */

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface BearerTokenRecord {
  privyUserId: string;
  bearerToken: string;
  createdAt: string;
  issuedAt: number;
}

// In-memory cache for fast lookups (rebuilds from disk on startup)
const bearerTokensByPrivyUserId = new Map<string, BearerTokenRecord>();

const STORE_KEY = 'bearer_tokens';

/**
 * Get the data directory for persistent storage.
 */
function getDataDir(): string {
  // Store tokens in the repo root's data/ directory
  return join(process.cwd(), '..', '..', 'data');
}

/**
 * Initialize the bearer token store from disk.
 * Call once on privy-callback startup.
 */
export function initializeBearerTokenStore(): void {
  try {
    const dataDir = getDataDir();
    const filePath = join(dataDir, `${STORE_KEY}.json`);

    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8');
      const records = JSON.parse(data) as BearerTokenRecord[];
      bearerTokensByPrivyUserId.clear();
      for (const record of records) {
        bearerTokensByPrivyUserId.set(record.privyUserId, record);
      }
      console.log(
        `[Bearer Token Store] Initialized from disk with ${records.length} tokens`
      );
    } else {
      console.log('[Bearer Token Store] Initialized (empty)');
    }
  } catch (error) {
    console.warn('[Bearer Token Store] Failed to load from disk, starting fresh', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Persist the in-memory store to disk.
 */
function persistBearerTokens(): void {
  try {
    const dataDir = getDataDir();

    // Ensure data directory exists
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const filePath = join(dataDir, `${STORE_KEY}.json`);
    const records = Array.from(bearerTokensByPrivyUserId.values());
    const tempFilePath = join(dataDir, `${STORE_KEY}.json.tmp`);

    writeFileSync(tempFilePath, JSON.stringify(records, null, 2), 'utf8');

    // Atomic rename
    try {
      // Windows may reject rename-over-existing
      if (existsSync(filePath)) {
        const backupPath = join(dataDir, `${STORE_KEY}.json.bak`);
        if (existsSync(backupPath)) {
          // Remove old backup first on Windows
          try {
            require('fs').unlinkSync(backupPath);
          } catch {
            // ignore
          }
        }
        require('fs').renameSync(filePath, backupPath);
      }
      require('fs').renameSync(tempFilePath, filePath);
    } catch (renameErr) {
      console.error('[Bearer Token Store] Failed to persist', {
        error: renameErr instanceof Error ? renameErr.message : String(renameErr),
      });
    }
  } catch (error) {
    console.error('[Bearer Token Store] Failed to persist', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Generate a unique bearer token.
 */
function generateBearerToken(privyUserId: string): string {
  // Format: "bearer_<privy_user_id>_<random>"
  const randomPart = randomBytes(32).toString('hex');
  const sanitizedId = privyUserId.replace(/[^a-z0-9_-]/gi, '');
  return `bearer_${sanitizedId}_${randomPart}`;
}

/**
 * Get or create a bearer token for a Privy user.
 * Returns the same token on subsequent calls for the same user.
 */
export function getOrCreateBearerToken(privyUserId: string): string {
  if (!privyUserId) {
    throw new Error('privyUserId is required');
  }

  let record = bearerTokensByPrivyUserId.get(privyUserId);

  if (record) {
    console.log(`[Bearer Token Store] Using existing token for user: ${privyUserId}`);
    return record.bearerToken;
  }

  // Create new token
  const bearerToken = generateBearerToken(privyUserId);
  record = {
    privyUserId,
    bearerToken,
    createdAt: new Date().toISOString(),
    issuedAt: Date.now(),
  };

  bearerTokensByPrivyUserId.set(privyUserId, record);
  persistBearerTokens();

  console.log(
    `[Bearer Token Store] Created new token for user: ${privyUserId} (${bearerToken.substring(0, 20)}...)`
  );

  return bearerToken;
}

/**
 * Verify if a bearer token is valid and return the Privy user ID.
 */
export function verifyBearerToken(token: string): string | null {
  if (!token || !token.startsWith('bearer_')) {
    return null;
  }

  // Parse token format: "bearer_<privy_user_id>_<random>"
  const parts = token.split('_');
  if (parts.length < 3) {
    return null;
  }

  const privyUserId = parts.slice(1, -1).join('_');
  const record = bearerTokensByPrivyUserId.get(privyUserId);

  if (!record) {
    return null;
  }

  // Verify the token matches
  if (record.bearerToken !== token) {
    console.warn(`[Bearer Token Store] Token mismatch for user: ${privyUserId}`);
    return null;
  }

  return privyUserId;
}
