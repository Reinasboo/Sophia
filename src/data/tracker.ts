/**
 * Data Tracker — Main indexing and query interface
 *
 * Coordinates:
 * - Real-time ingestion from Helius webhooks
 * - Intent execution tracking
 * - Event streaming
 * - Backfill logic for missed events
 * - Health monitoring
 */

import { createLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { Result, success, failure } from '../types/shared.js';
import {
  IndexedTransaction,
  IndexedIntent,
  IndexedEvent,
  IndexingState,
  TransactionFilter,
  IntentFilter,
} from './schema.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('DATA_TRACKER');
const DATA_TRACKER_STORE_KEY = 'data-tracker';

interface PersistedTrackerState {
  transactions: IndexedTransaction[];
  intents: IndexedIntent[];
  events: IndexedEvent[];
  indexingState: IndexingState;
}

/**
 * Mock in-memory implementation (production: use real PostgreSQL adapter)
 * This provides the interface; wire to actual DB in tracker-postgres.ts
 */
export class DataTracker {
  private transactions: Map<string, IndexedTransaction> = new Map();
  private intents: Map<string, IndexedIntent> = new Map();
  private events: Map<string, IndexedEvent> = new Map();
  private indexingState: IndexingState;
  private lastWebhookTime: number = Date.now();
  private missedEventBuffer: Set<string> = new Set();
  private readonly persistenceEnabled: boolean;

  constructor() {
    this.persistenceEnabled = process.env['NODE_ENV'] !== 'test';
    this.indexingState = {
      lastProcessedSlot: 0,
      lastProcessedBlockTime: Date.now(),
      totalTransactionsIndexed: 0,
      totalIntentsIndexed: 0,
      missedEventCount: 0,
      lastHealthCheck: new Date(),
    };

    logger.info('Data tracker initialized (in-memory mode)', {
      note: 'Production: Use tracker-postgres.ts with real database',
    });

    this.loadFromStore();
  }

  private saveToStore(): void {
    if (!this.persistenceEnabled) {
      return;
    }

    saveState<PersistedTrackerState>(DATA_TRACKER_STORE_KEY, {
      transactions: Array.from(this.transactions.values()),
      intents: Array.from(this.intents.values()),
      events: Array.from(this.events.values()),
      indexingState: this.indexingState,
    });
  }

  private loadFromStore(): void {
    if (!this.persistenceEnabled) {
      return;
    }

    const saved = loadState<PersistedTrackerState>(DATA_TRACKER_STORE_KEY);
    if (!saved) {
      return;
    }

    this.transactions.clear();
    this.intents.clear();
    this.events.clear();

    for (const tx of saved.transactions ?? []) {
      this.transactions.set(tx.signature, {
        ...tx,
        createdAt: new Date(tx.createdAt),
        indexedAt: new Date(tx.indexedAt),
      });
    }

    for (const intent of saved.intents ?? []) {
      this.intents.set(intent.id, {
        ...intent,
        createdAt: new Date(intent.createdAt),
        executedAt: intent.executedAt ? new Date(intent.executedAt) : undefined,
        indexedAt: new Date(intent.indexedAt),
      });
    }

    for (const event of saved.events ?? []) {
      this.events.set(event.id, {
        ...event,
        createdAt: new Date(event.createdAt),
        indexedAt: new Date(event.indexedAt),
      });
    }

    this.indexingState = {
      ...saved.indexingState,
      lastHealthCheck: new Date(saved.indexingState.lastHealthCheck),
    };

    logger.info('Data tracker state restored from disk', {
      transactions: this.transactions.size,
      intents: this.intents.size,
      events: this.events.size,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Transaction Indexing (from Helius webhooks)
  // ────────────────────────────────────────────────────────────────

  /**
   * Index a transaction from Helius webhook
   */
  async indexTransaction(tx: Partial<IndexedTransaction>): Promise<Result<IndexedTransaction, Error>> {
    try {
      if (!tx.signature || !tx.tenantId) {
        return failure(new Error('signature and tenantId required'));
      }

      const indexed: IndexedTransaction = {
        id: uuidv4(),
        signature: tx.signature,
        slot: tx.slot ?? 0,
        blockTime: tx.blockTime ?? Date.now(),
        tenantId: tx.tenantId,
        walletAddress: tx.walletAddress ?? '',
        type: tx.type ?? 'unknown',
        status: tx.status ?? 'pending',
        amount: tx.amount,
        recipient: tx.recipient,
        mint: tx.mint,
        programId: tx.programId,
        fee: tx.fee,
        instructionCount: tx.instructionCount ?? 0,
        logMessages: tx.logMessages,
        error: tx.error,
        parsedData: tx.parsedData,
        createdAt: new Date(tx.blockTime ?? Date.now()),
        indexedAt: new Date(),
      };

      this.transactions.set(indexed.signature, indexed);
      this.indexingState.totalTransactionsIndexed++;

      if (tx.slot && tx.slot > this.indexingState.lastProcessedSlot) {
        this.indexingState.lastProcessedSlot = tx.slot;
        this.indexingState.lastProcessedBlockTime = tx.blockTime ?? Date.now();
      }

      logger.debug('Transaction indexed', {
        signature: tx.signature,
        tenantId: tx.tenantId,
        type: tx.type,
        status: tx.status,
      });

      this.saveToStore();

      return success(indexed);
    } catch (err) {
      logger.error('Failed to index transaction', { error: String(err) });
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Query transactions
   */
  async queryTransactions(filter: TransactionFilter): Promise<Result<IndexedTransaction[], Error>> {
    try {
      let results = Array.from(this.transactions.values());

      if (filter.tenantId) {
        results = results.filter((t) => t.tenantId === filter.tenantId);
      }
      if (filter.walletAddress) {
        results = results.filter((t) => t.walletAddress === filter.walletAddress);
      }
      if (filter.type) {
        results = results.filter((t) => t.type === filter.type);
      }
      if (filter.status) {
        results = results.filter((t) => t.status === filter.status);
      }
      if (filter.minBlockTime) {
        results = results.filter((t) => t.blockTime >= filter.minBlockTime!);
      }
      if (filter.maxBlockTime) {
        results = results.filter((t) => t.blockTime <= filter.maxBlockTime!);
      }

      // Sort by block time descending
      results.sort((a, b) => b.blockTime - a.blockTime);

      // Pagination
      const offset = filter.offset ?? 0;
      const limit = Math.min(filter.limit ?? 100, 1000);

      return success(results.slice(offset, offset + limit));
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Get single transaction
   */
  async getTransaction(signature: string): Promise<Result<IndexedTransaction, Error>> {
    try {
      const tx = this.transactions.get(signature);
      if (!tx) {
        return failure(new Error(`Transaction not found: ${signature}`));
      }
      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Intent Tracking
  // ────────────────────────────────────────────────────────────────

  /**
   * Record an intent submission
   */
  async recordIntent(
    intent: Omit<IndexedIntent, 'id' | 'indexedAt'> & { id?: string }
  ): Promise<Result<IndexedIntent, Error>> {
    try {
      const indexed: IndexedIntent = {
        ...intent,
        id: intent.id ?? uuidv4(),
        indexedAt: new Date(),
      };

      this.intents.set(indexed.id, indexed);
      this.indexingState.totalIntentsIndexed++;

      logger.debug('Intent recorded', {
        agentId: intent.agentId,
        type: intent.intentType,
        status: intent.status,
      });

      this.saveToStore();

      return success(indexed);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Update intent execution result
   */
  async updateIntentResult(
    intentId: string,
    result: { status: string; result?: Record<string, unknown>; error?: string; signature?: string }
  ): Promise<Result<IndexedIntent, Error>> {
    try {
      const intent = this.intents.get(intentId);
      if (!intent) {
        return failure(new Error(`Intent not found: ${intentId}`));
      }

      const updated: IndexedIntent = {
        ...intent,
        status: result.status as any,
        result: result.result,
        error: result.error,
        signature: result.signature,
        executedAt: new Date(),
      };

      this.intents.set(intentId, updated);

      logger.debug('Intent updated', {
        intentId,
        status: result.status,
        hasSignature: !!result.signature,
      });

      this.saveToStore();

      return success(updated);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Query intents
   */
  async queryIntents(filter: IntentFilter): Promise<Result<IndexedIntent[], Error>> {
    try {
      let results = Array.from(this.intents.values());

      if (filter.tenantId) {
        results = results.filter((i) => i.tenantId === filter.tenantId);
      }
      if (filter.agentId) {
        results = results.filter((i) => i.agentId === filter.agentId);
      }
      if (filter.status) {
        results = results.filter((i) => i.status === filter.status);
      }

      // Sort by created time descending
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const offset = filter.offset ?? 0;
      const limit = Math.min(filter.limit ?? 100, 1000);

      return success(results.slice(offset, offset + limit));
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Event Streaming
  // ────────────────────────────────────────────────────────────────

  /**
   * Record a system event
   */
  async recordEvent(event: Omit<IndexedEvent, 'id' | 'indexedAt'>): Promise<Result<IndexedEvent, Error>> {
    try {
      const indexed: IndexedEvent = {
        ...event,
        id: uuidv4(),
        indexedAt: new Date(),
      };

      this.events.set(indexed.id, indexed);

      logger.debug('Event recorded', {
        eventType: event.eventType,
        entityId: event.entityId,
        tenantId: event.tenantId,
      });

      this.saveToStore();

      return success(indexed);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Query events for a tenant
   */
  async queryEvents(
    tenantId: string,
    limit: number = 100
  ): Promise<Result<IndexedEvent[], Error>> {
    try {
      const results = Array.from(this.events.values())
        .filter((e) => e.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.min(limit, 1000));

      return success(results);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Health & Monitoring
  // ────────────────────────────────────────────────────────────────

  /**
   * Get indexing health status
   */
  getHealth(): Result<{ state: IndexingState; lagSeconds: number; healthy: boolean }, Error> {
    try {
      const lagSeconds = (Date.now() - this.lastWebhookTime) / 1000;
      const healthy = lagSeconds < 300; // Healthy if heard from Helius in last 5 min

      return success({
        state: this.indexingState,
        lagSeconds: Math.round(lagSeconds),
        healthy,
      });
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Update webhook health (call on every successful webhook)
   */
  updateWebhookTime(): void {
    this.lastWebhookTime = Date.now();
  }

  /**
   * Record missed events (for backfill)
   */
  recordMissedEvent(eventId: string): void {
    this.missedEventBuffer.add(eventId);
    this.indexingState.missedEventCount++;
  }

  /**
   * Get and clear missed events
   */
  getMissedEvents(): string[] {
    const missed = Array.from(this.missedEventBuffer);
    this.missedEventBuffer.clear();
    return missed;
  }

  // ────────────────────────────────────────────────────────────────
  // Persistence (for graceful restart)
  // ────────────────────────────────────────────────────────────────

  /**
   * Export state for persistence
   */
  exportState(): {
    transactions: IndexedTransaction[];
    intents: IndexedIntent[];
    events: IndexedEvent[];
    indexingState: IndexingState;
  } {
    return {
      transactions: Array.from(this.transactions.values()),
      intents: Array.from(this.intents.values()),
      events: Array.from(this.events.values()),
      indexingState: this.indexingState,
    };
  }

  /**
   * Import state from persistence
   */
  importState(state: {
    transactions: IndexedTransaction[];
    intents: IndexedIntent[];
    events: IndexedEvent[];
    indexingState: IndexingState;
  }): void {
    this.transactions.clear();
    this.intents.clear();
    this.events.clear();

    for (const tx of state.transactions) {
      this.transactions.set(tx.signature, tx);
    }
    for (const intent of state.intents) {
      this.intents.set(intent.id, intent);
    }
    for (const event of state.events) {
      this.events.set(event.id, event);
    }

    this.indexingState = state.indexingState;
    this.saveToStore();
    logger.info('Data tracker state imported', {
      transactions: state.transactions.length,
      intents: state.intents.length,
      events: state.events.length,
    });
  }
}

// Singleton instance
let trackerInstance: DataTracker | null = null;

export function getDataTracker(): DataTracker {
  if (!trackerInstance) {
    trackerInstance = new DataTracker();
  }
  return trackerInstance;
}

/**
 * Reset tracker instance (for testing only)
 */
export function resetDataTracker(): void {
  trackerInstance = null;
}
