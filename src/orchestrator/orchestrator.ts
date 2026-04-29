/**
 * Orchestrator
 *
 * The central coordination layer that:
 * - Binds agents to wallets
 * - Manages agent lifecycle
 * - Executes agent intents
 * - Emits system events
 *
 * This is the bridge between agents (decision makers) and wallets (executors).
 */

import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentInfo,
  AgentConfig,
  AgentStatus,
  SystemStats,
  TransactionRecord,
  Intent,
  Result,
  success,
  failure,
} from '../types/index.js';
import { getConfig } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { getWalletManager, WalletManager } from '../wallet/index.js';
import {
  getSolanaClient,
  buildSolTransfer,
  buildTokenTransfer,
  SolanaClient,
} from '../rpc/index.js';
import { BaseAgent, AgentContext, createAgent } from '../agent/index.js';
import { getStrategyRegistry } from '../agent/strategy-registry.js';
import { getIntentRouter } from '../integration/intentRouter.js';
import type { SupportedIntentType } from '../integration/agentRegistry.js';
import { eventBus } from './event-emitter.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('ORCHESTRATOR');

/**
 * H-8 FIX: Wrap a promise with a timeout to prevent hanging operations.
 * If the promise doesn't resolve within timeoutMs, it rejects with a timeout error.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operationName} exceeded timeout of ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

interface ManagedAgent {
  agent: BaseAgent;
  intervalId?: NodeJS.Timeout;
  cycleInProgress?: boolean; // Guard against overlapping async cycles
}

/** Minimal serialisable snapshot of an agent for disk persistence. */
interface SavedAgent {
  id: string;
  name: string;
  strategy: string;
  strategyParams: Record<string, unknown>;
  executionSettings: import('../utils/types.js').ExecutionSettings;
  walletId: string;
  walletPublicKey: string;
  createdAt: string;
  lastActionAt?: string;
  wasRunning: boolean;
}

/**
 * Orchestrator - Central coordination
 */
export class Orchestrator {
  private agents: Map<string, ManagedAgent> = new Map();
  private walletManager: WalletManager;
  private solanaClient: SolanaClient;
  private transactions: TransactionRecord[] = [];
  private readonly maxTransactions: number = 10000;
  // Index for O(1) access to transactions by walletId
  private transactionsByWalletId: Map<string, TransactionRecord[]> = new Map();
  private startTime: Date;
  private loopInterval: number;
  private maxAgents: number;

  constructor() {
    const config = getConfig();
    this.walletManager = getWalletManager();
    this.solanaClient = getSolanaClient();
    this.startTime = new Date();
    this.loopInterval = config.AGENT_LOOP_INTERVAL_MS;
    this.maxAgents = config.MAX_AGENTS;
    this.scheduleAgentDailyReset();
  }

