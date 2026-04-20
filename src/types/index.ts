/**
 * Type Definitions Module
 *
 * Central export for all type definitions across the system.
 *
 * EXPORTS:
 * - Shared types: Common between backend and frontend
 * - Internal types: Backend-only (never in API responses)
 * - Helper functions: Result type handlers
 */

// ============================================
// SHARED TYPES (Frontend + Backend)
// ============================================

export type { 
  // Agent types
  AgentStatus,
  AgentStrategy,
  ExecutionSettings,
  Agent,
  
  // Transaction types
  TransactionStatus,
  TransactionType,
  Transaction,
  
  // Balance types
  TokenBalance,
  SystemStats,
  
  // Event types
  SystemEvent,
  BaseEvent,
  AgentCreatedEvent,
  AgentStatusChangedEvent,
  AgentActionEvent,
  TransactionEvent,
  BalanceChangedEvent,
  SystemErrorEvent,
  
  // API types
  ApiResponse,
  
  // External/BYOA types
  ExternalAgentType,
  ExternalAgentStatus,
  SupportedIntentType,
  ExternalAgent,
  IntentHistoryRecord,
  
  // Strategy types
  StrategyFieldDescriptor,
  StrategyDefinition,
  
  // Helper types
  Result,
} from './shared.js';

export {
  success,
  failure,
} from './shared.js';

// ============================================
// TENANT TYPES (Backend + Frontend)
// ============================================

export type {
  // Tenant types
  Tenant,
  TenantContext,
  ApiToken,
  TenantSession,
  TenantStorageRecord,
  ApiTokenStorageRecord,
} from './tenant.js';

// ============================================
// INTERNAL TYPES (Backend-only)
// ============================================

export type {
  // Wallet types
  WalletInfo,
  BalanceInfo,
  InternalWallet,
  
  // Agent types
  AgentInfo,
  AgentConfig,
  
  // Transaction types
  TransactionRecord,
  
  // Intent types
  Intent,
  BaseIntent,
  AirdropIntent,
  TransferSolIntent,
  TransferTokenIntent,
  CheckBalanceIntent,
  AutonomousIntent,
  ServicePaymentIntent,
  
  // Policy types
  Policy,
  ServicePolicy,
  ServiceUsageRecord,
  
  // Payment protocol types
  X402PaymentDescriptor,
  MPPMessage,
  
  // RPC types
  InstructionDescriptor,
} from './internal.js';

export {
  DEFAULT_POLICY,
} from './internal.js';
