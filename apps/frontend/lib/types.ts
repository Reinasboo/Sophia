/**
 * Frontend Types - Synced with Backend (src/types/shared.ts)
 *
 * These types mirror the backend shared types exactly.
 * No backend imports (allows Next.js to compile standalone).
 * Types are validated via API responses at runtime.
 */

// ─── Basic Types ──────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error' | 'stopped';
export type TransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'finalized' | 'failed';
export type TransactionType =
  | 'airdrop'
  | 'transfer_sol'
  | 'transfer_spl'
  | 'create_token_account'
  | 'raw_execute'
  | 'swap'
  | 'create_token';
export type ExternalAgentStatus = 'registered' | 'active' | 'inactive' | 'revoked';
export type ExternalAgentType = 'local' | 'remote';
export type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS'
  | 'SERVICE_PAYMENT';

// ─── Domain Objects ──────────────────────────────────────────────────────

export interface TokenBalance {
  readonly mint: string;
  readonly amount: string;
  readonly decimals: number;
  readonly uiAmount: number;
  readonly symbol?: string;
}

export interface ExecutionSettings {
  readonly cycleIntervalMs: number;
  readonly maxActionsPerDay: number;
  readonly enabled: boolean;
}

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly status: AgentStatus;
  readonly walletId: string;
  readonly walletPublicKey: string;
  readonly strategy: string;
  readonly strategyParams?: Record<string, unknown>;
  readonly executionSettings?: ExecutionSettings;
  readonly createdAt: string | Date;
  readonly lastActionAt?: string | Date;
  readonly errorMessage?: string;
}

export interface AgentDetail {
  readonly agent: Agent;
  readonly balance?: number;
  readonly tokenBalances?: TokenBalance[];
  readonly transactions?: Transaction[];
  readonly events?: SystemEvent[];
}

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
  readonly createdAt: string | Date;
  readonly confirmedAt?: string | Date;
}

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

export interface IntentHistoryRecord {
  readonly intentId: string;
  readonly agentId: string;
  readonly type: SupportedIntentType;
  readonly params: Record<string, unknown>;
  readonly status: 'executed' | 'rejected';
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly createdAt: string | Date;
}

export interface ExternalAgent {
  readonly id: string;
  readonly name: string;
  readonly type: ExternalAgentType;
  readonly endpoint?: string;
  readonly supportedIntents: SupportedIntentType[];
  readonly status: ExternalAgentStatus;
  readonly walletId?: string;
  readonly walletPublicKey?: string;
  readonly createdAt: string | Date;
  readonly lastActiveAt?: string | Date;
  readonly metadata?: Record<string, unknown>;
}

export interface ExternalAgentDetail extends ExternalAgent {
  readonly apiKey?: string;
  readonly walletPolicies?: Array<{
    readonly token: string;
    readonly dailyLimit: string;
  }>;
  readonly intentHistory: IntentHistoryRecord[];
}

export interface SystemStats {
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly totalSolManaged: number;
  readonly totalTransactions: number;
  readonly networkStatus: 'healthy' | 'degraded' | 'down';
  readonly network: string;
  readonly uptime: number;
}

// ─── Event Types ─────────────────────────────────────────────────────────

export type SystemEvent =
  | AgentCreatedEvent
  | AgentStatusChangedEvent
  | AgentActionEvent
  | TransactionEvent
  | BalanceChangedEvent
  | SystemErrorEvent;

export interface BaseEvent {
  readonly id: string;
  readonly timestamp: string | Date;
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

// ─── API Response Types ──────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: string | Date;
}

export interface Result<T, E = Error> {
  ok: boolean;
  value?: T;
  error?: E;
}

// ─── BYOA Types ──────────────────────────────────────────────────────────

export interface BYOARegistrationResult {
  agentId: string;
  controlToken: string;
  walletId: string;
  walletPublicKey: string;
  message?: string;
}

export interface ServicePolicy {
  readonly serviceId: string;
  readonly tenantId?: string;
  readonly capPerTransaction: number;
  readonly dailyBudgetAmount: number;
  readonly cooldownSeconds: number;
  readonly allowedPrograms?: string[];
  readonly blockedPrograms?: string[];
  readonly metadata?: Record<string, unknown>;
}

export interface ServiceUsageRecord {
  readonly serviceId: string;
  readonly tenantId?: string;
  readonly walletId: string;
  readonly totalSpentToday: number;
  readonly lastCallAt?: string | Date;
  readonly callCountToday: number;
  readonly dailyResetAt: string | Date;
}

export interface X402PaymentDescriptor {
  readonly paymentAddress: string;
  readonly amount: number;
  readonly requestId: string;
  readonly expiresAt: string | Date;
  readonly accessToken?: string;
}
