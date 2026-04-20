/**
 * Multi-Tenant Wallet Manager - Phase 1 (Architecture)
 *
 * ROADMAP:
 * - Phase 1 (Current): Architecture + type definitions
 * - Phase 2 (May): Tenant-scoped wallet encryption + storage
 * - Phase 3 (June): Privy integration (replace with Privy wallets)
 *
 * Currently shows where multi-tenant wallet isolation will go.
 * For MVP, all tenants share WalletManager (upgrade in Phase 2).
 */

import type { WalletInfo } from '../types/internal.js';
import type { Result } from '../types/shared.js';
import { WalletManager } from './wallet-manager.js';
import { createLogger } from '../utils/logger.js';
import { success, failure } from '../types/shared.js';

const logger = createLogger('MULTI_TENANT_WALLET');

/**
 * Multi-Tenant Wallet Manager - Placeholder
 *
 * Phase 1: Shares single WalletManager across tenants (monolithic)
 * Phase 2: Will isolate wallets per tenant with tenant-specific encryption
 */
export class MultiTenantWalletManager {
  private sharedWalletManager: WalletManager;

  constructor() {
    this.sharedWalletManager = new WalletManager();
    logger.info('Multi-Tenant Wallet Manager initialized (Phase 1: shared model)');
  }

  /**
   * Get WalletManager for tenant
   *
   * Phase 1: Returns shared instance
   * Phase 2: Will return tenant-specific instance with separate encryption
   */
  getWalletManager(_tenantId: string): WalletManager {
    // TODO Phase 2: Implement per-tenant encryption keys
    return this.sharedWalletManager;
  }

  /**
   * Create wallet for tenant
   */
  createWalletForTenant(tenantId: string, label?: string): Result<WalletInfo, Error> {
    try {
      logger.info(`Creating wallet for tenant`, { tenantId, label });
      const walletMgr = this.getWalletManager(tenantId);
      return walletMgr.createWallet(label);
    } catch (error) {
      return failure(error as Error);
    }
  }

  /**
   * List wallets for tenant
   */
  getWalletsByTenant(_tenantId: string): WalletInfo[] {
    return this.sharedWalletManager.getAllWallets();
  }

  /**
   * Delete wallet for tenant
   */
  deleteWalletForTenant(tenantId: string, walletId: string): Result<void, Error> {
    try {
      logger.info(`Deleting wallet for tenant`, { tenantId, walletId });
      const walletMgr = this.getWalletManager(tenantId);
      walletMgr.deleteWallet(walletId);
      return success(undefined);
    } catch (error) {
      return failure(error as Error);
    }
  }

  /**
   * Get active tenant count
   */
  getActiveTenantCount(): number {
    return 1; // Placeholder
  }

  /**
   * Get active tenant IDs
   */
  getActiveTenantIds(): string[] {
    return [];
  }

  /**
   * Unload tenant session
   */
  unloadTenantSession(_tenantId: string): void {
    // Placeholder
  }

  /**
   * Unload all tenants
   */
  unloadAllTenantSessions(): void {
    logger.info('Unloaded all tenant sessions');
  }
}

let instance: MultiTenantWalletManager | null = null;

export function getMultiTenantWalletManager(): MultiTenantWalletManager {
  if (!instance) {
    instance = new MultiTenantWalletManager();
  }
  return instance;
}
