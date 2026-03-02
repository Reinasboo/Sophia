/**
 * Wallet Binder
 *
 * Handles the creation and binding of wallets to external (BYOA) agents.
 * Each external agent receives exactly ONE dedicated wallet.
 * The wallet is created via the existing WalletManager — no signing
 * logic is duplicated or modified.
 *
 * SECURITY:
 * - Enforces 1-wallet-per-agent invariant
 * - Never exposes private key material
 * - Returns only public wallet information
 */

import { createLogger } from '../utils/logger.js';
import { Result, success, failure, WalletInfo } from '../utils/types.js';
import { getWalletManager, WalletManager } from '../wallet/index.js';
import { getAgentRegistry, AgentRegistry } from './agentRegistry.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('BYOA_BINDER');

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface WalletBindingResult {
  readonly agentId: string;
  readonly walletId: string;
  readonly walletPublicKey: string;
}

// ────────────────────────────────────────────
// Wallet Binder
// ────────────────────────────────────────────

export class WalletBinder {
  private walletManager: WalletManager;
  private registry: AgentRegistry;

  /** Reverse lookup: walletId → agentId (ensures no wallet is shared) */
  private walletToAgent: Map<string, string> = new Map();

  constructor() {
    this.walletManager = getWalletManager();
    this.registry = getAgentRegistry();
    this.loadFromStore();
  }

  // ── Persistence ──────────────────────────

  private saveToStore(): void {
    saveState('byoa-binder', { walletToAgent: Object.fromEntries(this.walletToAgent) });
  }

  private loadFromStore(): void {
    interface SavedBinder { walletToAgent: Record<string, string> }
    const saved = loadState<SavedBinder>('byoa-binder');
    if (!saved?.walletToAgent) return;
    for (const [walletId, agentId] of Object.entries(saved.walletToAgent)) {
      this.walletToAgent.set(walletId, agentId);
    }
    logger.info('WalletBinder map restored from disk', { count: this.walletToAgent.size });
  }

  /**
   * Create a new wallet and bind it to the given external agent.
   * This is typically called immediately after registration.
   */
  bindNewWallet(agentId: string): Result<WalletBindingResult, Error> {
    // Verify agent exists
    const agentResult = this.registry.getAgent(agentId);
    if (!agentResult.ok) {
      return failure(agentResult.error);
    }

    const agent = agentResult.value;

    // Enforce 1-wallet-per-agent
    if (agent.walletId) {
      return failure(new Error(`Agent "${agent.name}" already has a bound wallet: ${agent.walletId}`));
    }

    // Create wallet via existing manager (key generation + encryption inside)
    const walletResult = this.walletManager.createWallet(`byoa:${agent.name}`);
    if (!walletResult.ok) {
      logger.error('Failed to create wallet for external agent', {
        agentId,
        error: walletResult.error.message,
      });
      return failure(walletResult.error);
    }

    const wallet = walletResult.value;

    // Bind wallet → agent in registry
    const bindResult = this.registry.bindWallet(agentId, wallet.id, wallet.publicKey);
    if (!bindResult.ok) {
      // Best-effort cleanup — delete the orphan wallet
      this.walletManager.deleteWallet(wallet.id);
      return failure(bindResult.error);
    }

    // Record reverse mapping
    this.walletToAgent.set(wallet.id, agentId);
    this.saveToStore();

    logger.info('Wallet bound to external agent', {
      agentId,
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
    });

    return success({
      agentId,
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
    });
  }

  /**
   * Look up the external agent that owns a given wallet.
   */
  getAgentForWallet(walletId: string): string | undefined {
    return this.walletToAgent.get(walletId);
  }

  /**
   * Look up the wallet info for an external agent.
   */
  getWalletForAgent(agentId: string): Result<WalletInfo, Error> {
    const agentResult = this.registry.getAgent(agentId);
    if (!agentResult.ok) {
      return failure(agentResult.error);
    }
    const agent = agentResult.value;
    if (!agent.walletId) {
      return failure(new Error(`Agent "${agent.name}" has no bound wallet`));
    }
    return this.walletManager.getWallet(agent.walletId);
  }
}

// ── Singleton ──────────────────────────────

let binderInstance: WalletBinder | null = null;

export function getWalletBinder(): WalletBinder {
  if (!binderInstance) {
    binderInstance = new WalletBinder();
  }
  return binderInstance;
}
