/**
 * Wallet Manager
 *
 * SECURITY-CRITICAL: This module handles private key generation and storage.
 * Private keys are:
 * - Generated securely using Solana's Keypair
 * - Encrypted immediately after generation
 * - Never exposed outside this module
 * - Only decrypted momentarily for signing
 */

import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  WalletInfo,
  InternalWallet,
  Result,
  success,
  failure,
  Policy,
  DEFAULT_POLICY,
  Intent,
} from '../types/index.js';
import { encrypt, decrypt, generateSecureId } from '../utils/encryption.js';
import { toError, notFoundError } from '../utils/error-helpers.js';
import {
  getConfig,
  ESTIMATED_SOL_TRANSFER_FEE,
  ESTIMATED_TOKEN_TRANSFER_FEE,
} from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('WALLET');

/**
 * WalletManager - Secure wallet operations
 *
 * This class provides a strict API boundary:
 * - Public methods return only public information
 * - Private keys never leave this class
 * - All signing happens internally
 */
export class WalletManager {
  private walletsByTenant: Map<string, Map<string, InternalWallet>> = new Map();
  private policies: Map<string, Policy> = new Map();
  private dailyTransfers: Map<string, number> = new Map();
  private encryptionSecret: string;
  private dailyResetTimer: NodeJS.Timeout | null = null;

  constructor() {
    const config = getConfig();
    this.encryptionSecret = config.KEY_ENCRYPTION_SECRET;
    this.loadFromStore();
    // Reset daily counters at midnight
    this.scheduleDailyReset();
  }

  /**
   * Cleanup: Cancel the daily reset timer (for graceful shutdown)
   */
  destroy(): void {
    if (this.dailyResetTimer) {
      clearTimeout(this.dailyResetTimer);
      this.dailyResetTimer = null;
      logger.info('Daily reset timer cancelled');
    }
  }

  private scheduleDailyReset(): void {
    // Cancel any existing timer
    if (this.dailyResetTimer) {
      clearTimeout(this.dailyResetTimer);
    }

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    this.dailyResetTimer = setTimeout(() => {
      this.dailyTransfers.clear();
      logger.info('Daily transfer counters reset');
      this.saveToStore(); // Persist the reset state
      this.dailyResetTimer = null;
      this.scheduleDailyReset();
    }, msUntilMidnight);
  }

  /**
   * Create a new wallet with encrypted key storage (tenant-scoped)
   * MULTI-TENANT: Wallets belong to a tenant
   */
  createWallet(label?: string, tenantId?: string): Result<WalletInfo, Error> {
    try {
      const keypair = Keypair.generate();
      const walletId = generateSecureId('wallet');

      // Encrypt the secret key immediately
      const encryptedSecretKey = encrypt(keypair.secretKey, this.encryptionSecret);

      const wallet: InternalWallet = {
        id: walletId,
        publicKey: keypair.publicKey.toBase58(),
        encryptedSecretKey,
        createdAt: new Date(),
        label,
      };

      // Store wallet in tenant bucket (or global if no tenant)
      const effectiveTenantId = tenantId || '__global__';
      if (!this.walletsByTenant.has(effectiveTenantId)) {
        this.walletsByTenant.set(effectiveTenantId, new Map());
      }
      this.walletsByTenant.get(effectiveTenantId)!.set(walletId, wallet);

      this.policies.set(walletId, { ...DEFAULT_POLICY });
      this.dailyTransfers.set(walletId, 0);

      logger.info('Wallet created', {
        walletId,
        publicKey: wallet.publicKey,
        label,
        tenantId: effectiveTenantId,
      });

      this.saveToStore();
      // Return only public information
      return success(this.toWalletInfo(wallet));
    } catch (error) {
      const err = toError(error);
      logger.error('Failed to create wallet', { error: err.message });
      return failure(err);
    }
  }

  /**
   * MULTI-TENANT: Find wallet by ID (searches across all tenants)
   * Returns the wallet if found, null otherwise
   */
  private findWallet(walletId: string): InternalWallet | null {
    for (const tenantBucket of this.walletsByTenant.values()) {
      const wallet = tenantBucket.get(walletId);
      if (wallet) {
        return wallet;
      }
    }
    return null;
  }

  /**
   * Get all wallet IDs for a tenant
   * MULTI-TENANT: Used to filter transactions/operations by tenant
   */
  getWalletIdsByTenant(tenantId: string): string[] {
    const tenantBucket = this.walletsByTenant.get(tenantId);
    if (!tenantBucket) return [];
    return Array.from(tenantBucket.keys());
  }

  /**
   * Get wallet info by ID
   */
  getWallet(walletId: string): Result<WalletInfo, Error> {
    const wallet = this.findWallet(walletId);

    if (!wallet) {
      return failure(notFoundError('Wallet', walletId));
    }

    return success(this.toWalletInfo(wallet));
  }

