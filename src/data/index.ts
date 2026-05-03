/**
 * Data Tracking & Indexing Layer
 *
 * Handles real-time transaction ingestion, indexing, and persistent storage.
 * Supports Helius webhooks for transaction events and implements backfill logic
 * for missed events during service restarts.
 *
 * Schema: PostgreSQL with tables for:
 * - indexed_transactions: All on-chain transactions involving managed wallets
 * - indexed_intents: Agent intents and their execution status
 * - indexed_events: System events (agent created, state changed, etc.)
 * - indexing_state: Tracks last processed slot for backfill
 */

export { getDataTracker, resetDataTracker, DataTracker } from './tracker.js';
export { attachDataTracker } from './event-bridge.js';
export { handleHeliusWebhook, verifyHeliusSignature } from './helius-webhook.js';
export type {
  IndexedTransaction,
  IndexedIntent,
  IndexedEvent,
  IndexingState,
  TransactionFilter,
} from './schema.js';
export type { HeliusTransaction, HeliusWebhookPayload } from './helius-webhook.js';
