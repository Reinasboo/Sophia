/**
 * Rate Limiter
 *
 * Implements per-wallet transaction rate limiting and RPC budget management.
 * Prevents:
 * - RPC provider rate limit violations
 * - Single wallet/agent from spamming transactions
 * - Self-inflicted DDoS
 */

import { createLogger } from './logger.js';

const logger = createLogger('RATE_LIMITER');

/**
 * Represents transaction quota usage for a wallet
 */
interface WalletQuota {
  maxTransactionsPerMinute: number;
  currentCount: number;
  windowStartMs: number;
  blockedUntilMs: number;
}

/**
 * Global RPC budget tracking
 */
interface RpcBudget {
  callsPerMinute: number;
  currentCount: number;
  windowStartMs: number;
  blockedUntilMs: number;
}

/**
 * Rate Limiter for transaction orchestration
 *
 * Implements token bucket algorithm:
 * - Each wallet gets X transactions per minute
 * - RPC layer gets global budget
 * - Requests rejected if either limit exceeded
 * - Counters reset on window expiry
 */
export class RateLimiter {
  private walletQuotas: Map<string, WalletQuota> = new Map();
  private rpcBudget: RpcBudget;
  private readonly rpcCallsPerMinute: number;
  private readonly agentTransactionsPerMinute: number;

  constructor(
    rpcCallsPerMinute: number = 1200, // Conservative estimate for most RPC providers
    agentTransactionsPerMinute: number = 30 // Per agent/wallet
  ) {
    this.rpcCallsPerMinute = rpcCallsPerMinute;
    this.agentTransactionsPerMinute = agentTransactionsPerMinute;

    this.rpcBudget = {
      callsPerMinute: rpcCallsPerMinute,
      currentCount: 0,
      windowStartMs: Date.now(),
      blockedUntilMs: 0,
    };

    logger.info('Rate limiter initialized', {
      rpcCallsPerMinute,
      agentTransactionsPerMinute,
    });
  }

  /**
   * Check if RPC is currently rate-limited
   */
  isRpcBlocked(): boolean {
    const now = Date.now();

    if (this.rpcBudget.blockedUntilMs > now) {
      return true;
    }

    // Reset window if expired
    if (now - this.rpcBudget.windowStartMs >= 60_000) {
      this.rpcBudget.currentCount = 0;
      this.rpcBudget.windowStartMs = now;
      this.rpcBudget.blockedUntilMs = 0;
      return false;
    }

    // Check if budget exhausted
    if (this.rpcBudget.currentCount >= this.rpcBudget.callsPerMinute) {
      // Block until next window
      const msUntilReset = 60_000 - (now - this.rpcBudget.windowStartMs);
      this.rpcBudget.blockedUntilMs = now + msUntilReset;
      return true;
    }

    return false;
  }

