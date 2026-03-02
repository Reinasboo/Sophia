/**
 * Intent Router
 *
 * Accepts high-level intents from external (BYOA) agents, validates them,
 * converts them into the canonical internal `Intent` format, and executes
 * them through the existing wallet + RPC layers.
 *
 * External agents NEVER submit raw transactions — they submit intents such
 * as REQUEST_AIRDROP, TRANSFER_SOL, QUERY_BALANCE.
 *
 * DESIGN:
 * - BYOA agents are AI / LLM agents. They have full autonomy over the
 *   wallets assigned to them — no policy restrictions, no program
 *   allowlists. The wallet is theirs to use as they see fit.
 * - Authentication is via control token (bearer)
 * - Rate limiting protects infrastructure (not wallet funds)
 * - All actions are fully logged for auditability
 */

import { v4 as uuidv4 } from 'uuid';
import { PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger.js';
import { Result, success, failure, Intent, BalanceInfo } from '../utils/types.js';
import { getWalletManager, WalletManager } from '../wallet/index.js';
import { getSolanaClient, buildSolTransfer, buildTokenTransfer, buildArbitraryTransaction, deserializeTransaction, KNOWN_PROGRAMS, SolanaClient } from '../rpc/index.js';
import type { InstructionDescriptor } from '../rpc/index.js';
import { getAgentRegistry, AgentRegistry, ExternalAgentRecord, SupportedIntentType } from './agentRegistry.js';
import { eventBus } from '../orchestrator/event-emitter.js';

const logger = createLogger('BYOA_INTENT');

// ────────────────────────────────────────────
// Program reference for autonomous execute_instructions
// All programs are allowed — this list is for logging only.
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// External intent payload (what the caller sends)
// ────────────────────────────────────────────

export interface ExternalIntent {
  readonly type: SupportedIntentType;
  readonly params: Record<string, unknown>;
}

export interface IntentResult {
  readonly intentId: string;
  readonly status: 'executed' | 'rejected';
  readonly type: SupportedIntentType;
  readonly agentId: string;
  readonly walletPublicKey: string;
  readonly result?: Record<string, unknown>;
  readonly error?: string;
  readonly executedAt: Date;
}

// ────────────────────────────────────────────
// Intent history record
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
// Rate limiter (simple sliding-window)
// ────────────────────────────────────────────

class RateLimiter {
  /** agentId → timestamps */
  private windows: Map<string, number[]> = new Map();
  private maxPerMinute: number;
  private lastCleanup: number = Date.now();
  private cleanupIntervalMs: number = 300_000; // 5 minutes

  constructor(maxPerMinute: number = 30) {
    this.maxPerMinute = maxPerMinute;
  }

  check(agentId: string): boolean {
    const now = Date.now();
    const windowMs = 60_000;

    // M-5: Periodically purge stale entries from agents that are no longer active
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      this.cleanup(now, windowMs);
      this.lastCleanup = now;
    }

    let timestamps = this.windows.get(agentId) ?? [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= this.maxPerMinute) {
      this.windows.set(agentId, timestamps);
      return false;
    }
    timestamps.push(now);
    this.windows.set(agentId, timestamps);
    return true;
  }

  /** Remove entries with no recent activity */
  private cleanup(now: number, windowMs: number): void {
    for (const [agentId, timestamps] of this.windows) {
      const active = timestamps.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        this.windows.delete(agentId);
      } else {
        this.windows.set(agentId, active);
      }
    }
  }
}

// ────────────────────────────────────────────
// Intent Router
// ────────────────────────────────────────────

export class IntentRouter {
  private registry: AgentRegistry;
  private walletManager: WalletManager;
  private solanaClient: SolanaClient;
  private rateLimiter: RateLimiter;
  private history: IntentHistoryRecord[] = [];
  private maxHistory: number = 5000;

  constructor() {
    this.registry = getAgentRegistry();
    this.walletManager = getWalletManager();
    this.solanaClient = getSolanaClient();
    this.rateLimiter = new RateLimiter(30);
  }