  /**
   * Get all wallets (public info only)
   * MULTI-TENANT: Optional tenantId filter
   */
  getAllWallets(tenantId?: string): WalletInfo[] {
    if (tenantId) {
      const tenantBucket = this.walletsByTenant.get(tenantId) || new Map();
      return Array.from(tenantBucket.values()).map((w) => this.toWalletInfo(w));
    }
    // Return all wallets across all tenants (legacy behavior, usually for admin)
    let allWallets: InternalWallet[] = [];
    for (const tenantBucket of this.walletsByTenant.values()) {
      allWallets = allWallets.concat(Array.from(tenantBucket.values()));
    }
    return allWallets.map((w) => this.toWalletInfo(w));
  }

  /**
   * Get wallet public key
   */
  getPublicKey(walletId: string): Result<PublicKey, Error> {
    const wallet = this.findWallet(walletId);

    if (!wallet) {
      return failure(notFoundError('Wallet', walletId));
    }

    try {
      return success(new PublicKey(wallet.publicKey));
    } catch (error) {
      return failure(toError(error));
    }
  }

  /**
   * Sign a transaction
   *
   * SECURITY: This is the only place where private keys are decrypted.
   * The key is decrypted, used to sign, and then discarded.
   */
  signTransaction(
    walletId: string,
    transaction: Transaction | VersionedTransaction
  ): Result<Transaction | VersionedTransaction, Error> {
    const wallet = this.findWallet(walletId);

    if (!wallet) {
      return failure(notFoundError('Wallet', walletId));
    }

    try {
      // Decrypt the secret key momentarily
      const secretKey = decrypt(wallet.encryptedSecretKey, this.encryptionSecret);
      const keypair = Keypair.fromSecretKey(secretKey);

      // Sign the transaction
      if (transaction instanceof Transaction) {
        transaction.partialSign(keypair);
      } else {
        transaction.sign([keypair]);
      }

      // Zero out private key material from memory
      secretKey.fill(0);

      logger.debug('Transaction signed', { walletId });

      // Return the signed transaction
      return success(transaction);
    } catch (error) {
      logger.error('Failed to sign transaction', {
        walletId,
        error: toError(error).message,
      });
      return failure(toError(error));
    }
  }

  /**
   * Validate an intent against the wallet's policy
   */
  validateIntent(walletId: string, intent: Intent, currentBalance: number): Result<true, Error> {
    const policy = this.policies.get(walletId);

    if (!policy) {
      return failure(new Error(`No policy found for wallet: ${walletId}`));
    }

    const dailyCount = this.dailyTransfers.get(walletId) ?? 0;

    // Autonomous intents still enforce basic safety guardrails:
    // - Max transfer amount (prevents single-intent wallet drain)
    // - Minimum balance requirement (keeps wallet operational)
    // - Daily transfer count limit (autonomous gets 2x normal allowance)
    // Everything is still logged via intent history and transaction events.
    if (intent.type === 'autonomous') {
      logger.info('Autonomous intent — limited policy check', {
        walletId,
        action: (intent as import('../utils/types.js').AutonomousIntent).action,
      });

      // Enforce daily transfer limit (autonomous gets 2x normal allowance)
      if (dailyCount >= policy.maxDailyTransfers * 2) {
        return failure(
          new Error(
            `Autonomous intent: daily transfer limit reached (${dailyCount}/${policy.maxDailyTransfers * 2})`
          )
        );
      }

      // Enforce max transfer amount for SOL transfers
      const autonomousIntent = intent as import('../utils/types.js').AutonomousIntent;
      const action = autonomousIntent.action;
      if (action === 'transfer_sol' || action === 'transfer_token') {
        // Safely extract amount from params (Record<string, unknown>)
        const amount: unknown = autonomousIntent.params['amount'];
        if (typeof amount === 'number' && amount > policy.maxTransferAmount * 2) {
          return failure(
            new Error(
              `Autonomous transfer amount ${amount} exceeds safety cap (${policy.maxTransferAmount * 2} SOL)`
            )
          );
        }
      }

      // Enforce minimum balance (0.05 SOL reserve for autonomous)
      const minReserve = Math.max(policy.requireMinBalance, 0.05);
      if (currentBalance < minReserve) {
        return failure(
          new Error(
            `Autonomous intent: wallet balance (${currentBalance} SOL) below safety reserve (${minReserve} SOL)`
          )
        );
      }

      return success(true);
    }

    // Check daily transfer limit (standard agents)
    if (dailyCount >= policy.maxDailyTransfers) {
      return failure(new Error('Daily transfer limit exceeded'));
    }

    // Validate based on intent type
    if (intent.type === 'transfer_sol') {
      // Check max transfer amount
      if (intent.amount > policy.maxTransferAmount) {
        return failure(
          new Error(`Transfer amount ${intent.amount} exceeds max ${policy.maxTransferAmount}`)
        );
      }

      // Check minimum balance requirement
      const balanceAfterTransfer = currentBalance - intent.amount - ESTIMATED_SOL_TRANSFER_FEE;
      if (balanceAfterTransfer < policy.requireMinBalance) {
        return failure(
          new Error(`Transfer would leave balance below minimum (${policy.requireMinBalance} SOL)`)
        );
      }

      // Check allowed/blocked recipients
      if (policy.allowedRecipients && !policy.allowedRecipients.includes(intent.recipient)) {
        return failure(new Error('Recipient not in allowed list'));
      }

      if (policy.blockedRecipients?.includes(intent.recipient)) {
        return failure(new Error('Recipient is blocked'));
      }
    }

    if (intent.type === 'transfer_token') {
      // Token transfers still need SOL for fees; enforce minimum balance
      const balanceAfterFees = currentBalance - ESTIMATED_TOKEN_TRANSFER_FEE;
      if (balanceAfterFees < policy.requireMinBalance) {
        return failure(
          new Error(
            `Insufficient SOL for token transfer fees (min ${policy.requireMinBalance} SOL)`
          )
        );
      }

      // Validate recipient
      if (policy.allowedRecipients && !policy.allowedRecipients.includes(intent.recipient)) {
        return failure(new Error('Recipient not in allowed list'));
      }

      if (policy.blockedRecipients?.includes(intent.recipient)) {
        return failure(new Error('Recipient is blocked'));
      }

      // Validate amount
      if (intent.amount <= 0) {
        return failure(new Error('Token transfer amount must be positive'));
      }
    }

    return success(true);
  }