  /**
   * Check if a wallet can submit a transaction
   */
  canSubmitTransaction(walletAddress: string): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
  } {
    const now = Date.now();

    // Check RPC budget first
    if (this.isRpcBlocked()) {
      const retryAfterMs = Math.max(this.rpcBudget.blockedUntilMs - now, 100);
      logger.warn('RPC rate limit blocking wallet', {
        wallet: walletAddress,
        retryAfterMs,
      });
      return {
        allowed: false,
        reason: 'RPC rate limit exceeded, try again later',
        retryAfterMs,
      };
    }

    // Get or create wallet quota
    let quota = this.walletQuotas.get(walletAddress);

    if (!quota) {
      quota = {
        maxTransactionsPerMinute: this.agentTransactionsPerMinute,
        currentCount: 0,
        windowStartMs: now,
        blockedUntilMs: 0,
      };
      this.walletQuotas.set(walletAddress, quota);
    }

    // Reset window if expired
    if (now - quota.windowStartMs >= 60_000) {
      quota.currentCount = 0;
      quota.windowStartMs = now;
      quota.blockedUntilMs = 0;
    }

    // Check if wallet is blocked
    if (quota.blockedUntilMs > now) {
      const retryAfterMs = Math.max(quota.blockedUntilMs - now, 100);
      logger.warn('Wallet rate limit active', {
        wallet: walletAddress,
        retryAfterMs,
      });
      return {
        allowed: false,
        reason: 'Wallet rate limit exceeded',
        retryAfterMs,
      };
    }

    // Check if quota exceeded
    if (quota.currentCount >= quota.maxTransactionsPerMinute) {
      // Block wallet until next window
      const msUntilReset = 60_000 - (now - quota.windowStartMs);
      quota.blockedUntilMs = now + msUntilReset;

      logger.warn('Wallet quota exhausted', {
        wallet: walletAddress,
        quota: quota.maxTransactionsPerMinute,
        used: quota.currentCount,
      });

      return {
        allowed: false,
        reason: `Wallet limit exhausted (${quota.maxTransactionsPerMinute} transactions/min)`,
        retryAfterMs: Math.ceil(msUntilReset / 1000) * 1000,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a transaction submission (call this after successful submission)
   */
  recordTransaction(walletAddress: string): void {
    let quota = this.walletQuotas.get(walletAddress);

    if (!quota) {
      quota = {
        maxTransactionsPerMinute: this.agentTransactionsPerMinute,
        currentCount: 1,
        windowStartMs: Date.now(),
        blockedUntilMs: 0,
      };
      this.walletQuotas.set(walletAddress, quota);
      return;
    }

    quota.currentCount++;

    logger.debug('Transaction recorded', {
      wallet: walletAddress,
      count: quota.currentCount,
      max: quota.maxTransactionsPerMinute,
    });
  }

  /**
   * Record an RPC call (for budget tracking)
   */
  recordRpcCall(): void {
    const now = Date.now();

    // Reset window if expired
    if (now - this.rpcBudget.windowStartMs >= 60_000) {
      this.rpcBudget.currentCount = 0;
      this.rpcBudget.windowStartMs = now;
      this.rpcBudget.blockedUntilMs = 0;
    }

    this.rpcBudget.currentCount++;

    // Log warning if approaching limit (80% utilization)
    const utilization = this.rpcBudget.currentCount / this.rpcBudget.callsPerMinute;
    if (utilization > 0.8) {
      logger.warn('RPC budget utilization high', {
        used: this.rpcBudget.currentCount,
        limit: this.rpcBudget.callsPerMinute,
        utilization: (utilization * 100).toFixed(1) + '%',
      });
    }

    logger.debug('RPC call recorded', {
      count: this.rpcBudget.currentCount,
      max: this.rpcBudget.callsPerMinute,
    });
  }

  /**
   * Get current RPC utilization (0.0 to 1.0)
   */
  getRpcUtilization(): number {
    const now = Date.now();

    // Reset window if expired
    if (now - this.rpcBudget.windowStartMs >= 60_000) {
      this.rpcBudget.currentCount = 0;
      this.rpcBudget.windowStartMs = now;
    }

    return this.rpcBudget.currentCount / this.rpcBudget.callsPerMinute;
  }

  /**
   * Get wallet utilization (0.0 to 1.0)
   */
  getWalletUtilization(walletAddress: string): number {
    const quota = this.walletQuotas.get(walletAddress);
    if (!quota) return 0;

    const now = Date.now();
    if (now - quota.windowStartMs >= 60_000) {
      return 0;
    }

    return quota.currentCount / quota.maxTransactionsPerMinute;
  }

  /**
   * Get all wallet stats (for monitoring)
   */
  getWalletStats(): Record<
    string,
    {
      used: number;
      max: number;
      utilization: number;
      blocked: boolean;
    }
  > {
    const stats: Record<
      string,
      {
        used: number;
        max: number;
        utilization: number;
        blocked: boolean;
      }
    > = {};

    const now = Date.now();

    for (const [wallet, quota] of this.walletQuotas.entries()) {
      // Reset window if expired
      if (now - quota.windowStartMs >= 60_000) {
        quota.currentCount = 0;
        quota.windowStartMs = now;
        quota.blockedUntilMs = 0;
      }

      stats[wallet] = {
        used: quota.currentCount,
        max: quota.maxTransactionsPerMinute,
        utilization: quota.currentCount / quota.maxTransactionsPerMinute,
        blocked: quota.blockedUntilMs > now,
      };
    }

    return stats;
  }

  /**
   * Get RPC stats (for monitoring dashboard)
   */
  getRpcStats(): {
    used: number;
    max: number;
    utilization: number;
    blocked: boolean;
  } {
    const now = Date.now();

    if (now - this.rpcBudget.windowStartMs >= 60_000) {
      this.rpcBudget.currentCount = 0;
      this.rpcBudget.windowStartMs = now;
      this.rpcBudget.blockedUntilMs = 0;
    }

    return {
      used: this.rpcBudget.currentCount,
      max: this.rpcBudget.callsPerMinute,
      utilization: this.rpcBudget.currentCount / this.rpcBudget.callsPerMinute,
      blocked: this.rpcBudget.blockedUntilMs > now,
    };
  }

  /**
   * Get wallet quota limits
   */
  setWalletQuotaLimit(walletAddress: string, maxTransactionsPerMinute: number): void {
    let quota = this.walletQuotas.get(walletAddress);

    if (!quota) {
      quota = {
        maxTransactionsPerMinute,
        currentCount: 0,
        windowStartMs: Date.now(),
        blockedUntilMs: 0,
      };
      this.walletQuotas.set(walletAddress, quota);
    } else {
      quota.maxTransactionsPerMinute = maxTransactionsPerMinute;
    }

    logger.info('Wallet quota limit updated', {
      wallet: walletAddress,
      maxTransactionsPerMinute,
    });
  }

  /**
   * Clear all rate limiting data (for testing)
   */
  reset(): void {
    this.walletQuotas.clear();
    this.rpcBudget = {
      callsPerMinute: this.rpcCallsPerMinute,
      currentCount: 0,
      windowStartMs: Date.now(),
      blockedUntilMs: 0,
    };
    logger.info('Rate limiter reset');
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

/**
 * Get or create global rate limiter
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Set global rate limiter (for testing)
 */
export function setRateLimiter(limiter: RateLimiter): void {
  rateLimiterInstance = limiter;
}
