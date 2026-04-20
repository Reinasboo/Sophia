/**
 * Agent Context Cache
 *
 * Caches frequently-accessed agent context data to reduce RPC calls:
 * - Balance queries (TTL 5-10s)
 * - Token metadata (indefinite, invalidate on update)
 * - Transaction history (TTL 30s)
 *
 * Reduces RPC budget consumption during agent decision cycles.
 */

import { createLogger } from './logger.js';
import type { BalanceInfo, TokenBalance } from '../types/index.js';

const logger = createLogger('CACHE');

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

interface CachedBalance {
  balance: BalanceInfo;
  tokenBalances: TokenBalance[];
}

interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
}

/**
 * Agent Context Cache with per-wallet storage and TTL management
 */
export class AgentContextCache {
  private balanceCache: Map<string, CacheEntry<CachedBalance>> = new Map();
  private tokenMetadataCache: Map<string, CacheEntry<TokenBalance>> = new Map();
  private transactionCache: Map<string, CacheEntry<string[]>> = new Map();
  private stats: Map<string, CacheStats> = new Map();

  private readonly balanceTTLMs: number; // Balance cache TTL (5-10s)
  private readonly txHistoryTTLMs: number; // Transaction history TTL (30s)
  private readonly metadataRefreshMs: number; // Metadata refresh interval

  constructor(
    balanceTTLMs: number = 7_500, // 7.5 seconds default
    txHistoryTTLMs: number = 30_000, // 30 seconds default
    metadataRefreshMs: number = 3_600_000 // 1 hour default
  ) {
    this.balanceTTLMs = balanceTTLMs;
    this.txHistoryTTLMs = txHistoryTTLMs;
    this.metadataRefreshMs = metadataRefreshMs;

    logger.info('Agent context cache initialized', {
      balanceTTLMs,
      txHistoryTTLMs,
      metadataRefreshMs,
    });
  }

  /**
   * Get cached balance (or null if expired)
   */
  getBalance(walletAddress: string): CachedBalance | null {
    const key = walletAddress;
    const entry = this.balanceCache.get(key);

    if (!entry) {
      this.recordMiss(key);
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.balanceCache.delete(key);
      this.recordMiss(key);
      return null;
    }

    this.recordHit(key);
    return entry.value;
  }

  /**
   * Set balance in cache
   */
  setBalance(walletAddress: string, balance: BalanceInfo, tokenBalances: TokenBalance[]): void {
    const now = Date.now();
    const key = walletAddress;

    this.balanceCache.set(key, {
      value: { balance, tokenBalances },
      timestamp: now,
      expiresAt: now + this.balanceTTLMs,
    });

    logger.debug('Balance cached', {
      wallet: key,
      expiresInMs: this.balanceTTLMs,
    });
  }

  /**
   * Get cached transaction history (or null if expired)
   */
  getTransactionHistory(walletAddress: string): string[] | null {
    const key = walletAddress;
    const entry = this.transactionCache.get(key);

    if (!entry) {
      this.recordMiss(key);
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.transactionCache.delete(key);
      this.recordMiss(key);
      return null;
    }

    this.recordHit(key);
    return entry.value;
  }

  /**
   * Set transaction history in cache
   */
  setTransactionHistory(walletAddress: string, transactions: string[]): void {
    const now = Date.now();
    const key = walletAddress;

    this.transactionCache.set(key, {
      value: transactions,
      timestamp: now,
      expiresAt: now + this.txHistoryTTLMs,
    });

    logger.debug('Transaction history cached', {
      wallet: key,
      count: transactions.length,
      expiresInMs: this.txHistoryTTLMs,
    });
  }

  /**
   * Get cached token metadata
   */
  getTokenMetadata(mint: string): TokenBalance | null {
    const key = mint;
    const entry = this.tokenMetadataCache.get(key);

    if (!entry) {
      this.recordMiss(key);
      return null;
    }

    // Metadata doesn't expire by time, only by explicit invalidation
    this.recordHit(key);
    return entry.value;
  }

  /**
   * Set token metadata in cache (indefinite until invalidated)
   */
  setTokenMetadata(mint: string, metadata: TokenBalance): void {
    const now = Date.now();
    const key = mint;

    this.tokenMetadataCache.set(key, {
      value: metadata,
      timestamp: now,
      expiresAt: now + this.metadataRefreshMs, // Long TTL for metadata
    });

    logger.debug('Token metadata cached', {
      mint: key,
    });
  }

