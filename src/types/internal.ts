/**
 * Internal Backend Type Definitions
 *
 * These types are NEVER exposed to the frontend.
 * They handle sensitive information like encrypted keys, internal state, and backend-only logic.
 */

import type { TransactionSignature } from '@solana/web3.js';
import type { Agent, ExecutionSettings, Transaction as TransactionShared } from './shared.js';

// ============================================
// WALLET LAYER TYPES (Backend-only)
// ============================================

/**
 * Public wallet information — safe metadata only.
 */
export interface WalletInfo {
  readonly id: string;
  readonly publicKey: string;
  readonly createdAt: Date;
  readonly label?: string;
}

/**
 * Balance information.
 */
export interface BalanceInfo {
  readonly sol: number;
  readonly lamports: bigint;
}

/**
 * INTERNAL wallet representation with encrypted key.
 * MUST NEVER be serialized to JSON/API response.
 * MUST NEVER touch the frontend.
 */
export interface InternalWallet {
  readonly id: string;
  readonly publicKey: string;
  readonly encryptedSecretKey: string; // NEVER expose
  readonly createdAt: Date;
  readonly label?: string;
}

// ============================================
// TRANSACTION TYPES (Backend-extended)
// ============================================

/**
 * Internal transaction record with Solana signature.
 */
export interface TransactionRecord extends TransactionShared {
  readonly signature?: TransactionSignature;
}

// ============================================
// AGENT TYPES (Backend-extended)
// ============================================

/**
 * Complete agent info — extends shared Agent with creation time.
 */
export interface AgentInfo extends Agent {
  // Inherits from shared Agent; no additional backend-only fields needed
  // All agent info is already safe to expose
}

/**
 * Agent configuration for creation and updates.
 */
export interface AgentConfig {
  readonly name: string;
  readonly strategy: string;
  readonly strategyParams?: Record<string, unknown>;
  readonly executionSettings?: Partial<ExecutionSettings>;
}

// ============================================
// INTENT TYPES (Backend-internal)
// ============================================

/**
 * Intents are high-level actions that agents emit.
 * These are validated and executed by the wallet layer.
 */
export type Intent =
  | AirdropIntent
  | TransferSolIntent
  | TransferTokenIntent
  | CheckBalanceIntent
  | AutonomousIntent
  | ServicePaymentIntent;

export interface BaseIntent {
  readonly id: string;
  readonly agentId: string;
  readonly timestamp: Date;
}

export interface AirdropIntent extends BaseIntent {
  readonly type: 'airdrop';
  readonly amount: number; // SOL
}

export interface TransferSolIntent extends BaseIntent {
  readonly type: 'transfer_sol';
  readonly recipient: string;
  readonly amount: number; // SOL
}

export interface TransferTokenIntent extends BaseIntent {
  readonly type: 'transfer_token';
  readonly mint: string;
  readonly recipient: string;
  readonly amount: number;
}

export interface CheckBalanceIntent extends BaseIntent {
  readonly type: 'check_balance';
}

/**
 * Autonomous intent — the agent decides what action to take.
 * No policy restrictions are enforced; all actions are logged.
 * The `action` field describes what the agent chose to do,
 * and `params` carries the action-specific data.
 *
 * Supported actions:
 * - airdrop, transfer_sol, transfer_token, query_balance  (built-in helpers)
 * - execute_instructions  — submit an array of arbitrary Solana instructions
 * - raw_transaction       — submit a base64-encoded serialized transaction (unsigned)
 * - swap                  — execute a token swap (Jupiter, PumpSwap, Raydium, etc.)
 * - create_token          — create / launch a token (Pump.fun, Bonk.fun, etc.)
 * - any other string      — future-proofed; if the platform doesn't recognise
 *                           the action it will try to execute_instructions
 */
export interface AutonomousIntent extends BaseIntent {
  readonly type: 'autonomous';
  readonly action: string; // fully open — no enum restriction
  readonly params: Record<string, unknown>;
}

/**
 * Service payment intent — x402/MPP payment over Solana.
 */
export interface ServicePaymentIntent extends BaseIntent {
  readonly type: 'service_payment';
  readonly serviceId: string;
  readonly amount: number; // SOL
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
}

// ============================================
// POLICY TYPES (Backend-internal)
// ============================================

/**
 * Policies define constraints on agent actions
 */
export interface Policy {
  readonly maxTransferAmount: number; // SOL
  readonly maxDailyTransfers: number;
  readonly allowedRecipients?: string[];
  readonly blockedRecipients?: string[];
  readonly requireMinBalance: number; // SOL
}

export const DEFAULT_POLICY: Policy = {
  maxTransferAmount: 1.0, // 1 SOL max per transfer
  maxDailyTransfers: 100,
  requireMinBalance: 0.01, // Keep 0.01 SOL for fees
};

/**
 * Service-scoped payment policies for x402/MPP pay-per-use model.
 * Enforced per BYOA service interaction.
 */
export interface ServicePolicy {
  readonly serviceId: string; // e.g., "api.inference.ai" or "swap.dex"
  readonly capPerTransaction: number; // SOL — max spend per call
  readonly dailyBudgetAmount: number; // SOL — total daily spend limit
  readonly cooldownSeconds: number; // Min seconds between consecutive calls (0 = no cooldown)
  readonly allowedPrograms?: string[]; // Program IDs; if set, only these programs allowed
  readonly blockedPrograms?: string[];
  readonly metadata?: Record<string, unknown>;
}

/**
 * Service usage record — tracks consumption and enforces budgets.
 */
export interface ServiceUsageRecord {
  readonly serviceId: string;
  readonly walletId: string;
  readonly totalSpentToday: number;
  readonly lastCallAt?: Date;
  readonly callCountToday: number;
  readonly dailyResetAt: Date; // Midnight UTC
}

// ============================================
// PAYMENT PROTOCOL TYPES
// ============================================

/**
 * x402 protocol payment descriptor.
 */
export interface X402PaymentDescriptor {
  readonly paymentAddress: string; // Service's Solana account
  readonly amount: number; // Lamports
  readonly requestId: string; // Correlation ID
  readonly expiresAt: Date;
  readonly accessToken?: string;
}

/**
 * MPP (Micropayment Protocol) message format.
 */
export interface MPPMessage {
  readonly version: '1.0';
  readonly messageType: 'payment_request' | 'payment_proof' | 'refund_request';
  readonly serviceId: string;
  readonly walletPublicKey: string;
  readonly amount: number; // Lamports
  readonly nonce: string; // Random nonce for replay prevention
  readonly signature?: string; // Ed25519 signature
  readonly timestamp: Date;
}

// ============================================
// RPC TYPES
// ============================================

/**
 * Instruction descriptor sent by the autonomous agent.
 * Each instruction targets a specific program with accounts and data.
 */
export interface InstructionDescriptor {
  readonly programId: string; // base58 program address
  readonly keys: ReadonlyArray<{
    readonly pubkey: string; // base58
    readonly isSigner: boolean;
    readonly isWritable: boolean;
  }>;
  readonly data: string; // base64-encoded instruction data
}