  /**
   * Submit an intent using a bearer control token.
   * This is the primary entry-point for external agents.
   */
  async submitIntent(
    controlToken: string,
    externalIntent: ExternalIntent,
  ): Promise<Result<IntentResult, Error>> {
    const intentId = uuidv4();
    const createdAt = new Date();

    // ── 1. Authenticate ────────────────────
    const authResult = this.registry.authenticateToken(controlToken);
    if (!authResult.ok) {
      logger.warn('Intent rejected: authentication failed');
      return failure(new Error('Authentication failed: ' + authResult.error.message));
    }

    const agent = authResult.value;

    // ── 2. Check agent is active ───────────
    if (agent.status !== 'active') {
      return this.reject(intentId, agent.id, externalIntent, `Agent is not active (status: ${agent.status})`, createdAt);
    }

    // ── 3. Check wallet binding ────────────
    if (!agent.walletId) {
      return this.reject(intentId, agent.id, externalIntent, 'Agent has no bound wallet', createdAt);
    }

    // ── 4. Rate limit ──────────────────────
    if (!this.rateLimiter.check(agent.id)) {
      return this.reject(intentId, agent.id, externalIntent, 'Rate limit exceeded (max 30 intents/min)', createdAt);
    }

    // ── 5. Validate intent is supported ────
    if (!agent.supportedIntents.includes(externalIntent.type)) {
      return this.reject(intentId, agent.id, externalIntent, `Intent type "${externalIntent.type}" is not in this agent's supported set`, createdAt);
    }

    // ── 6. Execute ─────────────────────────
    try {
      const result = await this.executeIntent(agent, externalIntent, intentId);

      const record: IntentHistoryRecord = {
        intentId,
        agentId: agent.id,
        type: externalIntent.type,
        params: externalIntent.params,
        status: 'executed',
        result: result,
        createdAt,
      };
      this.pushHistory(record);

      // Emit event for frontend / websocket
      eventBus.emit({
        id: uuidv4(),
        type: 'agent_action',
        timestamp: new Date(),
        agentId: agent.id,
        action: `byoa_intent:${externalIntent.type}`,
        details: { intentId, params: externalIntent.params, result },
      });

      const intentResult: IntentResult = {
        intentId,
        status: 'executed',
        type: externalIntent.type,
        agentId: agent.id,
        walletPublicKey: agent.walletPublicKey ?? '',
        result,
        executedAt: new Date(),
      };

      logger.info('BYOA intent executed', { intentId, agentId: agent.id, type: externalIntent.type });
      return success(intentResult);

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return this.reject(intentId, agent.id, externalIntent, errMsg, createdAt);
    }
  }

  // ── Intent Execution Dispatch ────────────

  private async executeIntent(
    agent: ExternalAgentRecord,
    ext: ExternalIntent,
    intentId: string,
  ): Promise<Record<string, unknown>> {
    const walletId = agent.walletId!;

    switch (ext.type) {
      case 'REQUEST_AIRDROP':
        return this.executeAirdrop(walletId, ext.params, intentId);
      case 'TRANSFER_SOL':
        return this.executeTransferSol(walletId, agent.id, ext.params, intentId);
      case 'TRANSFER_TOKEN':
        return this.executeTransferToken(walletId, agent.id, ext.params, intentId);
      case 'QUERY_BALANCE':
        return this.executeQueryBalance(walletId);
      case 'AUTONOMOUS':
        return this.executeAutonomous(walletId, agent.id, ext.params, intentId);
      default:
        throw new Error(`Unsupported intent type: ${ext.type}`);
    }
  }

  // ── REQUEST_AIRDROP ──────────────────────