  /**
   * Reset daily counters on all agents at midnight.
   * Without this, agent-level limits (airdropsToday, transfersToday)
   * become permanent after one day.
   */
  private scheduleAgentDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      for (const managed of this.agents.values()) {
        const agent = managed.agent;
        // Check if agent has resetDailyCounters method without unsafe casting
        if ('resetDailyCounters' in agent && typeof agent.resetDailyCounters === 'function') {
          agent.resetDailyCounters();
        }
      }
      logger.info('Agent daily counters reset');
      this.scheduleAgentDailyReset();
    }, msUntilMidnight);
  }

  /**
   * Create a new agent with an associated wallet
   */
  async createAgent(config: AgentConfig): Promise<Result<AgentInfo, Error>> {
    // Check agent limit
    if (this.agents.size >= this.maxAgents) {
      return failure(new Error(`Maximum agent limit reached (${this.maxAgents})`));
    }

    // MULTI-TENANT: Require tenantId for agent creation
    const tenantId = config.tenantId;
    if (!tenantId) {
      return failure(new Error('tenantId is required for agent creation'));
    }

    // Create wallet for agent (scoped to tenant)
    const walletResult = this.walletManager.createWallet(config.name, tenantId);
    if (!walletResult.ok) {
      return failure(walletResult.error);
    }

    const wallet = walletResult.value;

    // Create agent
    const agentResult = createAgent({
      config,
      walletId: wallet.id,
      walletPublicKey: wallet.publicKey,
    });

    if (!agentResult.ok) {
      // Clean up wallet if agent creation fails
      this.walletManager.deleteWallet(wallet.id, tenantId);
      return failure(agentResult.error);
    }

    const agent = agentResult.value;

    // Store managed agent
    this.agents.set(agent.id, { agent });

    this.saveToStore();

    // Emit event
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_created',
      timestamp: new Date(),
      agent: agent.getInfo(),
    });

    logger.info('Agent created and bound to wallet', {
      agentId: agent.id,
      walletId: wallet.id,
      tenantId,
      strategy: config.strategy,
    });

    return success(agent.getInfo());
  }

  /**
   * Start an agent's autonomous loop
   */
  startAgent(agentId: string): Result<true, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    if (managed.intervalId) {
      return failure(new Error('Agent is already running'));
    }

    const execSettings = managed.agent.getExecutionSettings();
    if (!execSettings.enabled) {
      return failure(new Error('Agent is disabled via execution settings'));
    }

    managed.agent.setStatus('idle');

    const interval = execSettings.cycleIntervalMs || this.loopInterval;

    // Start the agent loop
    managed.intervalId = setInterval(async () => {
      await this.runAgentCycle(agentId);
    }, interval);

    // Run first cycle immediately
    this.runAgentCycle(agentId);

    logger.info('Agent started', { agentId, cycleIntervalMs: interval });
    this.saveToStore();
    return success(true);
  }

  /**
   * Stop an agent's autonomous loop
   */
  stopAgent(agentId: string): Result<true, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    if (managed.intervalId) {
      clearInterval(managed.intervalId);
      managed.intervalId = undefined;
    }

    managed.agent.stop();

    logger.info('Agent stopped', { agentId });
    this.saveToStore();
    return success(true);
  }

  /**
   * Pause an agent's decision cycles (reversible, doesn't stop the service)
   */
  pauseAgent(agentId: string): Result<true, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    const currentStatus = managed.agent.getStatus();
    if (currentStatus === 'paused') {
      return failure(new Error('Agent is already paused'));
    }

    managed.agent.setStatus('paused');
    logger.info('Agent paused', { agentId, previousStatus: currentStatus });

    // Emit event
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_status_changed',
      timestamp: new Date(),
      agentId,
      previousStatus: currentStatus as AgentStatus,
      newStatus: 'paused' as AgentStatus,
    });

    this.saveToStore();
    return success(true);
  }

  /**
   * Resume an agent's decision cycles from pause state
   */
  resumeAgent(agentId: string): Result<true, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    const currentStatus = managed.agent.getStatus();
    if (currentStatus !== 'paused') {
      return failure(
        new Error(`Cannot resume agent with status "${currentStatus}" (must be "paused")`)
      );
    }

    managed.agent.setStatus('idle');
    logger.info('Agent resumed', { agentId, previousStatus: currentStatus });

    // Emit event
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_status_changed',
      timestamp: new Date(),
      agentId,
      previousStatus: currentStatus as AgentStatus,
      newStatus: 'idle' as AgentStatus,
    });

    this.saveToStore();
    return success(true);
  }

  /**
   * Execute a single agent decision cycle.
   *
   * Performs the following steps:
   * 1. Check if previous cycle is still running (prevent overlap)
   * 2. Build execution context (balances, constraints, historical state)
   * 3. Invoke agent.think() to get decision
   * 4. If agent decided to act, execute the intent
   * 5. Update agent status and record action
   *
   * Handles errors gracefully by setting agent status to 'error'.
   * Uses cycleInProgress flag to prevent concurrent cycles.
   *
   * @param agentId - UUID of the agent to run
   * @returns Promise that resolves when cycle completes or is skipped
   */
  private async runAgentCycle(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      logger.warn('Agent not found for cycle', { agentId });
      return;
    }

    // Prevent overlapping cycles if previous cycle is still running
    if (managed.cycleInProgress) {
      logger.debug('Skipping cycle, previous still running', { agentId });
      return;
    }

    const { agent } = managed;

    const agentStatus = agent.getStatus();
    if (agentStatus === 'stopped') {
      return;
    }

    // Skip cycle if agent is paused (but don't mark as error)
    if (agentStatus === 'paused') {
      logger.debug('Agent cycle skipped, agent is paused', { agentId });
      return;
    }

    managed.cycleInProgress = true;

    try {
      // Update status
      agent.setStatus('thinking');

      // Build agent context
      const context = await this.buildAgentContext(agent);
      if (!context.ok) {
        agent.setStatus('error', context.error.message);
        agent.recordAction(false);
        return;
      }

      // Let agent think - wrap in error boundary
      // H-8 FIX: Add 5-second timeout to prevent hanging orchestrator
      let decision;
      try {
        decision = await withTimeout(agent.think(context.value), 5000, 'Agent think()');
      } catch (thinkError) {
        const errMsg = thinkError instanceof Error ? thinkError.message : String(thinkError);
        
        // Special handling for timeout errors
        if (errMsg.includes('timeout')) {
          logger.error('Agent think() timed out - pausing agent', {
            agentId,
            timeout: 5000,
          });
          agent.setStatus('error', `Think timeout (5s exceeded)`);
          // Pause the agent to prevent repeated timeouts
          this.pauseAgent(agentId);
        } else {
          logger.error('Agent think() threw error', { agentId, error: errMsg });
          agent.setStatus('error', `Think failed: ${errMsg}`);
        }
        
        agent.recordAction(false);
        return;
      }

      // Emit action event
      eventBus.emit({
        id: uuidv4(),
        type: 'agent_action',
        timestamp: new Date(),
        agentId: agent.id,
        action: decision.shouldAct ? 'decided_to_act' : 'decided_to_wait',
        details: { reasoning: decision.reasoning },
      });

      // Execute intent if agent decided to act
      if (decision.shouldAct && decision.intent) {
        agent.setStatus('executing');

        try {
          await this.executeIntent(agent, decision.intent, context.value.balance.sol);
          agent.recordAction(true);
        } catch (executeError) {
          const errMsg =
            executeError instanceof Error ? executeError.message : String(executeError);
          logger.error('Intent execution threw error', { agentId, error: errMsg });
          agent.setStatus('error', `Execution failed: ${errMsg}`);
          agent.recordAction(false);
        }
      } else {
        agent.recordAction(false);
      }

      agent.setStatus('idle');
    } catch (error) {
      logger.error('Critical error in agent cycle', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      agent.setStatus('error', String(error));
    } finally {
      managed.cycleInProgress = false;
    }
  }

  /**
   * Build context for agent decision making
   */
  private async buildAgentContext(agent: BaseAgent): Promise<Result<AgentContext, Error>> {
    const walletId = agent.getWalletId();

    // Get public key
    const publicKeyResult = this.walletManager.getPublicKey(walletId);
    if (!publicKeyResult.ok) {
      return failure(publicKeyResult.error);
    }

    // Get balance
    const balanceResult = await this.solanaClient.getBalance(publicKeyResult.value);
    if (!balanceResult.ok) {
      return failure(balanceResult.error);
    }

    // Get token balances
    const tokenBalancesResult = await this.solanaClient.getTokenBalances(publicKeyResult.value);
    const tokenBalances = tokenBalancesResult.ok ? tokenBalancesResult.value : [];

    // Get recent transactions for this agent using index (O(1) lookup + slice)
    const walletTxs = this.transactionsByWalletId.get(walletId) ?? [];
    const recentTxs = walletTxs.slice(-10).map((tx) => tx.signature ?? tx.id);

    return success({
      walletPublicKey: publicKeyResult.value.toBase58(),
      balance: balanceResult.value,
      tokenBalances,
      recentTransactions: recentTxs,
    });
  }

  /**
   * Execute an agent's intent
   */
  /**
   * Map internal intent type names to the SupportedIntentType enum used by
   * the integration layer / intent history.
   */
  private static readonly INTENT_TYPE_MAP: Record<string, SupportedIntentType> = {
    airdrop: 'REQUEST_AIRDROP',
    transfer_sol: 'TRANSFER_SOL',
    transfer_token: 'TRANSFER_TOKEN',
    check_balance: 'QUERY_BALANCE',
    autonomous: 'AUTONOMOUS',
  };

  /**
   * Execute intent based on type and track transaction result
   */
  private async executeAndTrackIntent(
    agent: BaseAgent,
    intent: Intent,
    intentId: string,
    createdAt: Date
  ): Promise<void> {
    const txCountBefore = this.transactions.length;

    // Execute based on intent type
    switch (intent.type) {
      case 'airdrop':
        await this.executeAirdrop(agent, intent.amount);
        break;

      case 'transfer_sol':
        await this.executeTransfer(agent, intent.recipient, intent.amount);
        break;

      case 'transfer_token':
        await this.executeTokenTransfer(agent, intent.mint, intent.recipient, intent.amount);
        break;

      case 'check_balance': {
        // Balance is already in context — record as executed
        const context = await this.buildAgentContext(agent);
        const balance = context.ok ? context.value.balance.sol : 0;
        this.recordIntentHistory(
          intentId,
          agent.id,
          intent,
          'executed',
          { balance },
          undefined,
          createdAt
        );
        return; // early return; no tx to inspect
      }

      case 'autonomous':
        // Autonomous intent — delegate to the sub-action with NO policy gate.
        await this.executeAutonomousIntent(agent, intent);
        break;

      default:
        logger.warn('Unknown intent type', { intent });
        return;
    }

    // Inspect the transaction that was created during execution and record result
    this.trackTransactionResult(agent, intent, intentId, txCountBefore, createdAt);
  }

  /**
   * Track and record transaction result for an executed intent
   */
  private trackTransactionResult(
    agent: BaseAgent,
    intent: Intent,
    intentId: string,
    txCountBefore: number,
    createdAt: Date
  ): void {
    const newTxs = this.transactions.slice(txCountBefore);
    const lastTx = newTxs.length > 0 ? newTxs[newTxs.length - 1] : undefined;

    if (lastTx) {
      const status = lastTx.status === 'confirmed' ? ('executed' as const) : ('rejected' as const);
      const result =
        lastTx.status === 'confirmed'
          ? { signature: lastTx.signature, amount: lastTx.amount, recipient: lastTx.recipient }
          : undefined;
      const error = lastTx.status === 'failed' ? lastTx.error : undefined;
      this.recordIntentHistory(intentId, agent.id, intent, status, result, error, createdAt);
    } else {
      this.recordIntentHistory(
        intentId,
        agent.id,
        intent,
        'rejected',
        undefined,
        'Execution failed — no transaction created',
        createdAt
      );
    }
  }

  /**
   * Execute a validated intent
   */
  private async executeIntent(
    agent: BaseAgent,
    intent: Intent,
    currentBalance: number
  ): Promise<void> {
    const walletId = agent.getWalletId();
    const intentId = uuidv4();
    const createdAt = new Date();

    logger.info('Executing intent', {
      agentId: agent.id,
      intentType: intent.type,
    });

    // Validate intent against policy
    const validationResult = this.walletManager.validateIntent(walletId, intent, currentBalance);

    if (!validationResult.ok) {
      logger.warn('Intent rejected by policy', {
        agentId: agent.id,
        reason: validationResult.error.message,
      });
      this.recordIntentHistory(
        intentId,
        agent.id,
        intent,
        'rejected',
        undefined,
        validationResult.error.message,
        createdAt
      );
      return;
    }

    // Execute the intent and track the result
    await this.executeAndTrackIntent(agent, intent, intentId, createdAt);
  }

  /**
   * Push an intent history record into the shared IntentRouter store
   * so it appears alongside BYOA intents on the dashboard.
   */
  private recordIntentHistory(
    intentId: string,
    agentId: string,
    intent: Intent,
    status: 'executed' | 'rejected',
    result?: Record<string, unknown>,
    error?: string,
    createdAt?: Date
  ): void {
    const mappedType = Orchestrator.INTENT_TYPE_MAP[intent.type] ?? 'QUERY_BALANCE';
    const params: Record<string, unknown> = { ...intent };
    getIntentRouter().recordIntent({
      intentId,
      agentId,
      type: mappedType as SupportedIntentType,
      params,
      status,
      result,
      error,
      createdAt: createdAt ?? new Date(),
    });
  }

  /**
   * Execute an airdrop
   */
  private async executeAirdrop(agent: BaseAgent, amount: number): Promise<void> {
    const walletId = agent.getWalletId();
    const publicKeyResult = this.walletManager.getPublicKey(walletId);

    if (!publicKeyResult.ok) {
      logger.error('Failed to get public key for airdrop', {
        walletId,
        error: publicKeyResult.error.message,
      });
      // Push a failed transaction so the intent recorder can find it
      this.transactions.push({
        id: uuidv4(),
        walletId,
        type: 'airdrop',
        status: 'failed',
        amount,
        error: publicKeyResult.error.message,
        createdAt: new Date(),
      });
      return;
    }

    const txRecord: TransactionRecord = {
      id: uuidv4(),
      walletId,
      type: 'airdrop',
      status: 'pending',
      amount,
      createdAt: new Date(),
    };

    this.transactions.push(txRecord);
    this.trimTransactions();

    const result = await this.solanaClient.requestAirdrop(publicKeyResult.value, amount);

    if (result.ok) {
      // Update transaction record
      const idx = this.transactions.findIndex((t) => t.id === txRecord.id);
      if (idx >= 0) {
        this.transactions[idx] = {
          ...txRecord,
          signature: result.value.signature,
          status: 'confirmed',
          confirmedAt: new Date(),
        };
      }

      eventBus.emit({
        id: uuidv4(),
        type: 'transaction',
        timestamp: new Date(),
        transaction: this.transactions[idx] ?? txRecord,
      });

      logger.info('Airdrop successful', {
        agentId: agent.id,
        amount,
        signature: result.value.signature,
      });
    } else {
      const idx = this.transactions.findIndex((t) => t.id === txRecord.id);
      if (idx >= 0) {
        this.transactions[idx] = {
          ...txRecord,
          status: 'failed',
          error: result.error.message,
        };

        eventBus.emit({
          id: uuidv4(),
          type: 'transaction',
          timestamp: new Date(),
          transaction: this.transactions[idx]!,
        });
      }

      logger.error('Airdrop failed', {
        agentId: agent.id,
        error: result.error.message,
      });
    }

    this.saveTransactions();
  }

  /**
   * Execute a SOL transfer
   */
  private async executeTransfer(
    agent: BaseAgent,
    recipient: string,
    amount: number
  ): Promise<void> {
    const walletId = agent.getWalletId();

    const publicKeyResult = this.walletManager.getPublicKey(walletId);
    if (!publicKeyResult.ok) {
      logger.error('Failed to get public key for transfer', { walletId });
      this.transactions.push({
        id: uuidv4(),
        walletId,
        type: 'transfer_sol',
        status: 'failed',
        amount,
        recipient,
        error: publicKeyResult.error.message,
        createdAt: new Date(),
      });
      return;
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      logger.error('Invalid recipient address', { recipient });
      this.transactions.push({
        id: uuidv4(),
        walletId,
        type: 'transfer_sol',
        status: 'failed',
        amount,
        recipient,
        error: 'Invalid recipient address',
        createdAt: new Date(),
      });
      return;
    }

    const txRecord: TransactionRecord = {
      id: uuidv4(),
      walletId,
      type: 'transfer_sol',
      status: 'pending',
      amount,
      recipient,
      createdAt: new Date(),
    };

    this.transactions.push(txRecord);
    this.trimTransactions();

    // Build transaction (includes Memo Program interaction)
    const txResult = await buildSolTransfer(
      publicKeyResult.value,
      recipientPubkey,
      amount,
      `AgenticWallet:transfer_sol:${agent.id}`
    );

    if (!txResult.ok) {
      this.updateTransactionFailed(txRecord.id, txResult.error.message);
      return;
    }

    // Sign transaction
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) {
      this.updateTransactionFailed(txRecord.id, signResult.error.message);
      return;
    }

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) {
      this.updateTransactionFailed(txRecord.id, `Simulation failed: ${simResult.error.message}`);
      return;
    }

    // Send transaction
    const sendResult = await this.solanaClient.sendTransaction(signResult.value);

    if (sendResult.ok) {
      this.walletManager.recordTransfer(walletId);

      const idx = this.transactions.findIndex((t) => t.id === txRecord.id);
      if (idx >= 0) {
        this.transactions[idx] = {
          ...txRecord,
          signature: sendResult.value.signature,
          status: 'confirmed',
          confirmedAt: new Date(),
        };

        eventBus.emit({
          id: uuidv4(),
          type: 'transaction',
          timestamp: new Date(),
          transaction: this.transactions[idx]!,
        });
      }

      logger.info('Transfer successful', {
        agentId: agent.id,
        recipient,
        amount,
        signature: sendResult.value.signature,
      });
    } else {
      this.updateTransactionFailed(txRecord.id, sendResult.error.message);
    }

    this.saveTransactions();
  }

  /**
   * Execute an SPL token transfer (interacts with the Token Program)
   */
  private async executeTokenTransfer(
    agent: BaseAgent,
    mint: string,
    recipient: string,
    amount: number
  ): Promise<void> {
    const walletId = agent.getWalletId();

    const publicKeyResult = this.walletManager.getPublicKey(walletId);
    if (!publicKeyResult.ok) {
      logger.error('Failed to get public key for token transfer', { walletId });
      this.transactions.push({
        id: uuidv4(),
        walletId,
        type: 'transfer_spl',
        status: 'failed',
        amount,
        recipient,
        mint,
        error: publicKeyResult.error.message,
        createdAt: new Date(),
      });
      return;
    }

    let recipientPubkey: PublicKey;
    let mintPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
      mintPubkey = new PublicKey(mint);
    } catch {
      logger.error('Invalid address for token transfer', { recipient, mint });
      this.transactions.push({
        id: uuidv4(),
        walletId,
        type: 'transfer_spl',
        status: 'failed',
        amount,
        recipient,
        mint,
        error: 'Invalid address',
        createdAt: new Date(),
      });
      return;
    }

    const txRecord: TransactionRecord = {
      id: uuidv4(),
      walletId,
      type: 'transfer_spl',
      status: 'pending',
      amount,
      recipient,
      mint,
      createdAt: new Date(),
    };

    this.transactions.push(txRecord);
    this.trimTransactions();

    // Build token transfer via SPL Token Program
    // Query actual mint decimals on-chain instead of hardcoding
    const decimals = await this.solanaClient.getMintDecimals(mintPubkey);
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));
    const txResult = await buildTokenTransfer(
      publicKeyResult.value,
      mintPubkey,
      recipientPubkey,
      rawAmount,
      decimals,
      `AgenticWallet:token_transfer:${agent.id}`
    );

    if (!txResult.ok) {
      this.updateTransactionFailed(txRecord.id, txResult.error.message);
      return;
    }

    // Sign
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) {
      this.updateTransactionFailed(txRecord.id, signResult.error.message);
      return;
    }

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) {
      this.updateTransactionFailed(txRecord.id, `Simulation failed: ${simResult.error.message}`);
      return;
    }

    // Send
    const sendResult = await this.solanaClient.sendTransaction(signResult.value);

    if (sendResult.ok) {
      this.walletManager.recordTransfer(walletId);

      const idx = this.transactions.findIndex((t) => t.id === txRecord.id);
      if (idx >= 0) {
        this.transactions[idx] = {
          ...txRecord,
          signature: sendResult.value.signature,
          status: 'confirmed',
          confirmedAt: new Date(),
        };

        eventBus.emit({
          id: uuidv4(),
          type: 'transaction',
          timestamp: new Date(),
          transaction: this.transactions[idx]!,
        });
      }

      logger.info('Token transfer successful', {
        agentId: agent.id,
        mint,
        recipient,
        amount,
        signature: sendResult.value.signature,
      });
    } else {
      this.updateTransactionFailed(txRecord.id, sendResult.error.message);
    }
  }

  /**
   * Execute an autonomous intent for a built-in agent.
   *
   * Reads `intent.action` and delegates to the appropriate sub-method.
   * No policy validation is applied — the agent has unrestricted control.
   * Everything is still fully logged in transactions + intent history.
   */
  private async executeAutonomousIntent(
    agent: BaseAgent,
    intent: import('../utils/types.js').AutonomousIntent
  ): Promise<void> {
    const { action, params } = intent;

    logger.info('Autonomous intent executing', {
      agentId: agent.id,
      action,
      params,
    });

    // Emit event for real-time observability
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_action',
      timestamp: new Date(),
      agentId: agent.id,
      action: `autonomous:${action}`,
      details: { params },
    });

    switch (action) {
      case 'airdrop': {
        const amount = typeof params['amount'] === 'number' ? params['amount'] : 1;
        await this.executeAirdrop(agent, amount);
        break;
      }
      case 'transfer_sol': {
        const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';
        const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
        if (!recipient || amount <= 0) {
          logger.error('Autonomous transfer_sol: missing recipient or amount', { params });
          return;
        }
        await this.executeTransfer(agent, recipient, amount);
        break;
      }
      case 'transfer_token': {
        const mint = typeof params['mint'] === 'string' ? params['mint'] : '';
        const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';
        const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
        if (!mint || !recipient || amount <= 0) {
          logger.error('Autonomous transfer_token: missing params', { params });
          return;
        }
        await this.executeTokenTransfer(agent, mint, recipient, amount);
        break;
      }
      case 'query_balance': {
        // Balance is already in agent context — nothing to execute on-chain
        break;
      }
      default:
        logger.warn('Autonomous intent: unknown action', { action, params });
    }
  }

  /**
   * Update a transaction as failed
   */
  private updateTransactionFailed(txId: string, error: string): void {
    const idx = this.transactions.findIndex((t) => t.id === txId);
    if (idx >= 0) {
      const tx = this.transactions[idx];
      if (tx) {
        this.transactions[idx] = {
          ...tx,
          status: 'failed',
          error,
        };

        // Emit so the frontend sees failed transactions in real-time
        eventBus.emit({
          id: uuidv4(),
          type: 'transaction',
          timestamp: new Date(),
          transaction: this.transactions[idx]!,
        });
      }
    }

    this.saveTransactions();
  }

  /**
   * Prevent unbounded growth of the transactions array
   */
  private trimTransactions(): void {
    if (this.transactions.length > this.maxTransactions) {
      this.transactions = this.transactions.slice(-this.maxTransactions);
      // Rebuild index after pruning
      this.rebuildTransactionIndex();
    }
    this.saveTransactions();
  }

  /**
   * Rebuild the transactionsByWalletId index from the transactions array
   */
  private rebuildTransactionIndex(): void {
    this.transactionsByWalletId.clear();
    for (const tx of this.transactions) {
      const walletTxs = this.transactionsByWalletId.get(tx.walletId) ?? [];
      walletTxs.push(tx);
      this.transactionsByWalletId.set(tx.walletId, walletTxs);
    }
  }

  private saveTransactions(): void {
    saveState('transactions', this.transactions);
  }

  private loadTransactions(): void {
    const saved = loadState<TransactionRecord[]>('transactions');
    if (!saved || saved.length === 0) return;
    for (const tx of saved) {
      const fullTx: TransactionRecord = {
        ...tx,
        createdAt: new Date(tx.createdAt),
        confirmedAt: tx.confirmedAt ? new Date(tx.confirmedAt) : undefined,
      };
      this.transactions.push(fullTx);
    }
    // Rebuild index after loading
    this.rebuildTransactionIndex();
    logger.info('Transaction history restored from disk', { count: this.transactions.length });
  }

  /**
   * Update an agent's configuration at runtime.
   * Changes take effect at the next cycle. Does not interrupt in-flight execution.
   */
  updateAgentConfig(
    agentId: string,
    patch: {
      strategyParams?: Record<string, unknown>;
      executionSettings?: Partial<import('../utils/types.js').ExecutionSettings>;
    }
  ): Result<AgentInfo, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }

    const { agent } = managed;

    // Validate strategy params if provided
    if (patch.strategyParams) {
      const registry = getStrategyRegistry();
      const validation = registry.validateParams(agent.strategy, {
        ...agent.getInfo().strategyParams,
        ...patch.strategyParams,
      });
      if (!validation.ok) {
        return failure(new Error(`Invalid strategy params: ${validation.error}`));
      }
      agent.updateStrategyParams(validation.value);
    }

    // Apply execution settings
    if (patch.executionSettings) {
      const prev = agent.getExecutionSettings();
      agent.updateExecutionSettings(patch.executionSettings);

      // If cycle interval changed while running, restart the interval
      const newSettings = agent.getExecutionSettings();
      if (managed.intervalId && prev.cycleIntervalMs !== newSettings.cycleIntervalMs) {
        clearInterval(managed.intervalId);
        managed.intervalId = setInterval(async () => {
          await this.runAgentCycle(agentId);
        }, newSettings.cycleIntervalMs);
        logger.info('Agent cycle interval updated', {
          agentId,
          newInterval: newSettings.cycleIntervalMs,
        });
      }
    }

    logger.info('Agent config updated', { agentId });
    this.saveToStore();
    return success(agent.getInfo());
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((m) => m.agent.getInfo());
  }

  /**
   * MULTI-TENANT FIX: Get agents filtered by tenant ID
   * Returns only agents that belong to the specified tenant
   */
  getAgentsByTenant(tenantId: string): AgentInfo[] {
    return Array.from(this.agents.values())
      .map((m) => m.agent.getInfo())
      .filter((agent) => agent.tenantId === tenantId);
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Result<AgentInfo, Error> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      return failure(new Error(`Agent not found: ${agentId}`));
    }
    return success(managed.agent.getInfo());
  }

  /**
   * Get agent transactions
   */
  getAgentTransactions(agentId: string): TransactionRecord[] {
    const managed = this.agents.get(agentId);
    if (!managed) return [];

    const walletId = managed.agent.getWalletId();
    return this.transactions.filter((tx) => tx.walletId === walletId);
  }

  /**
   * MULTI-TENANT: Get all transactions for a specific tenant
   * Filters transactions by wallets that belong to the tenant
   */
  getTransactionsByTenant(tenantId: string): TransactionRecord[] {
    const walletIds = this.walletManager.getWalletIdsByTenant(tenantId);
    const walletIdSet = new Set(walletIds);
    return this.transactions.filter((tx) => walletIdSet.has(tx.walletId));
  }

  /**
   * Get all transactions
   */
  getAllTransactions(): TransactionRecord[] {
    return [...this.transactions];
  }

  /**
   * Get system stats
   */
  async getStats(): Promise<SystemStats> {
    const agents = this.getAllAgents();
    const activeAgents = agents.filter((a) => a.status !== 'stopped').length;

    // Calculate total SOL under management (parallelized)
    const balancePromises = Array.from(this.agents.values()).map(async (managed) => {
      const publicKeyResult = this.walletManager.getPublicKey(managed.agent.getWalletId());
      if (!publicKeyResult.ok) return 0;
      const balanceResult = await this.solanaClient.getBalance(publicKeyResult.value);
      return balanceResult.ok ? balanceResult.value.sol : 0;
    });
    const balances = await Promise.all(balancePromises);
    const totalSol = balances.reduce((sum, b) => sum + b, 0);

    // Check network health
    const healthResult = await this.solanaClient.checkHealth();
    const networkStatus = healthResult.ok ? 'healthy' : 'degraded';

    const config = getConfig();

    return {
      totalAgents: agents.length,
      activeAgents,
      totalSolManaged: totalSol,
      totalTransactions: this.transactions.length,
      networkStatus,
      network: config.SOLANA_NETWORK,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Shutdown orchestrator
   */
  shutdown(): void {
    logger.info('Shutting down orchestrator');

    for (const [_agentId, managed] of this.agents) {
      if (managed.intervalId) {
        clearInterval(managed.intervalId);
      }
      managed.agent.stop();
    }

    this.agents.clear();
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private saveToStore(): void {
    const saved: SavedAgent[] = Array.from(this.agents.values()).map((m) => {
      const info = m.agent.getInfo();
      return {
        id: info.id,
        name: info.name,
        strategy: info.strategy,
        strategyParams: info.strategyParams ?? {},
        executionSettings: info.executionSettings ?? {
          cycleIntervalMs: this.loopInterval,
          maxActionsPerDay: 100,
          enabled: true,
        },
        walletId: m.agent.getWalletId(),
        walletPublicKey: info.walletPublicKey,
        createdAt: info.createdAt.toISOString(),
        lastActionAt: info.lastActionAt?.toISOString(),
        wasRunning: !!m.intervalId,
      };
    });
    saveState('agents', saved);
  }

  /**
   * Reload agents from disk after server restart.
   * Agents are restored in stopped state; those that were running are
   * auto-started so the system picks up where it left off.
   *
   * Called once from index.ts after startServer().
   * This method is wrapped in try-catch to ensure server stays running
   * even if persistence layer has issues.
   */
  restoreFromStore(): void {
    try {
      // Restore transaction history first so agents have context
      try {
        this.loadTransactions();
      } catch (error) {
        logger.error('Failed to load transaction history', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue anyway — transactions are not critical for server operation
      }

      const saved = loadState<SavedAgent[]>('agents');
      if (!saved || saved.length === 0) return;

      let restored = 0;
      const toStart: string[] = [];

      for (const s of saved) {
        try {
          // Skip if wallet no longer exists
          const pubKeyResult = this.walletManager.getPublicKey(s.walletId);
          if (!pubKeyResult.ok) {
            logger.warn('Skipping agent restore — wallet missing', {
              agentId: s.id,
              walletId: s.walletId,
            });
            continue;
          }

          if (this.agents.size >= this.maxAgents) {
            logger.warn('Agent limit reached during restore, some agents skipped');
            break;
          }

          const agentResult = createAgent({
            config: {
              name: s.name,
              strategy: s.strategy,
              strategyParams: s.strategyParams,
              executionSettings: s.executionSettings,
            },
            walletId: s.walletId,
            walletPublicKey: s.walletPublicKey,
            idOverride: s.id,
            createdAtOverride: new Date(s.createdAt),
          });

          if (!agentResult.ok) {
            logger.warn('Failed to restore agent', {
              agentId: s.id,
              error: agentResult.error.message,
            });
            continue;
          }

          const agent = agentResult.value;
          if (s.lastActionAt) {
            Object.assign(agent, { lastActionAt: new Date(s.lastActionAt) });
          }

          this.agents.set(agent.id, { agent });
          restored++;

          if (s.wasRunning) {
            toStart.push(agent.id);
          }
        } catch (error) {
          logger.error('Error during agent restoration', {
            agentId: s.id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue to next agent
        }
      }

      if (restored > 0) {
        logger.info('Agents restored from disk', { count: restored, autoStarting: toStart.length });
      }

      // Auto-start agents that were running before shutdown
      for (const agentId of toStart) {
        try {
          const result = this.startAgent(agentId);
          if (!result.ok) {
            logger.warn('Failed to auto-start restored agent', {
              agentId,
              error: result.error.message,
            });
          }
        } catch (error) {
          logger.error('Error auto-starting agent', {
            agentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      // Final catch-all to ensure this never crashes the process
      logger.error('Critical error during restoreFromStore', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Server stays running without restored agents — acceptable degradation
    }
  }
}

// Singleton instance
let orchestratorInstance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new Orchestrator();
  }
  return orchestratorInstance;
}
