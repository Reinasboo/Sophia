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
 * - Agents can interact with ANY valid Solana program including but not
 *   limited to: trading (Jupiter, Raydium, Orca), token launches (Pump.fun,
 *   Bonk.fun), staking (Marinade, Jito, native stake), NFT marketplaces
 *   (Magic Eden, Tensor, Metaplex), lending (Marginfi, Kamino, Solend),
 *   and any custom or future deployed program.
 * - Authentication is via control token (bearer)
 * - Rate limiting protects infrastructure (not wallet funds)
 * - All actions are fully logged for auditability
 */

import { v4 as uuidv4 } from 'uuid';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { createLogger } from '../utils/logger.js';
import { getRateLimiter } from '../utils/rate-limiter.js';
import {
  Result,
  success,
  failure,
  IntentHistoryRecord as SharedIntentHistoryRecord,
  SupportedIntentType,
} from '../types/shared.js';
import { ServicePaymentIntent } from '../types/internal.js';
import { getWalletManager, WalletManager, getServicePolicyManager } from '../wallet/index.js';
import {
  getSolanaClient,
  buildSolTransfer,
  buildTokenTransfer,
  buildArbitraryTransaction,
  deserializeTransaction,
  KNOWN_PROGRAMS,
  SolanaClient,
} from '../rpc/index.js';
import type { InstructionDescriptor } from '../types/internal.js';
import { getAgentRegistry, AgentRegistry, ExternalAgentRecord } from './agentRegistry.js';
import { eventBus } from '../orchestrator/event-emitter.js';

const logger = createLogger('BYOA_INTENT');

// ────────────────────────────────────────────
// Program reference for autonomous execute_instructions
// All programs are allowed — this list is for logging only.
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// External intent payload (what the caller sends)
// ────────────────────────────────────────────

/**
 * External intent with strongly-documented parameter requirements.
 *
 * Supported intent types and their params:
 *
 * - REQUEST_AIRDROP: { amount: number } - Request devnet SOL
 * - TRANSFER_SOL: { recipient: string, amount: number, memo?: string } - Transfer SOL
 * - TRANSFER_TOKEN: { mint: string, recipient: string, amount: number, decimals?: number, memo?: string } - Transfer SPL tokens
 * - QUERY_BALANCE: {} - Query wallet balance (no params)
 * - AUTONOMOUS: { action?: string, [key: string]: unknown } - Agent decides action
 * - SERVICE_PAYMENT: { serviceId: string, recipient: string, amount: number, description?: string } - Service payment
 */
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

export type IntentHistoryRecord = SharedIntentHistoryRecord;

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
// Sanitization Helper for Logging
// ────────────────────────────────────────────

/**
 * Sanitize intent params for safe logging.
 * Redacts sensitive information: addresses, amounts, service IDs, memos.
 */
function sanitizeIntentParams(
  type: SupportedIntentType,
  params: Record<string, unknown>
): Record<string, unknown> {
  if (!params) return {};

  const sanitized: Record<string, unknown> = {};

  switch (type) {
    case 'REQUEST_AIRDROP':
      sanitized['amount'] = params['amount'] ? '***' : undefined;
      break;

    case 'TRANSFER_SOL':
      sanitized['recipient'] = params['recipient']
        ? truncateAddress(params['recipient'] as string)
        : undefined;
      sanitized['amount'] = params['amount'] ? '***' : undefined;
      sanitized['memo'] = params['memo'] ? '[REDACTED]' : undefined;
      break;

    case 'TRANSFER_TOKEN':
      sanitized['mint'] = params['mint'] ? truncateAddress(params['mint'] as string) : undefined;
      sanitized['recipient'] = params['recipient']
        ? truncateAddress(params['recipient'] as string)
        : undefined;
      sanitized['amount'] = params['amount'] ? '***' : undefined;
      sanitized['decimals'] = params['decimals'];
      sanitized['memo'] = params['memo'] ? '[REDACTED]' : undefined;
      break;

    case 'QUERY_BALANCE':
      // No sensitive params
      break;

    case 'AUTONOMOUS':
      sanitized['action'] = params['action'];
      // Redact all other autonomous params for privacy
      break;

    case 'SERVICE_PAYMENT':
      sanitized['serviceId'] = params['serviceId'] ? '[REDACTED]' : undefined;
      sanitized['recipient'] = params['recipient']
        ? truncateAddress(params['recipient'] as string)
        : undefined;
      sanitized['amount'] = params['amount'] ? '***' : undefined;
      sanitized['description'] = params['description'] ? '[REDACTED]' : undefined;
      break;

    default:
      // For unknown types, redact everything except type
      return {};
  }

  return sanitized;
}