  /**
   * Increment daily transfer count for a wallet
   */
  recordTransfer(walletId: string): void {
    const current = this.dailyTransfers.get(walletId) ?? 0;
    this.dailyTransfers.set(walletId, current + 1);
  }

  /**
   * Update wallet policy
   */
  updatePolicy(walletId: string, policy: Partial<Policy>): Result<Policy, Error> {
    const currentPolicy = this.policies.get(walletId);

    if (!currentPolicy) {
      return failure(new Error(`Wallet not found: ${walletId}`));
    }

    const newPolicy = { ...currentPolicy, ...policy };
    this.policies.set(walletId, newPolicy);

    logger.info('Policy updated', { walletId, policy: newPolicy });

    this.saveToStore();
    return success(newPolicy);
  }

  /**
   * Get wallet policy
   */
  getPolicy(walletId: string): Result<Policy, Error> {
    const policy = this.policies.get(walletId);

    if (!policy) {
      return failure(new Error(`Policy not found for wallet: ${walletId}`));
    }

    return success(policy);
  }

  /**
   * Delete a wallet (removes from memory)
   * MULTI-TENANT: Optional tenantId for scoped deletion
   */
  deleteWallet(walletId: string, tenantId?: string): Result<true, Error> {
    const effectiveTenantId = tenantId || '__global__';
    const tenantBucket = this.walletsByTenant.get(effectiveTenantId);

    if (!tenantBucket || !tenantBucket.has(walletId)) {
      return failure(new Error(`Wallet not found: ${walletId}`));
    }

    tenantBucket.delete(walletId);
    this.policies.delete(walletId);
    this.dailyTransfers.delete(walletId);

    logger.info('Wallet deleted', { walletId, tenantId: effectiveTenantId });

    this.saveToStore();
    return success(true);
  }

  /**
   * Convert internal wallet to public wallet info
   */
  private toWalletInfo(wallet: InternalWallet): WalletInfo {
    return {
      id: wallet.id,
      publicKey: wallet.publicKey,
      createdAt: wallet.createdAt,
      label: wallet.label,
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private saveToStore(): void {
    // Flatten tenant structure for storage
    const walletsArr: Array<InternalWallet & { tenantId: string }> = [];
    for (const [tenantId, wallets] of this.walletsByTenant.entries()) {
      for (const wallet of wallets.values()) {
        walletsArr.push({ ...wallet, tenantId });
      }
    }

    const policiesObj: Record<string, Policy> = {};
    for (const [id, policy] of this.policies.entries()) {
      policiesObj[id] = policy;
    }
    saveState('wallets', { wallets: walletsArr, policies: policiesObj });
  }

  private loadFromStore(): void {
    const saved = loadState<{
      wallets: Array<InternalWallet & { tenantId?: string }>;
      policies: Record<string, Policy>;
    }>('wallets');
    if (!saved) return;

    let loaded = 0;
    for (const w of saved.wallets) {
      const wallet: InternalWallet = {
        id: w.id,
        publicKey: w.publicKey,
        encryptedSecretKey: w.encryptedSecretKey,
        createdAt: new Date(w.createdAt),
        label: w.label,
      };
      const tenantId = w.tenantId || '__global__';
      if (!this.walletsByTenant.has(tenantId)) {
        this.walletsByTenant.set(tenantId, new Map());
      }
      this.walletsByTenant.get(tenantId)!.set(wallet.id, wallet);
      this.policies.set(wallet.id, saved.policies[wallet.id] ?? { ...DEFAULT_POLICY });
      this.dailyTransfers.set(wallet.id, 0);
      loaded++;
    }
    if (loaded > 0) {
      logger.info('Wallets restored from disk', { count: loaded });
    }
  }
}

// Singleton instance
let walletManagerInstance: WalletManager | null = null;

export function getWalletManager(): WalletManager {
  if (!walletManagerInstance) {
    walletManagerInstance = new WalletManager();
  }
  return walletManagerInstance;
}
