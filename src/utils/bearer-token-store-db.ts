/**
 * Bearer Token Store (Database-Backed)
 *
 * Persists server-issued bearer tokens in PostgreSQL (production)
 * with file-based fallback for local development.
 *
 * Tokens persist across process restarts and deployments.
 * Token format: "bearer_<privy_user_id>_<32-byte-random>"
 */

import { Pool, QueryResult } from 'pg';
import { createLogger } from './logger.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const logger = createLogger('BEARER_TOKEN_STORE_DB');

interface BearerTokenRecord {
  privyUserId: string;
  bearerToken: string;
  createdAt: string;
  issuedAt: number;
}

let pool: Pool | null = null;
let fileBackendUsed = false;

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function canUseFileBackend(): boolean {
  return fileBackendUsed && !isProduction();
}

/**
 * Initialize the database connection (production) or file backend (dev).
 */
async function initializeBackend(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];

  if (dbUrl && dbUrl !== 'PLACEHOLDER') {
    try {
      pool = new Pool({ connectionString: dbUrl });

      // Test connection
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();

      // Create table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bearer_tokens (
          id SERIAL PRIMARY KEY,
          privy_user_id TEXT UNIQUE NOT NULL,
          bearer_token TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          issued_at BIGINT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_privy_user_id ON bearer_tokens(privy_user_id);
        CREATE INDEX IF NOT EXISTS idx_bearer_token ON bearer_tokens(bearer_token);
      `);

      logger.info('Connected to PostgreSQL bearer token store');
      return;
    } catch (err) {
      logger.error('Failed to connect to PostgreSQL', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (isProduction()) {
        throw err;
      }
      // Fall back to file backend in non-production environments only.
    }
  }

  if (isProduction()) {
    throw new Error('DATABASE_URL is required for bearer token storage in production.');
  }

  logger.warn('Using file-based bearer token store (not recommended for production)');
  fileBackendUsed = true;
}

/**
 * Store a new or updated bearer token in the database.
 */
export async function storeBearerToken(record: BearerTokenRecord): Promise<void> {
  if (!fileBackendUsed && pool) {
    try {
      await pool.query(
        `INSERT INTO bearer_tokens (privy_user_id, bearer_token, issued_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (privy_user_id) DO UPDATE
         SET bearer_token = EXCLUDED.bearer_token, issued_at = EXCLUDED.issued_at`,
        [record.privyUserId, record.bearerToken, record.issuedAt]
      );
      return;
    } catch (err) {
      logger.error('Failed to store bearer token in DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (canUseFileBackend()) {
    storeTokenToFile(record);
    return;
  }

  throw new Error('Bearer token store is unavailable. Refusing to write tokens without PostgreSQL.');
}

/**
 * Retrieve a bearer token by Privy user ID.
 */
export async function getBearerTokenByUser(privyUserId: string): Promise<BearerTokenRecord | null> {
  if (!fileBackendUsed && pool) {
    try {
      const result = await pool.query(
        `SELECT privy_user_id, bearer_token, created_at, issued_at
         FROM bearer_tokens WHERE privy_user_id = $1`,
        [privyUserId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          privyUserId: row.privy_user_id,
          bearerToken: row.bearer_token,
          createdAt: row.created_at,
          issuedAt: row.issued_at,
        };
      }
      return null;
    } catch (err) {
      logger.error('Failed to retrieve token from DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (canUseFileBackend()) {
    return getTokenFromFile(privyUserId);
  }

  return null;
}

/**
 * Retrieve a bearer token by token value.
 */
export async function getBearerTokenByValue(
  bearerToken: string
): Promise<BearerTokenRecord | null> {
  if (!fileBackendUsed && pool) {
    try {
      const result = await pool.query(
        `SELECT privy_user_id, bearer_token, created_at, issued_at
         FROM bearer_tokens WHERE bearer_token = $1`,
        [bearerToken]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          privyUserId: row.privy_user_id,
          bearerToken: row.bearer_token,
          createdAt: row.created_at,
          issuedAt: row.issued_at,
        };
      }
      return null;
    } catch (err) {
      logger.error('Failed to retrieve token from DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (canUseFileBackend()) {
    const privyUserId = extractPrivyUserIdFromToken(bearerToken);
    if (privyUserId) {
      return getTokenFromFile(privyUserId);
    }
  }
  return null;
}

/**
 * List all bearer tokens (admin).
 */
export async function listAllBearerTokens(): Promise<BearerTokenRecord[]> {
  if (!fileBackendUsed && pool) {
    try {
      const result = await pool.query(
        `SELECT privy_user_id, bearer_token, created_at, issued_at
         FROM bearer_tokens ORDER BY created_at DESC`
      );

      return result.rows.map((row) => ({
        privyUserId: row.privy_user_id,
        bearerToken: row.bearer_token,
        createdAt: row.created_at,
        issuedAt: row.issued_at,
      }));
    } catch (err) {
      logger.error('Failed to list tokens from DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (canUseFileBackend()) {
    return listTokensFromFile();
  }

  return [];
}

/**
 * Delete a bearer token (for revocation/logout).
 */
export async function deleteBearerToken(privyUserId: string): Promise<void> {
  if (!fileBackendUsed && pool) {
    try {
      await pool.query(`DELETE FROM bearer_tokens WHERE privy_user_id = $1`, [privyUserId]);
      return;
    } catch (err) {
      logger.error('Failed to delete token from DB', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (canUseFileBackend()) {
    deleteTokenFromFile(privyUserId);
  }
}

// ============================================================================
// File Backend (Fallback for Local Development)
// ============================================================================

function getDataDir(): string {
  if (process.env['LAMBDA_TASK_ROOT'] || process.env['RAILWAY_ENVIRONMENT']) {
    return process.env['DATA_DIR'] || '/tmp/sophia';
  }
  return join(process.cwd(), 'data');
}

function storeTokenToFile(record: BearerTokenRecord): void {
  try {
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    const filePath = join(dataDir, 'bearer_tokens.json');
    let records: BearerTokenRecord[] = [];

    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf8');
      records = JSON.parse(data || '[]');
    }

    const index = records.findIndex((r) => r.privyUserId === record.privyUserId);
    if (index >= 0) {
      records[index] = record;
    } else {
      records.push(record);
    }

    writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to store token to file', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function getTokenFromFile(privyUserId: string): BearerTokenRecord | null {
  try {
    const dataDir = getDataDir();
    const filePath = join(dataDir, 'bearer_tokens.json');

    if (!existsSync(filePath)) return null;

    const data = readFileSync(filePath, 'utf8');
    const records = JSON.parse(data || '[]') as BearerTokenRecord[];
    return records.find((r) => r.privyUserId === privyUserId) || null;
  } catch (err) {
    logger.error('Failed to read token from file', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function listTokensFromFile(): BearerTokenRecord[] {
  try {
    const dataDir = getDataDir();
    const filePath = join(dataDir, 'bearer_tokens.json');

    if (!existsSync(filePath)) return [];

    const data = readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]') as BearerTokenRecord[];
  } catch (err) {
    logger.error('Failed to list tokens from file', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

function deleteTokenFromFile(privyUserId: string): void {
  try {
    const dataDir = getDataDir();
    const filePath = join(dataDir, 'bearer_tokens.json');

    if (!existsSync(filePath)) return;

    const data = readFileSync(filePath, 'utf8');
    let records = JSON.parse(data || '[]') as BearerTokenRecord[];
    records = records.filter((r) => r.privyUserId !== privyUserId);

    writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    logger.error('Failed to delete token from file', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function extractPrivyUserIdFromToken(token: string): string | null {
  // Format: bearer_<privy_user_id>_<random>
  const parts = token.split('_');
  if (parts.length < 3 || parts[0] !== 'bearer') return null;
  return parts.slice(1, -1).join('_');
}

/**
 * Initialize the backend (call on server startup).
 */
export async function initializeBearerTokenStore(): Promise<void> {
  await initializeBackend();
}

/**
 * Close database connection gracefully (call on server shutdown).
 */
export async function closeBearerTokenStore(): Promise<void> {
  if (pool) {
    await pool.end();
    logger.info('Closed database connection');
  }
}