/**
 * Truncate a public key or address to first and last 4 characters.
 * Safe to display in logs.
 */
function truncateAddress(address: string): string {
  if (typeof address !== 'string' || address.length <= 8) {
    return '[ADDR]';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// ────────────────────────────────────────────
// Transaction Signature Validation
// ────────────────────────────────────────────

/**
 * Validates that a transaction has been properly signed.
 * Ensures all required signers are present before submission.
 */
function validateTransactionSignature(
  tx: Transaction | VersionedTransaction,
  expectedSigner: PublicKey
): Result<true, Error> {
  try {
    // Check if transaction has signatures
    if (!tx.signatures || tx.signatures.length === 0) {
      return failure(new Error('Transaction was not signed: signatures array is empty'));
    }

    // Check if expected signer is in the signatures
    // Handle both Transaction and VersionedTransaction types
    const hasExpectedSigner = tx.signatures.some((sig) => {
      // For Transaction: sig is { publicKey: PublicKey, signature: Buffer | null }
      // For VersionedTransaction: sig is Uint8Array (just the signature bytes)
      if (sig && typeof sig === 'object' && !ArrayBuffer.isView(sig)) {
        const pubkeySig = sig as any;
        return pubkeySig.publicKey?.equals?.(expectedSigner);
      }
      return false;
    });

    if (!hasExpectedSigner) {
      return failure(
        new Error(
          `Expected signer ${expectedSigner.toBase58()} not found in transaction signatures`
        )
      );
    }

    return success(true);
  } catch (error) {
    return failure(
      error instanceof Error
        ? error
        : new Error(`Transaction signature validation failed: ${String(error)}`)
    );
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
  private servicePolicyManager = getServicePolicyManager();
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
    externalIntent: ExternalIntent
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
      return this.reject(
        intentId,
        agent.id,
        externalIntent,
        `Agent is not active (status: ${agent.status})`,
        createdAt
      );
    }

    // ── 3. Check wallet binding ────────────
    if (!agent.walletId) {
      return this.reject(
        intentId,
        agent.id,
        externalIntent,
        'Agent has no bound wallet',
        createdAt
      );
    }

    // ── 4. Rate limit (agent-level) ───────────
    if (!this.rateLimiter.check(agent.id)) {
      return this.reject(
        intentId,
        agent.id,
        externalIntent,
        'Rate limit exceeded (max 30 intents/min)',
        createdAt
      );
    }

    // ── 4b. Rate limit (wallet-level) ─────────
    const walletRateLimiter = getRateLimiter();
    const walletAddress = agent.walletPublicKey ?? '';
    const walletRateLimitCheck = walletRateLimiter.canSubmitTransaction(walletAddress);
    if (!walletRateLimitCheck.allowed) {
      logger.warn('Wallet rate limit exceeded', {
        wallet: walletAddress,
        reason: walletRateLimitCheck.reason,
        retryAfterMs: walletRateLimitCheck.retryAfterMs,
      });
      return this.reject(
        intentId,
        agent.id,
        externalIntent,
        walletRateLimitCheck.reason || 'Wallet rate limit exceeded',
        createdAt
      );
    }

    // ── 5. Validate intent is supported ────
    if (!agent.supportedIntents.includes(externalIntent.type)) {
      return this.reject(
        intentId,
        agent.id,
        externalIntent,
        `Intent type "${externalIntent.type}" is not in this agent's supported set`,
        createdAt
      );
    }

    // ── 6. Execute ─────────────────────────
    try {
      const result = await this.executeIntent(agent, externalIntent, intentId);

      // Record transaction in rate limiter (after successful submission)
      walletRateLimiter.recordTransaction(walletAddress);
      walletRateLimiter.recordRpcCall(); // Record the RPC call cost

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

      logger.info('BYOA intent executed', {
        intentId,
        agentId: agent.id,
        type: externalIntent.type,
      });
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
    intentId: string
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
      case 'SERVICE_PAYMENT':
        return this.executeServicePayment(walletId, agent.id, ext.params, intentId);
      default:
        throw new Error(`Unsupported intent type: ${ext.type}`);
    }
  }

  // ── REQUEST_AIRDROP ──────────────────────

  private async executeAirdrop(
    walletId: string,
    params: Record<string, unknown>,
    _intentId: string
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
    _agentId: string,
    params: Record<string, unknown>,
    _intentId: string
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

    const signedTx = signResult.value;

    // Validate that transaction was actually signed with the fee payer
    const sigValidation = validateTransactionSignature(signedTx, pubkeyResult.value);
    if (!sigValidation.ok) {
      throw sigValidation.error;
    }

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signedTx);
    if (!simResult.ok) throw simResult.error;

    // Send
    const sendResult = await this.solanaClient.sendTransaction(signedTx);
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
    _intentId: string
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

    // M-2/M-4 FIX: Validate decimals strictly — must be a safe integer 0–18.
    // Reject Infinity/NaN/floats which would corrupt the BigInt conversion.
    const rawDecimals = params['decimals'];
    const decimals: number =
      rawDecimals !== undefined && rawDecimals !== null
        ? (() => {
            if (
              typeof rawDecimals !== 'number' ||
              !Number.isInteger(rawDecimals) ||
              rawDecimals < 0 ||
              rawDecimals > 18
            ) {
              throw new Error('decimals must be an integer between 0 and 18');
            }
            return rawDecimals;
          })()
        : 9;
    const scaled = amount * Math.pow(10, decimals);
    if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER) {
      throw new Error('Token amount is too large to convert safely');
    }
    const rawAmount = BigInt(Math.round(scaled));
    const txResult = await buildTokenTransfer(
      pubkeyResult.value,
      mintPubkey,
      recipientPubkey,
      rawAmount,
      decimals,
      `AgenticWallet:byoa_token_transfer:${agentId}`
    );
    if (!txResult.ok) throw txResult.error;

    // Sign
    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    const signedTx = signResult.value;

    // Validate that transaction was actually signed with the fee payer
    const sigValidation = validateTransactionSignature(signedTx, pubkeyResult.value);
    if (!sigValidation.ok) {
      throw sigValidation.error;
    }

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signedTx);
    if (!simResult.ok) throw simResult.error;

    // Send
    const sendResult = await this.solanaClient.sendTransaction(signedTx);
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
   *   stake              – stake SOL (Marinade / Jito / native stake)
   *   buy_nft            – purchase NFT (Magic Eden / Tensor / any marketplace)
   *   interact_program   – interact with any deployed Solana program
   *   <any other>        – routed to execute_instructions for full autonomy
   */
  private async executeAutonomous(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    intentId: string
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

      case 'stake':
      case 'buy_nft':
      case 'interact_program':
        // First-class aliases — all route to arbitrary instruction execution.
        // Agents have full autonomy to interact with any valid Solana program:
        // staking (Marinade, Jito, native), NFTs (Magic Eden, Tensor, Metaplex),
        // DeFi, gaming, governance, or any custom program.
        return this.executeArbitraryInstructions(walletId, agentId, params, intentId);

      default:
        // FULL AUTONOMY: any action name the agent sends is accepted.
        // If instructions are provided, execute them. Otherwise, if a
        // raw transaction is provided, execute that. The agent is never
        // blocked from interacting with any Solana program.
        if (Array.isArray(params['instructions'])) {
          logger.info(`Action "${action}" — executing as arbitrary instructions (full autonomy)`);
          return this.executeArbitraryInstructions(walletId, agentId, params, intentId);
        }
        if (typeof params['transaction'] === 'string') {
          logger.info(`Action "${action}" — executing as raw transaction (full autonomy)`);
          return this.executeRawTransaction(walletId, agentId, params, intentId);
        }
        throw new Error(
          `Autonomous intent action "${action}" requires either an "instructions" array ` +
            'or a "transaction" (base64) param. The agent has full autonomy to interact ' +
            'with any Solana program — provide the program instructions to execute.'
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
    _intentId: string
  ): Promise<Record<string, unknown>> {
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';

    if (amount <= 0) throw new Error('Transfer amount must be positive');
    if (!recipient) throw new Error('Recipient address is required');

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw new Error(`Invalid recipient: ${recipient}`);
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // Build, sign, send — NO policy check
    const txResult = await buildSolTransfer(
      pubkeyResult.value,
      recipientPubkey,
      amount,
      `AgenticWallet:autonomous:${agentId}`
    );
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    const signedTx = signResult.value;

    // Validate that transaction was actually signed with the fee payer
    const sigValidation = validateTransactionSignature(signedTx, pubkeyResult.value);
    if (!sigValidation.ok) {
      throw sigValidation.error;
    }

    // Simulate before sending to catch errors pre-fee
    const simResult = await this.solanaClient.simulateTransaction(signedTx);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signedTx);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

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

    return { signature: sendResult.value.signature, amount, recipient, autonomous: true };
  }

  /**
   * Autonomous token transfer — skips wallet-policy validation.
   */
  private async executeAutonomousTransferToken(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    _intentId: string
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
    } catch {
      throw new Error(`Invalid address: recipient=${recipient}, mint=${mint}`);
    }

    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // M-2/M-4 FIX: Validate decimals strictly — must be a safe integer 0–18.
    const rawDecimals = params['decimals'];
    const decimals: number =
      rawDecimals !== undefined && rawDecimals !== null
        ? (() => {
            if (
              typeof rawDecimals !== 'number' ||
              !Number.isInteger(rawDecimals) ||
              rawDecimals < 0 ||
              rawDecimals > 18
            ) {
              throw new Error('decimals must be an integer between 0 and 18');
            }
            return rawDecimals;
          })()
        : 9;
    const scaled = amount * Math.pow(10, decimals);
    if (!Number.isFinite(scaled) || scaled > Number.MAX_SAFE_INTEGER) {
      throw new Error('Token amount is too large to convert safely');
    }
    const rawAmount = BigInt(Math.round(scaled));
    const txResult = await buildTokenTransfer(
      pubkeyResult.value,
      mintPubkey,
      recipientPubkey,
      rawAmount,
      decimals,
      `AgenticWallet:autonomous_token:${agentId}`
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
    _intentId: string
  ): Promise<Record<string, unknown>> {
    const instructions = params['instructions'] as InstructionDescriptor[] | undefined;
    if (!Array.isArray(instructions) || instructions.length === 0) {
      throw new Error('execute_instructions requires a non-empty "instructions" array');
    }

    // Validate each instruction descriptor
    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i]!;
      if (!ix.programId || !Array.isArray(ix.keys) || typeof ix.data !== 'string') {
        throw new Error(
          `Instruction[${i}] missing required fields: programId, keys[], data (base64)`
        );
      }
    }

    // No program allowlist — BYOA agents have full autonomy to interact
    // with any Solana program. All executions are logged for auditability.

    const memo =
      typeof params['memo'] === 'string'
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

    const programs = instructions.map(
      (ix) => KNOWN_PROGRAMS[ix.programId] ?? ix.programId.slice(0, 8) + '...'
    );

    eventBus.emit({
      id: uuidv4(),
      type: 'transaction',
      timestamp: new Date(),
      transaction: {
        id: uuidv4(),
        walletId,
        type: 'raw_execute',
        status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    logger.info('Arbitrary instructions executed', {
      agentId,
      signature: sendResult.value.signature,
      numInstructions: instructions.length,
      programs,
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
    _intentId: string
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
        id: uuidv4(),
        walletId,
        type: 'raw_execute',
        status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
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
    _intentId: string
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
        id: uuidv4(),
        walletId,
        type: 'swap',
        status: 'confirmed',
        amount,
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    logger.info('Swap executed', {
      agentId,
      dex,
      inputMint,
      outputMint,
      amount,
      signature: sendResult.value.signature,
    });

    return {
      signature: sendResult.value.signature,
      dex,
      inputMint,
      outputMint,
      amount,
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
    _intentId: string
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
        id: uuidv4(),
        walletId,
        type: 'create_token',
        status: 'confirmed',
        signature: sendResult.value.signature,
        createdAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    logger.info('Token created', {
      agentId,
      platform,
      tokenName,
      tokenSymbol,
      signature: sendResult.value.signature,
    });

    return {
      signature: sendResult.value.signature,
      platform,
      tokenName,
      tokenSymbol,
      autonomous: true,
    };
  }

  // ── SERVICE_PAYMENT ──────────────────────

  /**
   * Execute a service payment (x402/MPP pay-per-use).
   *
   * Enforces per-service spend caps, daily budgets, and cooldowns.
   * This is the primary entry point for pay-per-use service billing.
   *
   * Params:
   *   serviceId     – unique service identifier
   *   amount        – SOL to pay
   *   description   – optional description
   *   metadata      – optional metadata
   */
  private async executeServicePayment(
    walletId: string,
    agentId: string,
    params: Record<string, unknown>,
    intentId: string
  ): Promise<Record<string, unknown>> {
    const serviceId = typeof params['serviceId'] === 'string' ? params['serviceId'] : '';
    const amount = typeof params['amount'] === 'number' ? params['amount'] : 0;
    const recipient = typeof params['recipient'] === 'string' ? params['recipient'] : '';
    const description = typeof params['description'] === 'string' ? params['description'] : '';

    if (!serviceId) throw new Error('serviceId is required for service payment');
    if (amount <= 0) throw new Error('Payment amount must be positive');
    if (!recipient) throw new Error('Recipient (service address) is required');

    // ── 1. Validate service policy
    const policyCheckResult = this.servicePolicyManager.validateServicePayment(
      walletId,
      {
        id: intentId,
        agentId,
        timestamp: new Date(),
        type: 'service_payment',
        serviceId,
        amount,
      } as ServicePaymentIntent,
      params['programId'] as string | undefined
    );

    if (!policyCheckResult.ok) {
      throw new Error(`Service policy rejected: ${policyCheckResult.error.message}`);
    }

    // ── 2. Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw new Error(`Invalid recipient address: ${recipient}`);
    }

    // ── 3. Get wallet public key
    const pubkeyResult = this.walletManager.getPublicKey(walletId);
    if (!pubkeyResult.ok) throw pubkeyResult.error;

    // ── 4. Build and execute transfer
    const txResult = await buildSolTransfer(
      pubkeyResult.value,
      recipientPubkey,
      amount,
      `AgenticWallet:service_payment:${serviceId}:${agentId}`
    );
    if (!txResult.ok) throw txResult.error;

    const signResult = this.walletManager.signTransaction(walletId, txResult.value);
    if (!signResult.ok) throw signResult.error;

    const simResult = await this.solanaClient.simulateTransaction(signResult.value);
    if (!simResult.ok) throw simResult.error;

    const sendResult = await this.solanaClient.sendTransaction(signResult.value);
    if (!sendResult.ok) throw sendResult.error;

    this.walletManager.recordTransfer(walletId);

    // ── 5. Record service payment in policy manager
    this.servicePolicyManager.recordServicePayment(walletId, serviceId, amount, intentId);

    // ── 6. Emit event
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

    logger.info('Service payment executed', {
      agentId,
      serviceId,
      amount,
      signature: sendResult.value.signature,
    });

    return {
      signature: sendResult.value.signature,
      amount,
      recipient,
      serviceId,
      description,
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
    createdAt: Date
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

    logger.warn('BYOA intent rejected', {
      intentId,
      agentId,
      type: ext.type,
      params: sanitizeIntentParams(ext.type, ext.params),
      reason,
    });

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
