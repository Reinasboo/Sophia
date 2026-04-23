/**
 * Shared Type Definitions
 *
 * These types are shared between the backend (src) and frontend (apps/frontend).
 * They represent the public API contracts and UI-bound data structures.
 * NO sensitive information (encrypted keys, secrets) should be in this file.
 */

// ============================================
// AGENT TYPES (Frontend-safe)
// ============================================

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'error'
  | 'stopped'
  | 'paused';

export type AgentStrategy = string;

/**
 * Execution settings governing agent cycle behavior.
 * Safe to expose — no sensitive data.
 */
export interface ExecutionSettings {
  readonly cycleIntervalMs: number;
  readonly maxActionsPerDay: number;
  readonly enabled: boolean;
}

/**
 * Public agent information — safe to expose to frontend.
 * Never includes wallet private keys or sensitive internal state.
 */
export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly status: AgentStatus;
  readonly walletId: string;
  readonly walletPublicKey: string;
  readonly strategy: AgentStrategy;
  readonly strategyParams?: Record<string, unknown>;
  readonly executionSettings?: ExecutionSettings;
  readonly createdAt: Date;
  readonly lastActionAt?: Date;
  readonly errorMessage?: string;
}

// ============================================
// TRANSACTION TYPES (Frontend-safe)
// ============================================

export type TransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'finalized' | 'failed';

export type TransactionType =
  | 'airdrop'
  | 'transfer_sol'
  | 'transfer_spl'
  | 'create_token_account'
  | 'raw_execute'
  | 'swap'
  | 'create_token';

/**
 * Public transaction record — safe to expose.
 */
export interface Transaction {
  readonly id: string;
  readonly signature?: string;
  readonly walletId: string;
  readonly type: TransactionType;
  readonly status: TransactionStatus;
  readonly amount?: number;
  readonly recipient?: string;
  readonly mint?: string;
  readonly error?: string;
  readonly createdAt: Date;
  readonly confirmedAt?: Date;
}

// ============================================
// BALANCE & TOKEN TYPES (Frontend-safe)
// ============================================

/**
 * Token balance information — safe for frontend display.
 */
export interface TokenBalance {
  readonly mint: string;
  readonly amount: string; // Stringified to handle large numbers in JSON
  readonly decimals: number;
  readonly uiAmount: number;
  readonly symbol?: string;
}

/**
 * System statistics — safe for dashboard display.
 */
export interface SystemStats {
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly totalSolManaged: number;
  readonly totalTransactions: number;
  readonly networkStatus: 'healthy' | 'degraded' | 'down';
  readonly network: string;
  readonly uptime: number;
}

// ============================================
// EVENT TYPES (Frontend-safe)
// ============================================

/**
 * Union of all system event types.
 */
export type SystemEvent =
  | AgentCreatedEvent
  | AgentStatusChangedEvent
  | AgentActionEvent
  | TransactionEvent
  | BalanceChangedEvent
  | SystemErrorEvent;

export interface BaseEvent {
  readonly id: string;
  readonly timestamp: Date;
}

export interface AgentCreatedEvent extends BaseEvent {
  readonly type: 'agent_created';
  readonly agent: Agent;
}

export interface AgentStatusChangedEvent extends BaseEvent {
  readonly type: 'agent_status_changed';
  readonly agentId: string;
  readonly previousStatus: AgentStatus;
  readonly newStatus: AgentStatus;
}

export interface AgentActionEvent extends BaseEvent {
  readonly type: 'agent_action';
  readonly agentId: string;
  readonly action: string;
  readonly details?: Record<string, unknown>;
}

export interface TransactionEvent extends BaseEvent {
  readonly type: 'transaction';
  readonly transaction: Transaction;
}

export interface BalanceChangedEvent extends BaseEvent {
  readonly type: 'balance_changed';
  readonly walletId: string;
  readonly previousBalance: number;
  readonly newBalance: number;
}

export interface SystemErrorEvent extends BaseEvent {
  readonly type: 'system_error';
  readonly error: string;
  readonly context?: Record<string, unknown>;
}

// ============================================
// API RESPONSE TYPES (Frontend-safe)
// ============================================

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: Date;
}

// ============================================
// EXTERNAL AGENT (BYOA) TYPES
// ============================================

export type ExternalAgentType = 'local' | 'remote';

export type ExternalAgentStatus = 'registered' | 'active' | 'inactive' | 'revoked';

/**
 * Intent types supported by external agents.
 * Subset of all possible intents — focused on BYOA safety model.
 */
export type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS'
  | 'SERVICE_PAYMENT';

/**
 * Public external agent information — safe to expose.
 */
export interface ExternalAgent {
  readonly id: string;
  readonly name: string;
  readonly type: ExternalAgentType;
  readonly endpoint?: string;
  readonly supportedIntents: SupportedIntentType[];
  readonly status: ExternalAgentStatus;
  readonly walletId?: string;
  readonly walletPublicKey?: string;
  readonly createdAt: Date;
  readonly lastActiveAt?: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Intent history record — logs of agent actions.
 */
export interface IntentHistoryRecord {
  readonly intentId: string;
  readonly agentId: string;
  readonly type: SupportedIntentType;
  readonly params: Record<string, unknown>;
  readonly status: 'executed' | 'rejected';
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly createdAt: Date;
}

// ============================================
// STRATEGY TYPES
// ============================================

/**
 * Field descriptor for dynamic strategy parameter UI generation.
 */
export interface StrategyFieldDescriptor {
  readonly key: string;
  readonly label: string;
  readonly type: 'number' | 'string' | 'boolean' | 'string[]';
  readonly description?: string;
  readonly required: boolean;
  readonly default?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly placeholder?: string;
}

/**
 * Strategy definition — sent to frontend for UI.
 */
export interface StrategyDefinition {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly supportedIntents: readonly string[];
  readonly defaultParams: Record<string, unknown>;
  readonly builtIn: boolean;
  readonly icon: string;
  readonly category: 'income' | 'distribution' | 'trading' | 'utility' | 'custom';
  readonly fields: readonly StrategyFieldDescriptor[];
}

// ============================================
// HELPER TYPES
// ============================================

/**
 * Result type for error handling.
 * Used internally but also in API contracts.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
