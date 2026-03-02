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
  SystemStats,
  TransactionRecord,
  TransactionType,
  Intent,
  Result,
  success,
  failure,
} from '../utils/types.js';
import { getConfig } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import { getWalletManager, WalletManager } from '../wallet/index.js';
import { getSolanaClient, buildSolTransfer, buildTokenTransfer, SolanaClient } from '../rpc/index.js';
import { BaseAgent, AgentContext, createAgent } from '../agent/index.js';
import { AccumulatorAgent } from '../agent/accumulator-agent.js';
import { DistributorAgent } from '../agent/distributor-agent.js';
import { BalanceGuardAgent } from '../agent/balance-guard-agent.js';
import { ScheduledPayerAgent } from '../agent/scheduled-payer-agent.js';
import { getStrategyRegistry } from '../agent/strategy-registry.js';
import { getIntentRouter } from '../integration/intentRouter.js';
import type { SupportedIntentType } from '../integration/agentRegistry.js';
import { eventBus } from './event-emitter.js';

const logger = createLogger('ORCHESTRATOR');

interface ManagedAgent {
  agent: BaseAgent;
  intervalId?: NodeJS.Timeout;
  cycleInProgress?: boolean; // Guard against overlapping async cycles
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
        if (typeof (agent as any).resetDailyCounters === 'function') {
          (agent as any).resetDailyCounters();
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

    // Create wallet for agent
    const walletResult = this.walletManager.createWallet(config.name);
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
      this.walletManager.deleteWallet(wallet.id);
      return failure(agentResult.error);
    }

    const agent = agentResult.value;

    // Store managed agent
    this.agents.set(agent.id, { agent });

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

