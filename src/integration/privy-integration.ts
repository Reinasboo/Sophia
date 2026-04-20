/**
 * Privy Integration - Phase 1 (Type Stubs)
 *
 * ROADMAP:
 * - Phase 1 (Current): Type definitions + module stubs
 * - Phase 2 (May): Install @privy-io/server-auth + full implementation
 * - Phase 3 (June): Wallet policies + webhooks
 *
 * DO NOT use this in production yet. Phase 2 will implement real Privy SDK integration.
 */

import { getTenantDatabase } from './tenant-database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PRIVY_INTEGRATION');

/**
 * Privy user info (simplified)
 */
export interface PrivyUserInfo {
  id: string;
  email?: string;
  walletAddress?: string;
  linkedAccounts: Array<{ type: string; address?: string }>;
}

/**
 * Verify Privy access token
 * TODO: Install @privy-io/server-auth in Phase 2
 */
export async function verifyPrivyToken(accessToken: string): Promise<PrivyUserInfo | null> {
  logger.warn('Privy token verification not yet implemented (Phase 2)');
  // TODO: Implement with @privy-io/server-auth SDK
  return null;
}

/**
 * Create or retrieve tenant for Privy user
 */
export async function getOrCreateTenantForPrivyUser(privyUserInfo: PrivyUserInfo): Promise<{
  tenantId: string;
  apiKey: string;
}> {
  const tenantDb = getTenantDatabase();

  // Try to find existing tenant
  let tenant = tenantDb.getTenant(privyUserInfo.id);

  if (!tenant) {
    // Create new tenant
    const label = privyUserInfo.email ?? `Privy User ${privyUserInfo.id.slice(0, 8)}`;
    tenant = tenantDb.createTenant(label, privyUserInfo.walletAddress, {
      privyUserId: privyUserInfo.id,
      linkedAccounts: privyUserInfo.linkedAccounts,
    });

    logger.info(`Created tenant for Privy user`, {
      tenantId: tenant.id,
      privyUserId: privyUserInfo.id,
    });
  }

  // Issue API token
  const token = tenantDb.issueApiToken(tenant.id, 'Privy Auth', 30);

  if (!token) {
    throw new Error(`Failed to issue API token for tenant ${tenant.id}`);
  }

  return {
    tenantId: tenant.id,
    apiKey: token.apiKey,
  };
}

logger.info('Privy integration loaded (Phase 1: type stubs, install SDK in Phase 2)');