  private async executeAirdrop(
    walletId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 1;
    if (amount <= 0 || amount > 2) {
      throw new Error('Airdrop amount must be between 0 and 2 SOL');
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    const airdropResult = await this.solanaClient.requestAirdrop(pubkeyResult.value, amount);
    if (!airdropResult.ok) throw airdropResult.error;

    // Emit transaction event
    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(),
        walletId,
        type: 'airdrop',
        status: 'confirmed',
        amount,
        signature: airdropResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    return { signature: airdropResult.value.signature, amount };
  }

  // ── TRANSFER_SOL ─────────────────────────

  private async executeTransferSol(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';

    if (amount <= 0) throw new Error('Transfer amount must be positive');
    if (!recipient) throw new Error('Recipient address is required');

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // Build transaction — no policy restrictions, the agent has full autonomy
    const txResult = await buildSolTransfer(pubkeyResult.value, recipientPubkey, amount);
    if (!txResult.ok) throw txResult.error;

    // Sign via wallet layer (only place keys are touched)
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    // Send
    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    // Emit transaction event
    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(),
        walletId,
        type: 'transfer_sol',
        status: 'confirmed',
        amount,
        recipient,
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    return { signature: sendResult.value.signature, amount, recipient };
  }

  // ── QUERY_BALANCE ────────────────────────

  private async executeQueryBalance(walletId: string): Promise<Record<string, unknown>> {
    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    const balanceResult = await this.solanaClient.getBalance(pubkeyResult.value);
    if (!balanceResult.ok) throw balanceResult.error;

    const tokenResult = await this.solanaClient.getTokenBalances(pubkeyResult.value);
    const tokens = tokenResult.ok ? tokenResult.value : [];

    return {
      sol: balanceResult.value.sol,
      lamports: balanceResult.value.lamports.toString(),
      tokenBalances: tokens,
    };
  }

  // ── TRANSFER_TOKEN ───────────────────────

  private async executeTransferToken(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';
    const mint = typeof params['mint'] === 'string' ? params['mint'] : '';

    if (amount <= 0) throw new Error('Token transfer amount must be positive');
    if (!recipient) throw new Error('Recipient address is required');
    if (!mint) throw new Error('Token mint address is required');

    // Validate addresses
    let recipientPubkey: PublicKey;
    let mintPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
      mintPubkey = new PublicKey(mint);
    } catch {
      throw new Error(`Invalid address: recipient=${recipient}, mint=${mint}`);
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // No policy restrictions — the agent has full autonomy over its wallet

    // H-3/H-4: Accept decimals from params (default 9 for SOL-like tokens).
    // Callers SHOULD specify decimals for non-9-decimal tokens (e.g. USDC=6).
    const decimals = typeof params['decimals'] === 'number'
      ? Math.min(Math.max(Math.floor(params['decimals']), 0), 18)
      : 9;
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));
    const txResult = await buildTokenTransfer(
      pubkeyResult.value,
      mintPubkey,
      recipientPubkey,
      rawAmount,
      decimals,
      `AgenticWallet:byoa_token_transfer:${agentId}`,
    );
    if (!txResult.ok) throw txResult.error;

