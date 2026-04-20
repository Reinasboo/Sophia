/**
 * Core Type Definitions for Sophia (Autonomous Wallet System)
 *
 * DEPRECATED: Import from src/types instead for new code.
 * This file is maintained for backwards compatibility only.
 *
 * Migration path:
 * - import {...} from '../utils/types' → import {...} from '../types'
 *
 * These types define the strict boundaries between system layers.
 * Private keys are NEVER exposed in these interfaces.
 */



// ============================================
// RE-EXPORTS FROM CENTRALIZED TYPES MODULE
// ============================================
// All types are now centralized in src/types/ for easier maintenance
// and clear separation between shared (frontend-safe) and internal (backend-only) types.

// Shared types (Frontend + Backend)
export type {
  AgentStatus,
  AgentStrategy,
  ExecutionSettings,
  Agent,
  TransactionStatus,
  TransactionType,
  Transaction,
  TokenBalance,
  SystemStats,
  SystemEvent,
  BaseEvent,
  AgentCreatedEvent,
  AgentStatusChangedEvent,
  AgentActionEvent,
  TransactionEvent,
  BalanceChangedEvent,
  SystemErrorEvent,
  ApiResponse,
  ExternalAgentType,
  ExternalAgentStatus,
  SupportedIntentType,
  ExternalAgent,
  IntentHistoryRecord,
  StrategyFieldDescriptor,
  StrategyDefinition,
  Result,
} from '../types/shared.js';

export {
  success,
  failure,
} from '../types/shared.js';

// Internal types (Backend-only)
export type {
  WalletInfo,
  BalanceInfo,
  InternalWallet,
  AgentInfo,
  AgentConfig,
  TransactionRecord,
  Intent,
  BaseIntent,
  AirdropIntent,
  TransferSolIntent,
  TransferTokenIntent,
  CheckBalanceIntent,
  AutonomousIntent,
  ServicePaymentIntent,
  Policy,
  ServicePolicy,
  ServiceUsageRecord,
  X402PaymentDescriptor,
  MPPMessage,
  InstructionDescriptor,
} from '../types/internal.js';

export {
  DEFAULT_POLICY,
} from '../types/internal.js';