    return success(true);
  }

  /**
   * Run a single agent cycle
   */
  private async runAgentCycle(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) return;

    // Prevent overlapping cycles if previous cycle is still running
    if (managed.cycleInProgress) {
      logger.debug('Skipping cycle, previous still running', { agentId });
      return;
    }

    const { agent } = managed;

    if (agent.getStatus() === 'stopped') {
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
        return;
      }

      // Let agent think
      const decision = await agent.think(context.value);

      // Emit action event
      eventBus.emit({
        id: uuidv4(),
        type: 'agent_action',
        timestamp: new Date(),
        agentId: agent.id,
        action: decision.shouldAct ? 'decided_to_act' : 'decided_to_wait',
        details: { reasoning: decision.reasoning },
      });

      if (decision.shouldAct && decision.intent) {
        agent.setStatus('executing');
        await this.executeIntent(agent, decision.intent, context.value.balance.sol);
      }

      agent.recordAction(decision.shouldAct);
      agent.setStatus('idle');
    } catch (error) {
      logger.error('Agent cycle failed', {
        agentId,
        error: String(error),
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

    // Get recent transactions for this agent
    const recentTxs = this.transactions
      .filter((tx) => tx.walletId === walletId)
      .slice(-10)
      .map((tx) => tx.signature ?? tx.id);

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
    const validationResult = this.walletManager.validateIntent(
      walletId,
      intent,
      currentBalance
    );

    if (!validationResult.ok) {
      logger.warn('Intent rejected by policy', {
        agentId: agent.id,
        reason: validationResult.error.message,
      });
      this.recordIntentHistory(intentId, agent.id, intent, 'rejected', undefined, validationResult.error.message, createdAt);
      return;
    }

    // Snapshot transaction count so we can find the resulting tx after execution
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
        await this.executeTokenTransfer(
          agent,
          intent.mint,
          intent.recipient,
          intent.amount,
        );
        break;

      case 'check_balance':
        // Balance is already in context — record as executed
        this.recordIntentHistory(intentId, agent.id, intent, 'executed', { balance: currentBalance }, undefined, createdAt);
        return; // early return; no tx to inspect

      case 'autonomous':
        // Autonomous intent — delegate to the sub-action with NO policy gate.
        // The wallet-manager already skips policy for type === 'autonomous'.
        await this.executeAutonomousIntent(agent, intent, currentBalance);
        break;

      default:
        logger.warn('Unknown intent type', { intent });
        return;
    }

    // Inspect the transaction that was created during execution
    const newTxs = this.transactions.slice(txCountBefore);
    const lastTx = newTxs.length > 0 ? newTxs[newTxs.length - 1] : undefined;

    if (lastTx) {
      const status = lastTx.status === 'confirmed' ? 'executed' as const : 'rejected' as const;
      const result = lastTx.status === 'confirmed'
        ? { signature: lastTx.signature, amount: lastTx.amount, recipient: lastTx.recipient }
        : undefined;
      const error = lastTx.status === 'failed' ? lastTx.error : undefined;
      this.recordIntentHistory(intentId, agent.id, intent, status, result, error, createdAt);
    } else {
      // Execution method returned early without creating a transaction
      // (e.g. getPublicKey failure). Still record the intent so it isn't silently dropped.
      this.recordIntentHistory(intentId, agent.id, intent, 'rejected', undefined, 'Execution failed — no transaction created', createdAt);
    }
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
    createdAt?: Date,
  ): void {
    const mappedType = Orchestrator.INTENT_TYPE_MAP[intent.type] ?? 'QUERY_BALANCE';
    getIntentRouter().recordIntent({
      intentId,
      agentId,
      type: mappedType as SupportedIntentType,
      params: { ...intent } as unknown as Record<string, unknown>,
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
      this.transactions.push({ id: uuidv4(), walletId, type: 'transfer_sol', status: 'failed', amount, recipient, error: publicKeyResult.error.message, createdAt: new Date() });
      return;
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      logger.error('Invalid recipient address', { recipient });
      this.transactions.push({ id: uuidv4(), walletId, type: 'transfer_sol', status: 'failed', amount, recipient, error: 'Invalid recipient address', createdAt: new Date() });
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
      `AgenticWallet:transfer_sol:${agent.id}`,
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
  }

  /**
   * Execute an SPL token transfer (interacts with the Token Program)
   */
  private async executeTokenTransfer(
    agent: BaseAgent,
    mint: string,
    recipient: string,
    amount: number,
  ): Promise<void> {
    const walletId = agent.getWalletId();

    const publicKeyResult = this.walletManager.getPublicKey(walletId);
    if (!publicKeyResult.ok) {
      logger.error('Failed to get public key for token transfer', { walletId });
      this.transactions.push({ id: uuidv4(), walletId, type: 'transfer_spl', status: 'failed', amount, recipient, mint, error: publicKeyResult.error.message, createdAt: new Date() });
      return;
    }

    let recipientPubkey: PublicKey;
    let mintPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
      mintPubkey = new PublicKey(mint);
    } catch {
      logger.error('Invalid address for token transfer', { recipient, mint });
      this.transactions.push({ id: uuidv4(), walletId, type: 'transfer_spl', status: 'failed', amount, recipient, mint, error: 'Invalid address', createdAt: new Date() });
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
      `AgenticWallet:token_transfer:${agent.id}`,
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
    intent: import('../utils/types.js').AutonomousIntent,
    currentBalance: number,
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
  }

  /**
   * Prevent unbounded growth of the transactions array
   */
  private trimTransactions(): void {
    if (this.transactions.length > this.maxTransactions) {
      this.transactions = this.transactions.slice(-this.maxTransactions);
    }
  }

  /**
   * Update an agent's configuration at runtime.
   * Changes take effect at the next cycle. Does not interrupt in-flight execution.
   */
  updateAgentConfig(
    agentId: string,
    patch: { strategyParams?: Record<string, unknown>; executionSettings?: Partial<import('../utils/types.js').ExecutionSettings> },
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
        logger.info('Agent cycle interval updated', { agentId, newInterval: newSettings.cycleIntervalMs });
      }
    }

    logger.info('Agent config updated', { agentId });
    return success(agent.getInfo());
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((m) => m.agent.getInfo());
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
      const publicKeyResult = this.walletManager.getPublicKey(
        managed.agent.getWalletId()
      );
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

    for (const [agentId, managed] of this.agents) {
      if (managed.intervalId) {
        clearInterval(managed.intervalId);
      }
      managed.agent.stop();
    }

    this.agents.clear();
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
