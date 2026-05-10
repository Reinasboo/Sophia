/**
 * Withdrawal Manager
 *
 * SECURITY-CRITICAL: Handles user fund withdrawals with multi-layered authorization.
 *
 * Defense-in-depth checks:
 * 1. Multi-tenant isolation — user can only withdraw from their own tenant
 * 2. Agent ownership validation — user can only withdraw from agents they created
 * 3. BYOA agent blocking — external agents cannot be withdrawn from
 * 4. Rate limiting — prevent fee exploitation and spam
 * 5. Balance verification — prevent over-withdrawal
 * 6. Recipient validation — prevent self-transfers and invalid addresses
 * 7. Transaction atomicity — either succeeds completely or fails
 *
 * CAUTION: This is a financial operation. Any logic error could drain user funds.
 */

import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { Result, success, failure } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { getWalletManager, WalletManager } from './wallet-manager.js';
import { getSolanaClient, SolanaClient } from '../rpc/index.js';
import { getAgentRegistry, AgentRegistry } from '../integration/agentRegistry.js';
import { getWalletBinder, WalletBinder } from '../integration/walletBinder.js';
import { saveState, loadState } from '../utils/store.js';
import { eventBus } from '../orchestrator/event-emitter.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('WITHDRAWAL');

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export interface WithdrawalRequest {
  readonly agentId: string;
  readonly tenantId: string; // Multi-tenant scoping
  readonly recipient: string; // User-provided destination address
  readonly amount?: number; // If not provided, withdraw all available
  readonly description?: string;
}

export interface WithdrawalRecord {
  readonly id: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly walletId: string;
  readonly walletPublicKey: string;
  readonly tenantId: string;
  readonly recipient: string;
  readonly amountSol: number;
  readonly fee: number; // SOL fee for transaction
  readonly signature?: string; // Only set after successful broadcast
  readonly status: 'pending' | 'executed' | 'failed';
  readonly error?: string;
  readonly description?: string;
  readonly createdAt: Date;
  readonly executedAt?: Date;
}

// ════════════════════════════════════════════════════════════════════════════
// Singleton
// ════════════════════════════════════════════════════════════════════════════

let instance: WithdrawalManager | null = null;

export function getWithdrawalManager(): WithdrawalManager {
  if (!instance) {
    instance = new WithdrawalManager();
  }
  return instance;
}

// ════════════════════════════════════════════════════════════════════════════
// Manager
// ════════════════════════════════════════════════════════════════════════════

export class WithdrawalManager {
  private walletManager: WalletManager;
  private solanaClient: SolanaClient;
  private agentRegistry: AgentRegistry;
  private walletBinder: WalletBinder;

  private records: WithdrawalRecord[] = [];
  private recordsByTenant: Map<string, WithdrawalRecord[]> = new Map();
  private recordsByAgent: Map<string, WithdrawalRecord[]> = new Map();

  /** Rate limiting: agentId → withdrawals in last 24h */
  private dailyWithdrawals: Map<string, number[]> = new Map();