  /**
   * Invalidate balance cache for a wallet
   */
  invalidateBalance(walletAddress: string): void {
    this.balanceCache.delete(walletAddress);
    this.recordInvalidation(walletAddress);
    logger.debug('Balance cache invalidated', { wallet: walletAddress });
  }

  /**
   * Invalidate transaction cache for a wallet
   */
  invalidateTransactionHistory(walletAddress: string): void {
    this.transactionCache.delete(walletAddress);
    this.recordInvalidation(walletAddress);
    logger.debug('Transaction history cache invalidated', { wallet: walletAddress });
  }

  /**
   * Invalidate token metadata for a mint
   */
  invalidateTokenMetadata(mint: string): void {
    this.tokenMetadataCache.delete(mint);
    this.recordInvalidation(mint);
    logger.debug('Token metadata cache invalidated', { mint });
  }

  /**
   * Clear all caches
   */
  clear(): void {
    const totalEntries =
      this.balanceCache.size + this.transactionCache.size + this.tokenMetadataCache.size;

    this.balanceCache.clear();
    this.transactionCache.clear();
    this.tokenMetadataCache.clear();

    logger.info('Agent context cache cleared', { entriesCleared: totalEntries });
  }

  /**
   * Get cache statistics
   */
  getStats(): Record<string, CacheStats> {
    return Object.fromEntries(this.stats);
  }

  /**
   * Get cache size (for monitoring)
   */
  getSize(): {
    balances: number;
    transactions: number;
    metadata: number;
    total: number;
  } {
    const sizes = {
      balances: this.balanceCache.size,
      transactions: this.transactionCache.size,
      metadata: this.tokenMetadataCache.size,
      total:
        this.balanceCache.size + this.transactionCache.size + this.tokenMetadataCache.size,
    };

    return sizes;
  }

  /**
   * Get cache health report
   */
  getHealthReport(): {
    sizes: { balances: number; transactions: number; metadata: number; total: number };
    stats: Record<string, CacheStats>;
    hitRate: number;
  } {
    let totalHits = 0;
    let totalMisses = 0;

    for (const stat of this.stats.values()) {
      totalHits += stat.hits;
      totalMisses += stat.misses;
    }

    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      sizes: this.getSize(),
      stats: this.getStats(),
      hitRate,
    };
  }

  /**
   * Prune expired entries (can be called periodically)
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    // Prune balance cache
    for (const [key, entry] of this.balanceCache.entries()) {
      if (now >= entry.expiresAt) {
        this.balanceCache.delete(key);
        pruned++;
      }
    }

    // Prune transaction cache
    for (const [key, entry] of this.transactionCache.entries()) {
      if (now >= entry.expiresAt) {
        this.transactionCache.delete(key);
        pruned++;
      }
    }

    // Prune token metadata cache
    for (const [key, entry] of this.tokenMetadataCache.entries()) {
      if (now >= entry.expiresAt) {
        this.tokenMetadataCache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.debug('Cache entries pruned', { count: pruned });
    }

    return pruned;
  }

  /**
   * Record cache hit
   */
  private recordHit(key: string): void {
    if (!this.stats.has(key)) {
      this.stats.set(key, { hits: 0, misses: 0, invalidations: 0 });
    }
    const stat = this.stats.get(key)!;
    stat.hits++;
  }

  /**
   * Record cache miss
   */
  private recordMiss(key: string): void {
    if (!this.stats.has(key)) {
      this.stats.set(key, { hits: 0, misses: 0, invalidations: 0 });
    }
    const stat = this.stats.get(key)!;
    stat.misses++;
  }

  /**
   * Record cache invalidation
   */
  private recordInvalidation(key: string): void {
    if (!this.stats.has(key)) {
      this.stats.set(key, { hits: 0, misses: 0, invalidations: 0 });
    }
    const stat = this.stats.get(key)!;
    stat.invalidations++;
  }
}

// Singleton instance
let cacheInstance: AgentContextCache | null = null;

/**
 * Get or create global agent context cache
 */
export function getAgentContextCache(): AgentContextCache {
  if (!cacheInstance) {
    cacheInstance = new AgentContextCache();
  }
  return cacheInstance;
}

/**
 * Set global cache (for testing)
 */
export function setAgentContextCache(cache: AgentContextCache): void {
  cacheInstance = cache;
}
