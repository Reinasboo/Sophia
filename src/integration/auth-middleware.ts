/**
 * Authentication Middleware - Phase 1 (Architecture)
 *
 * ROADMAP:
 * - Phase 1 (Current): Type definitions + routing concept
 * - Phase 2 (May): Full Express middleware implementation
 * - Phase 3 (June): OAuth2 + JWT tokens
 *
 * For now, this file documents the auth architecture without Express dependencies.
 */

import type { TenantContext } from '../types/tenant.js';
import { getTenantDatabase } from './tenant-database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AUTH');

/**
 * Verify tenant API token and extract context
 *
 * USAGE (will be middleware in Phase 2):
 * ```typescript
 * const token = req.headers.authorization?.replace('Bearer ', '');
 * const context = verifyTenantToken(token);
 * if (!context) return res.status(401).json({ error: 'Unauthorized' });
 * ```
 */
export function verifyTenantToken(apiKey: string | undefined): TenantContext | null {
  if (!apiKey) {
    logger.warn('Missing API token');
    return null;
  }

  const tenantDb = getTenantDatabase();
  const tenant = tenantDb.verifyApiToken(apiKey);

  if (!tenant) {
    logger.warn('Invalid API token');
    return null;
  }

  return {
    tenantId: tenant.id,
    apiKey,
  };
}

/**
 * Helper to extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return undefined;

  return match[1];
}

logger.info('Auth middleware loaded (Phase 1: type definitions only)');