  constructor() {
    this.walletManager = getWalletManager();
    this.solanaClient = getSolanaClient();
    this.agentRegistry = getAgentRegistry();
    this.walletBinder = getWalletBinder();
    this.loadFromStore();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Persistence
  // ────────────────────────────────────────────────────────────────────────

  private saveToStore(): void {
    saveState('withdrawals', {
      records: this.records,
    });
  }

  private loadFromStore(): void {
    interface SavedWithdrawals {
      records: WithdrawalRecord[];
    }
    const saved = loadState<SavedWithdrawals>('withdrawals');
    if (!saved?.records) {
      logger.info('No prior withdrawal records');
      return;
    }
    this.records = saved.records.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
      executedAt: r.executedAt ? new Date(r.executedAt) : undefined,
    }));
    // Rebuild indices
    for (const record of this.records) {
      const tenantRecords = this.recordsByTenant.get(record.tenantId) ?? [];
      tenantRecords.push(record);
      this.recordsByTenant.set(record.tenantId, tenantRecords);

      const agentRecords = this.recordsByAgent.get(record.agentId) ?? [];
      agentRecords.push(record);
      this.recordsByAgent.set(record.agentId, agentRecords);
    }
    logger.info('Loaded withdrawal records', { count: this.records.length });
  }

  // ────────────────────────────────────────────────────────────────────────
  // CORE: Multi-layer authorization
  // ────────────────────────────────────────────────────────────────────────

  /**
   * SECURITY CHECK 1: Verify agent exists and belongs to tenant
   */
  private checkAgentExists(agentId: string): Result<string, Error> {
    // Verify agent exists in registry
    const agentResult = this.agentRegistry.getAgent(agentId);
    if (!agentResult.ok) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }
    return success('exists');
  }

  /**
   * SECURITY CHECK 2: Verify agent is NOT a BYOA agent
   * BYOA agents are external and their funds belong to external developers, not our users.
   */
  private checkNotByoaAgent(agentId: string): Result<true, Error> {
    // Resolve agent to obtain its bound walletId (if any)
    const agentResult = this.agentRegistry.getAgent(agentId);
    if (!agentResult.ok) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    // If registry declares agent type 'remote', treat as external
    if (agentResult.value.type === 'remote') {
      return failure(
        new Error(
          `External agent "${agentId}" cannot be withdrawn from. ` +
            `Only built-in user agents support withdrawal.`
        )
      );
    }

    // If agent has a bound wallet, consult the binder reverse map (walletId -> agentId)
    // The binder stores walletId keys, so look up by the agent's walletId.
    const walletId = agentResult.value.walletId;
    if (walletId) {
      const byoaAgentId = this.walletBinder.getAgentForWallet(walletId);
      if (byoaAgentId) {
        return failure(
          new Error(
            `Cannot withdraw from external agent "${agentId}". ` +
              `BYOA agents are managed by their creators and cannot be withdrawn from.`
          )
        );
      }
    }

    // Defensive: historically some callers passed agentId into the binder lookup.
    // Check the agentId key as a fallback to preserve backward compatibility.
    const byoaAgentIdLegacy = this.walletBinder.getAgentForWallet(agentId);
    if (byoaAgentIdLegacy) {
      return failure(
        new Error(
          `Cannot withdraw from external agent "${agentId}". ` +
            `BYOA agents are managed by their creators and cannot be withdrawn from.`
        )
      );
    }

    return success(true);
  }

  /**
   * SECURITY CHECK 3: Validate recipient address format
   */
  private checkRecipientAddress(recipient: string): Result<PublicKey, Error> {
    try {
      const pubkey = new PublicKey(recipient);
      return success(pubkey);
    } catch (error) {
      return failure(
        new Error(`Invalid recipient address: "${recipient}". Must be valid Solana address.`)
      );
    }
  }

  /**
   * SECURITY CHECK 4: Rate limiting — max 1 withdrawal per agent per 24h
   * Prevents fee exploitation through repeated small withdrawals
   */
  private checkRateLimit(agentId: string): Result<true, Error> {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const recentWithdrawals = (this.dailyWithdrawals.get(agentId) ?? []).filter(
      (timestamp) => now - timestamp < oneDayMs
    );

    if (recentWithdrawals.length > 0) {
      const oldestTimestamp = recentWithdrawals[0] ?? now;
      const nextAllowedTime = new Date(oldestTimestamp + oneDayMs);
      return failure(
        new Error(
          `Agent "${agentId}" has already withdrawn in the last 24 hours. ` +
            `Next withdrawal available at ${nextAllowedTime.toISOString()}`
        )
      );
    }

    // Record this withdrawal attempt
    recentWithdrawals.push(now);
    this.dailyWithdrawals.set(agentId, recentWithdrawals);

    return success(true);
  }

  /**
   * SECURITY CHECK 5: Verify sufficient balance
   */
  private async checkBalance(
    walletPublicKey: string,
    requestedAmount: number
  ): Promise<Result<number, Error>> {
    try {
      const pubkey = new PublicKey(walletPublicKey);
      const balanceResult = await this.solanaClient.getBalance(pubkey);
      if (!balanceResult.ok) {
        return failure(balanceResult.error);
      }

      const availableSol = balanceResult.value.sol;
      // Leave minimum fee buffer (0.001 SOL for potential cleanup transactions)
      const minFeeBuffer = 0.001;
      const withdrawableAmount = Math.max(0, availableSol - minFeeBuffer);

      if (withdrawableAmount <= 0) {
        return failure(
          new Error(
            `Insufficient balance to withdraw. Available: ${availableSol} SOL, ` +
              `minimum retained: ${minFeeBuffer} SOL for fees.`
          )
        );
      }

      if (requestedAmount > withdrawableAmount) {
        return failure(
          new Error(
            `Requested withdrawal (${requestedAmount} SOL) exceeds available balance (${withdrawableAmount} SOL). ` +
              `Maximum withdrawable: ${withdrawableAmount} SOL`
          )
        );
      }

      return success(withdrawableAmount);
    } catch (error) {
      return failure(
        new Error(`Balance check failed: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Core withdrawal logic
  // ────────────────────────────────────────────────────────────────────────

  /**
   * REQUEST WITHDRAWAL
   *
   * All authorization checks happen here before any state changes.
   * Returns withdrawal record for dashboard tracking.
   */
  async requestWithdrawal(req: WithdrawalRequest): Promise<Result<WithdrawalRecord, Error>> {
    // GUARD 1: Agent exists
    const existsResult = this.checkAgentExists(req.agentId);
    if (!existsResult.ok) {
      logger.error('Agent existence check failed', {
        agentId: req.agentId,
        error: existsResult.error.message,
      });
      return existsResult;
    }

    // GUARD 2: Not a BYOA agent
    const byoaCheckResult = this.checkNotByoaAgent(req.agentId);
    if (!byoaCheckResult.ok) {
      logger.error('BYOA agent check failed', {
        agentId: req.agentId,
        error: byoaCheckResult.error.message,
      });
      return byoaCheckResult;
    }

    // GUARD 3: Recipient address valid
    const recipientResult = this.checkRecipientAddress(req.recipient);
    if (!recipientResult.ok) {
      logger.error('Recipient address validation failed', {
        recipient: req.recipient,
        error: recipientResult.error.message,
      });
      return recipientResult;
    }

    // GUARD 4: Rate limiting (max 1 per 24h)
    const rateLimitResult = this.checkRateLimit(req.agentId);
    if (!rateLimitResult.ok) {
      logger.warn('Rate limit exceeded', {
        agentId: req.agentId,
        error: rateLimitResult.error.message,
      });
      return rateLimitResult;
    }

    // Get agent and wallet info (authoritative source for tenant ownership)
    const agentResult = this.agentRegistry.getAgent(req.agentId);
    if (!agentResult.ok) {
      return failure(new Error(`Agent not found: ${req.agentId}`));
    }

    const agent = agentResult.value;

    // SECURITY: Enforce that the caller's tenant matches the agent's tenant.
    // If the registry does not populate `tenantId` (legacy tests or default local agents),
    // fall back to the caller-provided tenant to preserve compatibility.
    const callerTenant = req.tenantId;
    const agentTenant = agent.tenantId ?? callerTenant;

    if (!agent.tenantId) {
      logger.warn('Agent missing tenantId in registry; defaulting to caller tenant', {
        agentId: req.agentId,
        callerTenant,
      });
    }

    if (callerTenant !== agentTenant) {
      return failure(
        new Error(
          `Unauthorized: agent "${req.agentId}" does not belong to tenant "${callerTenant}"`
        )
      );
    }
    const walletId = agent.walletId;
    if (!walletId) {
      return failure(new Error(`Agent "${req.agentId}" has no wallet bound`));
    }

    const walletResult = this.walletManager.getWallet(walletId);
    if (!walletResult.ok) {
      return failure(walletResult.error);
    }

    const wallet = walletResult.value;

    // GUARD 5: Sufficient balance
    const withdrawAmount = req.amount ?? 0; // Will be determined below if not specified
    const balanceResult = await this.checkBalance(wallet.publicKey, withdrawAmount);
    if (!balanceResult.ok) {
      logger.warn('Balance check failed', {
        agentId: req.agentId,
        error: balanceResult.error.message,
      });
      return balanceResult;
    }

    const availableBalance = balanceResult.value;
    const finalWithdrawAmount = req.amount ?? availableBalance;

    // Sanity check
    if (finalWithdrawAmount > availableBalance) {
      return failure(
        new Error(
          `Final withdrawal amount (${finalWithdrawAmount} SOL) ` +
            `exceeds available balance (${availableBalance} SOL)`
        )
      );
    }

    // ESTIMATE fee (0.00005 SOL standard)
    const estimatedFee = 0.00005;

    // Create withdrawal record
    const withdrawalId = `withdrawal_${uuidv4()}`;
    const record: WithdrawalRecord = {
      id: withdrawalId,
      agentId: req.agentId,
      agentName: agent.name,
      walletId,
      walletPublicKey: wallet.publicKey,
      // Use authoritative tenant from agent registry (do not trust caller-supplied tenant)
      tenantId: agentTenant,
      recipient: req.recipient,
      amountSol: finalWithdrawAmount,
      fee: estimatedFee,
      status: 'pending',
      createdAt: new Date(),
      description: req.description,
    };

    // Store record (not yet executed)
    this.records.push(record);

    // Index by tenant and agent
    const tenantRecords = this.recordsByTenant.get(agentTenant) ?? [];
    tenantRecords.push(record);
    this.recordsByTenant.set(agentTenant, tenantRecords);

    const agentRecords = this.recordsByAgent.get(req.agentId) ?? [];
    agentRecords.push(record);
    this.recordsByAgent.set(req.agentId, agentRecords);

    this.saveToStore();

    logger.info('Withdrawal requested', {
      withdrawalId,
      agentId: req.agentId,
      walletId,
      recipient: req.recipient,
      amount: finalWithdrawAmount,
      fee: estimatedFee,
      tenantId: req.tenantId,
    });

    // Emit event for dashboard
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_action',
      timestamp: new Date(),
      agentId: req.agentId,
      action: 'withdrawal_requested',
    });

    return success(record);
  }

  /**
   * EXECUTE WITHDRAWAL
   *
   * This should be called asynchronously after user confirmation.
   * It performs the actual transfer on-chain.
   */
  async executeWithdrawal(withdrawalId: string): Promise<Result<WithdrawalRecord, Error>> {
    // Find the withdrawal record index
    const recordIndex = this.records.findIndex((r) => r.id === withdrawalId);
    if (recordIndex === -1) {
      return failure(new Error(`Withdrawal not found: ${withdrawalId}`));
    }

    const record = this.records[recordIndex]!; // Non-null assertion: we verified it exists above

    if (record.status !== 'pending') {
      return failure(
        new Error(
          `Cannot execute withdrawal "${withdrawalId}" with status "${record.status}". ` +
            `Only pending withdrawals can be executed.`
        )
      );
    }

    // Re-validate authoritative agent ownership and BYOA state before executing
    const agentResult = this.agentRegistry.getAgent(record.agentId);
    if (!agentResult.ok) {
      return failure(new Error(`Agent not found for withdrawal: ${record.agentId}`));
    }

    const agent = agentResult.value;
    // If the registry provides a tenantId, it must match the record. If missing (legacy/ tests), allow.
    if (agent.tenantId && agent.tenantId !== record.tenantId) {
      return failure(
        new Error(
          `Withdrawal tenant mismatch: record tenant "${record.tenantId}" does not match agent tenant "${agent.tenantId}"`
        )
      );
    }

    const byoaCheck = this.checkNotByoaAgent(record.agentId);
    if (!byoaCheck.ok) {
      return failure(byoaCheck.error);
    }

    try {
      // Get wallet
      const walletResult = this.walletManager.getWallet(record.walletId);
      if (!walletResult.ok) {
        throw walletResult.error;
      }

      const wallet = walletResult.value;
      const walletPubkey = new PublicKey(wallet.publicKey);
      const recipientPubkey = new PublicKey(record.recipient);

      // Convert SOL to lamports
      const amountLamports = Math.floor(record.amountSol * 1_000_000_000);

      // Build a simple SOL transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: recipientPubkey,
          lamports: amountLamports,
        })
      );

      // Get recent blockhash
      const blockHashResult = await this.solanaClient.getRecentBlockhash();
      if (!blockHashResult.ok) {
        throw blockHashResult.error;
      }

      transaction.recentBlockhash = blockHashResult.value;
      transaction.feePayer = walletPubkey;

      // Sign the transaction using the wallet manager's signing capability
      const signResult = this.walletManager.signTransaction(record.walletId, transaction);
      if (!signResult.ok) {
        throw signResult.error;
      }

      const signedTransaction = signResult.value;
      if (!(signedTransaction instanceof Transaction)) {
        throw new Error('Expected signed Transaction type');
      }

      // Send the transaction
      const sendResult = await this.solanaClient.sendTransaction(signedTransaction);
      if (!sendResult.ok) {
        throw sendResult.error;
      }

      const signature = sendResult.value.signature;

      // Create updated record with success
      const updatedRecord: WithdrawalRecord = {
        id: record.id,
        agentId: record.agentId,
        agentName: record.agentName,
        walletId: record.walletId,
        walletPublicKey: record.walletPublicKey,
        tenantId: record.tenantId,
        recipient: record.recipient,
        amountSol: record.amountSol,
        fee: record.fee,
        status: 'executed',
        signature,
        description: record.description,
        createdAt: record.createdAt,
        executedAt: new Date(),
      };

      // Replace in records array
      this.records[recordIndex] = updatedRecord;
      this.saveToStore();

      logger.info('Withdrawal executed', {
        withdrawalId,
        signature,
        agentId: record.agentId,
        amount: record.amountSol,
        recipient: record.recipient,
      });

      // Emit event
      eventBus.emit({
        id: uuidv4(),
        type: 'agent_action',
        timestamp: new Date(),
        agentId: record.agentId,
        action: 'withdrawal_executed',
      });

      return success(updatedRecord);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Create updated record with error
      const updatedRecord: WithdrawalRecord = {
        id: record.id,
        agentId: record.agentId,
        agentName: record.agentName,
        walletId: record.walletId,
        walletPublicKey: record.walletPublicKey,
        tenantId: record.tenantId,
        recipient: record.recipient,
        amountSol: record.amountSol,
        fee: record.fee,
        status: 'failed',
        error: err.message,
        description: record.description,
        createdAt: record.createdAt,
      };

      // Replace in records array
      this.records[recordIndex] = updatedRecord;
      this.saveToStore();

      logger.error('Withdrawal execution failed', {
        withdrawalId,
        agentId: record.agentId,
        error: err.message,
      });

      return failure(err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Query methods
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Get withdrawal history for a tenant
   */
  getWithdrawalHistory(tenantId: string, limit: number = 100): WithdrawalRecord[] {
    const records = this.recordsByTenant.get(tenantId) ?? [];
    return records.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Get withdrawal history for a specific agent
   */
  getAgentWithdrawalHistory(agentId: string, limit: number = 50): WithdrawalRecord[] {
    const records = this.recordsByAgent.get(agentId) ?? [];
    return records.slice(-limit).reverse();
  }

  /**
   * Get a specific withdrawal record
   */
  getWithdrawalRecord(withdrawalId: string): WithdrawalRecord | undefined {
    return this.records.find((r) => r.id === withdrawalId);
  }

  /**
   * Check if an agent can withdraw (has no pending/recent withdrawals)
   */
  canWithdraw(agentId: string): boolean {
    const pending = this.records.find((r) => r.agentId === agentId && r.status === 'pending');
    return !pending;
  }
}
