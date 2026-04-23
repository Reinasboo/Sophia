/**
 * Wallet Module Exports
 *
 * This module provides secure wallet operations with a strict API boundary.
 * Private keys are NEVER exported from this module.
 */

export { WalletManager, getWalletManager } from './wallet-manager.js';
export { ServicePolicyManager, getServicePolicyManager } from './service-policy-manager.js';

// ─── Multi-Tenant (Phase 1) ──────────────────────────────────────────────────
export {
  MultiTenantWalletManager,
  getMultiTenantWalletManager,
} from './multi-tenant-wallet-manager.js';
