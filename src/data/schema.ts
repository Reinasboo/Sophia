/**
 * Data Schema Types
 *
 * Defines the structure for all indexed data in PostgreSQL.
 */

/**
 * Indexed transaction record — parsed from Solana blockchain
 */
export interface IndexedTransaction {
  id: string; // UUID v4
  signature: string; // Transaction signature (base58)
  slot: number; // Blockchain slot
  blockTime: number; // Unix timestamp
  tenantId: string; // Multi-tenant owner
  walletAddress: string; // Managed wallet involved
  type:
    | 'transfer_sol'
    | 'transfer_token'
    | 'swap'
    | 'stake'
    | 'unstake'
    | 'liquid_stake'
    | 'provide_liquidity'
    | 'remove_liquidity'
    | 'deposit_lending'
    | 'withdraw_lending'
    | 'borrow_lending'
    | 'repay_lending'
    | 'farm_deposit'
    | 'farm_harvest'
    | 'wrap_token'
    | 'unwrap_token'
    | 'composite_strategy'
    | 'unknown';
  status: 'success' | 'failed' | 'pending';
  amount?: number; // SOL or token amount
  recipient?: string; // Recipient address
  mint?: string; // Token mint (if SPL transfer)
  programId?: string; // Program involved
  fee?: number; // Transaction fee in lamports
  instructionCount: number; // Number of instructions in tx
  logMessages?: string[]; // Program output logs
  error?: string; // Error message if failed
  parsedData?: Record<string, unknown>; // Parsed instruction data
  createdAt: Date;
  indexedAt: Date;
}

/**
 * Indexed intent record — tracks agent intent execution
 */
export interface IndexedIntent {
  id: string; // Intent UUID
  tenantId: string;
  agentId: string;
  intentType:
    | 'REQUEST_AIRDROP'
    | 'TRANSFER_SOL'
    | 'TRANSFER_TOKEN'
    | 'QUERY_BALANCE'
    | 'AUTONOMOUS'
    | 'SERVICE_PAYMENT'
    | 'swap'
    | 'stake'
    | 'unstake'
    | 'liquid_stake'
    | 'provide_liquidity'
    | 'remove_liquidity'
    | 'deposit_lending'
    | 'withdraw_lending'
    | 'borrow_lending'
    | 'repay_lending'
    | 'farm_deposit'
    | 'farm_harvest'
    | 'wrap_token'
    | 'unwrap_token'
    | 'composite_strategy';
  status: 'pending' | 'executed' | 'rejected' | 'failed';
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  signature?: string; // Linked transaction signature (if executed on-chain)
  createdAt: Date;
  executedAt?: Date;
  indexedAt: Date;
}

/**
 * Indexed event record — system state changes
 */
export interface IndexedEvent {
  id: string;
  tenantId: string;
  eventType:
    | 'agent_created'
    | 'agent_activated'
    | 'agent_deactivated'
    | 'agent_revoked'
    | 'intent_submitted'
    | 'intent_executed'
    | 'transaction_indexed'
    | 'system_alert';
  entityId: string; // agentId, intentId, txSignature, etc.
  entityType: 'agent' | 'intent' | 'transaction' | 'system';
  data: Record<string, unknown>;
  createdAt: Date;
  indexedAt: Date;
}

/**
 * Indexing state — tracks progress for backfill
 */
export interface IndexingState {
  lastProcessedSlot: number;
  lastProcessedBlockTime: number;
  totalTransactionsIndexed: number;
  totalIntentsIndexed: number;
  missedEventCount: number;
  lastHealthCheck: Date;
}

/**
 * Query filters
 */
export interface TransactionFilter {
  tenantId?: string;
  walletAddress?: string;
  type?: string;
  status?: string;
  minBlockTime?: number;
  maxBlockTime?: number;
  limit?: number;
  offset?: number;
}

export interface IntentFilter {
  tenantId?: string;
  agentId?: string;
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}