    // Sign
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    // Send
    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    // Emit transaction event
    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(),
        walletId,
        type: 'transfer_spl',
        status: 'confirmed',
        amount,
        recipient,
        mint,
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    return { signature: sendResult.value.signature, amount, recipient, mint };
  }

  // ── AUTONOMOUS ───────────────────────────

  /**
   * Execute an autonomous intent.
   *
   * The agent specifies a sub-action inside `params.action` and the matching
   * parameters.  No wallet-policy restrictions are applied — the agent has
   * unrestricted access.  Every action is still fully logged in intent
   * history and emitted as a system event so the operator can audit.
   *
   * Supported actions:
   *   airdrop            – request devnet SOL
   *   transfer_sol       – send SOL (no policy check)
   *   transfer_token     – send SPL tokens (no policy check)
   *   query_balance      – read wallet balance
   *   execute_instructions – submit arbitrary Solana instructions (any program)
   *   raw_transaction    – submit a base64 serialized transaction (unsigned)
   *   swap               – token swap via Jupiter / PumpSwap / Raydium / Orca
   *   create_token       – launch token via Pump.fun / Bonk.fun / Metaplex
   *   <any other>        – treated as execute_instructions if `instructions` param present
   */
  private async executeAutonomous(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    intentId: string,
  ): Promise<Record<string, unknown>> {
    const action = typeof params['action'] === 'string' ? params['action'] : '';

    logger.info('Autonomous intent executing', {
      agentId,
      intentId,
      action,
      params: Object.keys(params),
    });

    // Emit a dedicated event so operators can follow autonomous actions in
    // real-time via WebSocket / activity feed.
    eventBus.emit({
      id: uuidv4(),
      type: 'agent_action',
      timestamp: new Date(),
      agentId,
      action: `autonomous:${action}`,
      details: { intentId, params },
    });

    switch (action) {
      case 'airdrop':
        return this.executeAirdrop(walletId, params, intentId);

      case 'transfer_sol':
        return this.executeAutonomousTransferSol(walletId, agentId, params, intentId);

      case 'transfer_token':
        return this.executeAutonomousTransferToken(walletId, agentId, params, intentId);

      case 'query_balance':
        return this.executeQueryBalance(walletId);

      case 'execute_instructions':
        return this.executeArbitraryInstructions(walletId, agentId, params, intentId);

      case 'raw_transaction':
        return this.executeRawTransaction(walletId, agentId, params, intentId);

      case 'swap':
        return this.executeSwap(walletId, agentId, params, intentId);

      case 'create_token':
        return this.executeCreateToken(walletId, agentId, params, intentId);

      default:
        // If the agent sent an unknown action but included `instructions`,
        // treat it as arbitrary instruction execution for forward-compatibility.
        if (Array.isArray(params['instructions'])) {
          logger.info(`Unknown action "${action}" but instructions present — executing as arbitrary instructions`);
          return this.executeArbitraryInstructions(walletId, agentId, params, intentId);
        }
        throw new Error(
          `Autonomous intent: unknown action "${action}". ` +
          'Supported: airdrop, transfer_sol, transfer_token, query_balance, ' +
          'execute_instructions, raw_transaction, swap, create_token',
        );
    }
  }

  /**
   * Autonomous SOL transfer — identical to executeTransferSol but skips
   * the wallet-policy validation step so nothing is blocked.
   */
  private async executeAutonomousTransferSol(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';

    if (amount <= 0) throw new Error('Transfer amount must be positive');
    if (!recipient) throw new Error('Recipient address is required');

    let recipientPubkey: PublicKey;
    try { recipientPubkey = new PublicKey(recipient); } catch { throw new Error(`Invalid recipient: ${recipient}`); }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // Build, sign, send — NO policy check
    const txResult = await buildSolTransfer(
      pubkeyResult.value, recipientPubkey, amount,
      `AgenticWallet:autonomous:${agentId}`,
    );
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'transfer_sol', status: 'confirmed',
        amount, recipient, signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    return { signature: sendResult.value.signature, amount, recipient, autonomous: true };
  }

  /**
   * Autonomous token transfer — skips wallet-policy validation.
   */
  private async executeAutonomousTransferToken(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';
    const mint = typeof params['mint'] === 'string' ? params['mint'] : '';

    if (amount <= 0) throw new Error('Token transfer amount must be positive');
    if (!recipient) throw new Error('Recipient address is required');
    if (!mint) throw new Error('Token mint address is required');

    let recipientPubkey: PublicKey;
    let mintPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
      mintPubkey = new PublicKey(mint);
    } catch { throw new Error(`Invalid address: recipient=${recipient}, mint=${mint}`); }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // H-3/H-4: Accept decimals from params (default 9 for SOL-like tokens).
    const decimals = typeof params['decimals'] === 'number'
      ? Math.min(Math.max(Math.floor(params['decimals']), 0), 18)
      : 9;
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));
    const txResult = await buildTokenTransfer(
      pubkeyResult.value, mintPubkey, recipientPubkey, rawAmount, decimals,
      `AgenticWallet:autonomous_token:${agentId}`,
    );
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'transfer_spl', status: 'confirmed',
        amount, recipient, mint, signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    return { signature: sendResult.value.signature, amount, recipient, mint, autonomous: true };
  }

  // ── EXECUTE_INSTRUCTIONS (any Solana program) ─

  /**
   * Submit an array of arbitrary Solana instructions.
   * This enables interaction with ANY deployed program: Pump.fun, Jupiter,
   * PumpSwap, Raydium, Orca Whirlpool, Bonk.fun, Metaplex, custom programs, etc.
   *
   * params.instructions: InstructionDescriptor[]
   *   Each: { programId, keys: [{pubkey, isSigner, isWritable}], data (base64) }
   * params.memo?: string  — optional on-chain memo
   */
  private async executeArbitraryInstructions(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const instructions = params['instructions'] as InstructionDescriptor[] | undefined;
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error('execute_instructions requires a non-empty "instructions" array');
    }

    // Validate each instruction descriptor
    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i]!;
      if (!ix.programId || !Array.isArray(ix.keys) || typeof ix.data !== 'string') {
        throw new Error(`Instruction[${i}] missing required fields: programId, keys[], data (base64)`);
      }
    }

    // No program allowlist — BYOA agents have full autonomy to interact
    // with any Solana program. All executions are logged for auditability.

    const memo = typeof params['memo'] === 'string'
      ? params['memo']
      : `AgenticWallet:autonomous_exec:${agentId}`;

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // Build the transaction from arbitrary instructions
    const txResult = await buildArbitraryTransaction(pubkeyResult.value, instructions, memo);
    if (!txResult.ok) throw txResult.error;

    // Sign via wallet layer
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    // Submit
    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    const programs = instructions.map((ix) => KNOWN_PROGRAMS[ix.programId] ?? ix.programId.slice(0, 8) + '...');

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'raw_execute', status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    logger.info('Arbitrary instructions executed', {
      agentId, signature: sendResult.value.signature,
      numInstructions: instructions.length, programs,
    });

    return {
      signature: sendResult.value.signature,
      numInstructions: instructions.length,
      programs,
      autonomous: true,
    };
  }

  // ── RAW_TRANSACTION (base64 wire format) ──

  /**
   * Submit a base64-encoded serialized transaction.
   * The platform refreshes the blockhash, sets the agent's wallet as fee payer,
   * signs it, and submits.
   *
   * params.transaction: string (base64)
   */
  private async executeRawTransaction(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const rawTx = typeof params['transaction'] === 'string' ? params['transaction'] : '';
    if (!rawTx) {
      throw new Error('raw_transaction requires a "transaction" param (base64 serialized)');
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    const txResult = await deserializeTransaction(rawTx, pubkeyResult.value);
    if (!txResult.ok) throw txResult.error;

    // H-1: Inspect the deserialized transaction — log all programs being invoked
    // so operators can audit what external agents submit via raw_transaction.
    const txInstructions = txResult.value.instructions ?? [];
    const invokedPrograms = txInstructions.map((ix: { programId: { toBase58(): string } }) => {
      const pid = ix.programId.toBase58();
      return KNOWN_PROGRAMS[pid] ?? pid;
    });
    logger.info('Raw transaction inspection', {
      agentId,
      numInstructions: txInstructions.length,
      programs: invokedPrograms,
    });

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'raw_execute', status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    logger.info('Raw transaction executed', { agentId, signature: sendResult.value.signature });

    return { signature: sendResult.value.signature, autonomous: true, raw: true };
  }

  // ── SWAP (Jupiter / PumpSwap / Raydium / Orca) ─

  /**
   * Execute a token swap.
   * The agent sends the swap instructions pre-built from Jupiter API, PumpSwap,
   * Raydium, or any other DEX.  The platform signs and submits.
   *
   * params.instructions: InstructionDescriptor[]  (swap route instructions)
   * params.inputMint?:  string   (for logging)
   * params.outputMint?: string   (for logging)
   * params.amount?:     number   (for logging)
   * params.dex?:        string   (e.g. 'jupiter', 'pumpswap', 'raydium', 'orca')
   */
  private async executeSwap(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const instructions = params['instructions'] as InstructionDescriptor[] | undefined;
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error('swap requires "instructions" array (from DEX route API)');
    }

    const dex = typeof params['dex'] === 'string' ? params['dex'] : 'unknown';
    const inputMint = typeof params['inputMint'] === 'string' ? params['inputMint'] : '';
    const outputMint = typeof params['outputMint'] === 'string' ? params['outputMint'] : '';
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;

    const memo = `AgenticWallet:swap:${dex}:${agentId}`;

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    const txResult = await buildArbitraryTransaction(pubkeyResult.value, instructions, memo);
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'swap', status: 'confirmed',
        amount, signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    logger.info('Swap executed', { agentId, dex, inputMint, outputMint, amount, signature: sendResult.value.signature });

    return {
      signature: sendResult.value.signature,
      dex, inputMint, outputMint, amount,
      autonomous: true,
    };
  }

  // ── CREATE_TOKEN (Pump.fun / Bonk.fun / Metaplex) ─

  /**
   * Create or launch a token.
   * The agent sends pre-built instructions from Pump.fun, Bonk.fun, or
   * Metaplex.  The platform signs and submits.
   *
   * params.instructions: InstructionDescriptor[]  (create/launch instructions)
   * params.platform?:   string  ('pump_fun', 'bonk_fun', 'metaplex')
   * params.tokenName?:  string  (for logging)
   * params.tokenSymbol?: string (for logging)
   */
  private async executeCreateToken(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string,
  ): Promise<Record<string, unknown>> {
    const instructions = params['instructions'] as InstructionDescriptor[] | undefined;
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error('create_token requires "instructions" array (from launchpad API)');
    }

    const platform = typeof params['platform'] === 'string' ? params['platform'] : 'unknown';
    const tokenName = typeof params['tokenName'] === 'string' ? params['tokenName'] : '';
    const tokenSymbol = typeof params['tokenSymbol'] === 'string' ? params['tokenSymbol'] : '';

    const memo = `AgenticWallet:create_token:${platform}:${tokenSymbol || 'TOKEN'}:${agentId}`;

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    const txResult = await buildArbitraryTransaction(pubkeyResult.value, instructions, memo);
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(), walletId, type: 'create_token', status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(), confirmedAt: new Date(),
      },
    });

    logger.info('Token created', { agentId, platform, tokenName, tokenSymbol, signature: sendResult.value.signature });

    return {
      signature: sendResult.value.signature,
      platform, tokenName, tokenSymbol,
      autonomous: true,
    };
  }

  // ── History ──────────────────────────────

  getIntentHistory(agentId?: string, limit: number = 100): IntentHistoryRecord[] {
    let records = this.history;
    if (agentId) {
      records = records.filter((r) => r.agentId === agentId);
    }
    return records.slice(-limit);
  }

  // ── Internal helpers ─────────────────────

  private reject(
    intentId: string,
    agentId: string,
    ext: ExternalIntent,
    reason: string,
    createdAt: Date,
  ): Result<IntentResult, Error> {
    const record: IntentHistoryRecord = {
      intentId,
      agentId,
      type: ext.type,
      params: ext.params,
      status: 'rejected',
      error: reason,
      createdAt,
    };
    this.pushHistory(record);

    logger.warn('BYOA intent rejected', { intentId, agentId, type: ext.type, reason });

    return success({
      intentId,
      status: 'rejected',
      type: ext.type,
      agentId,
      walletPublicKey: '',
      error: reason,
      executedAt: new Date(),
    });
  }

  /**
   * Public method for external callers (e.g. Orchestrator) to record
   * intent history entries for built-in agents.
   */
  recordIntent(record: IntentHistoryRecord): void {
    this.pushHistory(record);
  }

  private pushHistory(record: IntentHistoryRecord): void {
    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }
}

// ── Singleton ──────────────────────────────

let routerInstance: IntentRouter | null = null;

export function getIntentRouter(): IntentRouter {
  if (!routerInstance) {
    routerInstance = new IntentRouter();
  }
  return routerInstance;
}
