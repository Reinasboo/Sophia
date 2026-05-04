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
import { Pool } from 'pg';
import { Result, success, failure } from '../types/shared.js';
import {
  IndexedTransaction,
  IndexedIntent,
  IndexedEvent,
  IndexingState,
  TransactionFilter,
  IntentFilter,
} from './schema.js';
import { getConfig, type Config } from '../utils/config.js';
import { saveState, loadState } from '../utils/store.js';
import GmgnAdapter from './gmgn-adapter.js';

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
  private storageMode: 'file' | 'postgres';
  private dbPool: Pool | null = null;
  private readyPromise: Promise<void>;
  private gmgnAdapter: GmgnAdapter | null = null;

  constructor() {
    const config = getConfig();
    this.persistenceEnabled = process.env['NODE_ENV'] !== 'test';
    this.storageMode = this.persistenceEnabled && config.DATABASE_URL ? 'postgres' : 'file';
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

    this.readyPromise = this.initializePersistence(config).catch((error) => {
      logger.error('Data tracker persistence initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (process.env['NODE_ENV'] === 'production') {
        throw error;
      }

      this.storageMode = 'file';
      this.dbPool?.end().catch(() => undefined);
      this.dbPool = null;
      this.loadFromStore();
    });

    // Start GMGN adapter if enabled in config
    try {
      if (config.GMGN_ENABLED === 'true') {
        this.gmgnAdapter = new GmgnAdapter();
        this.gmgnAdapter.start(this);
      }
    } catch (err) {
      logger.error('Failed to start GMGN adapter', { error: String(err) });
    }
  }

  private async ensureReady(): Promise<void> {
    await this.readyPromise;
  }

  private async initializePersistence(config: Config): Promise<void> {
    if (this.storageMode === 'postgres' && config.DATABASE_URL) {
      this.dbPool = new Pool({
        connectionString: config.DATABASE_URL,
        ssl: config.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
      });

      await this.ensureDatabaseSchema();
      await this.loadFromDatabase();

      logger.info('Data tracker initialized (postgres mode)', {
        database: 'postgres',
      });
      return;
    }

    this.loadFromStore();
  }

  private saveToStore(): void {
    if (!this.persistenceEnabled) {
      return;
    }

    if (this.storageMode === 'postgres') {
      void this.persistToDatabase();
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

    if (this.storageMode === 'postgres') {
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

  private async ensureDatabaseSchema(): Promise<void> {
    if (!this.dbPool) {
      return;
    }

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS indexed_transactions (
        signature TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        slot BIGINT NOT NULL,
        block_time BIGINT NOT NULL,
        tenant_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount DOUBLE PRECISION,
        recipient TEXT,
        mint TEXT,
        program_id TEXT,
        fee DOUBLE PRECISION,
        instruction_count INTEGER NOT NULL,
        log_messages JSONB,
        error TEXT,
        parsed_data JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        indexed_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS indexed_intents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        intent_type TEXT NOT NULL,
        status TEXT NOT NULL,
        params JSONB NOT NULL,
        result JSONB,
        error TEXT,
        signature TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        executed_at TIMESTAMPTZ,
        indexed_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS indexed_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        indexed_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS indexing_state (
        id TEXT PRIMARY KEY,
        last_processed_slot BIGINT NOT NULL,
        last_processed_block_time BIGINT NOT NULL,
        total_transactions_indexed BIGINT NOT NULL,
        total_intents_indexed BIGINT NOT NULL,
        missed_event_count BIGINT NOT NULL,
        last_health_check TIMESTAMPTZ NOT NULL
      )
    `);
  }

  private async loadFromDatabase(): Promise<void> {
    if (!this.dbPool) {
      return;
    }

    const [transactionsResult, intentsResult, eventsResult, stateResult] = await Promise.all([
      this.dbPool.query('SELECT * FROM indexed_transactions ORDER BY indexed_at ASC'),
      this.dbPool.query('SELECT * FROM indexed_intents ORDER BY indexed_at ASC'),
      this.dbPool.query('SELECT * FROM indexed_events ORDER BY indexed_at ASC'),
      this.dbPool.query('SELECT * FROM indexing_state WHERE id = $1 LIMIT 1', ['default']),
    ]);

    this.transactions.clear();
    this.intents.clear();
    this.events.clear();

    for (const row of transactionsResult.rows) {
      const tx: IndexedTransaction = {
        id: row.id,
        signature: row.signature,
        slot: Number(row.slot),
        blockTime: Number(row.block_time),
        tenantId: row.tenant_id,
        walletAddress: row.wallet_address,
        type: row.type,
        status: row.status,
        amount: row.amount ?? undefined,
        recipient: row.recipient ?? undefined,
        mint: row.mint ?? undefined,
        programId: row.program_id ?? undefined,
        fee: row.fee ?? undefined,
        instructionCount: Number(row.instruction_count),
        logMessages: row.log_messages ?? undefined,
        error: row.error ?? undefined,
        parsedData: row.parsed_data ?? undefined,
        createdAt: new Date(row.created_at),
        indexedAt: new Date(row.indexed_at),
      };
      this.transactions.set(tx.signature, tx);
    }

    for (const row of intentsResult.rows) {
      const intent: IndexedIntent = {
        id: row.id,
        tenantId: row.tenant_id,
        agentId: row.agent_id,
        intentType: row.intent_type,
        status: row.status,
        params: row.params ?? {},
        result: row.result ?? undefined,
        error: row.error ?? undefined,
        signature: row.signature ?? undefined,
        createdAt: new Date(row.created_at),
        executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
        indexedAt: new Date(row.indexed_at),
      };
      this.intents.set(intent.id, intent);
    }

    for (const row of eventsResult.rows) {
      const event: IndexedEvent = {
        id: row.id,
        tenantId: row.tenant_id,
        eventType: row.event_type,
        entityId: row.entity_id,
        entityType: row.entity_type,
        data: row.data ?? {},
        createdAt: new Date(row.created_at),
        indexedAt: new Date(row.indexed_at),
      };
      this.events.set(event.id, event);
    }

    const stateRow = stateResult.rows[0];
    if (stateRow) {
      this.indexingState = {
        lastProcessedSlot: Number(stateRow.last_processed_slot),
        lastProcessedBlockTime: Number(stateRow.last_processed_block_time),
        totalTransactionsIndexed: Number(stateRow.total_transactions_indexed),
        totalIntentsIndexed: Number(stateRow.total_intents_indexed),
        missedEventCount: Number(stateRow.missed_event_count),
        lastHealthCheck: new Date(stateRow.last_health_check),
      };
    }

    logger.info('Data tracker state restored from postgres', {
      transactions: this.transactions.size,
      intents: this.intents.size,
      events: this.events.size,
    });
  }

  private async persistToDatabase(): Promise<void> {
    if (!this.dbPool) {
      return;
    }

    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'TRUNCATE indexed_transactions, indexed_intents, indexed_events, indexing_state'
      );

      for (const tx of this.transactions.values()) {
        await client.query(
          `INSERT INTO indexed_transactions (
            signature, id, slot, block_time, tenant_id, wallet_address, type, status,
            amount, recipient, mint, program_id, fee, instruction_count, log_messages,
            error, parsed_data, created_at, indexed_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
          )`,
          [
            tx.signature,
            tx.id,
            tx.slot,
            tx.blockTime,
            tx.tenantId,
            tx.walletAddress,
            tx.type,
            tx.status,
            tx.amount ?? null,
            tx.recipient ?? null,
            tx.mint ?? null,
            tx.programId ?? null,
            tx.fee ?? null,
            tx.instructionCount,
            tx.logMessages ?? null,
            tx.error ?? null,
            tx.parsedData ?? null,
            tx.createdAt,
            tx.indexedAt,
          ]
        );
      }

      for (const intent of this.intents.values()) {
        await client.query(
          `INSERT INTO indexed_intents (
            id, tenant_id, agent_id, intent_type, status, params, result, error,
            signature, created_at, executed_at, indexed_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
          )`,
          [
            intent.id,
            intent.tenantId,
            intent.agentId,
            intent.intentType,
            intent.status,
            intent.params,
            intent.result ?? null,
            intent.error ?? null,
            intent.signature ?? null,
            intent.createdAt,
            intent.executedAt ?? null,
            intent.indexedAt,
          ]
        );
      }

      for (const event of this.events.values()) {
        await client.query(
          `INSERT INTO indexed_events (
            id, tenant_id, event_type, entity_id, entity_type, data, created_at, indexed_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8
          )`,
          [
            event.id,
            event.tenantId,
            event.eventType,
            event.entityId,
            event.entityType,
            event.data,
            event.createdAt,
            event.indexedAt,
          ]
        );
      }

      await client.query(
        `INSERT INTO indexing_state (
          id, last_processed_slot, last_processed_block_time, total_transactions_indexed,
          total_intents_indexed, missed_event_count, last_health_check
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          'default',
          this.indexingState.lastProcessedSlot,
          this.indexingState.lastProcessedBlockTime,
          this.indexingState.totalTransactionsIndexed,
          this.indexingState.totalIntentsIndexed,
          this.indexingState.missedEventCount,
          this.indexingState.lastHealthCheck,
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to persist data tracker state to postgres', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Transaction Indexing (from Helius webhooks)
  // ────────────────────────────────────────────────────────────────

  /**
   * Index a transaction from Helius webhook
   */
  async indexTransaction(
    tx: Partial<IndexedTransaction>
  ): Promise<Result<IndexedTransaction, Error>> {
    try {
      await this.ensureReady();
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
      await this.ensureReady();
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
      await this.ensureReady();
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
      await this.ensureReady();
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
      await this.ensureReady();
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
      await this.ensureReady();
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
  async recordEvent(
    event: Omit<IndexedEvent, 'id' | 'indexedAt'>
  ): Promise<Result<IndexedEvent, Error>> {
    try {
      await this.ensureReady();
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
  async queryEvents(tenantId: string, limit: number = 100): Promise<Result<IndexedEvent[], Error>> {
    try {
      await this.ensureReady();
      const results = Array.from(this.events.values())
        .filter((e) => e.tenantId === tenantId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.min(limit, 1000));

      return success(results);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Helper: Query GMGN-provided data events recorded by the adapter.
   * Returns array of payload objects (the `data.payload` field) for matching events.
   */
  async queryGmgnData(
    tenantId: string,
    kind?: string,
    limit: number = 100
  ): Promise<Result<Array<Record<string, unknown>>, Error>> {
    try {
      await this.ensureReady();
      const results = Array.from(this.events.values())
        .filter((e) => e.tenantId === tenantId)
        .filter((e) => e.data && (e.data as any).source === 'gmgn')
        .filter((e) => (kind ? (e.data as any).kind === kind : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.min(limit, 1000))
        .map((e) => ((e.data as any).payload ?? (e.data as any)) as Record<string, unknown>);

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
