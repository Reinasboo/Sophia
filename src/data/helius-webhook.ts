/**
 * Helius Webhook Integration
 *
 * Handles inbound transaction notifications from Helius API Enhanced Transactions.
 * Parses events and routes them to the indexer.
 *
 * Webhook setup:
 * POST https://api.helius.xyz/v0/webhooks?api-key=YOUR_KEY
 * {
 *   "webhookUrl": "https://your-domain.com/api/webhook/helius",
 *   "transactionTypes": ["ALL"],
 *   "accountAddresses": ["wallet_address_1", "wallet_address_2"],
 *   "encoding": "json"
 * }
 */

import { createLogger } from '../utils/logger.js';
import { Result, success, failure } from '../types/shared.js';
import { getDataTracker } from './tracker.js';
import crypto from 'crypto';

const logger = createLogger('HELIUS_WEBHOOK');

/**
 * Enhanced transaction from Helius API
 */
export interface HeliusTransaction {
  signature: string;
  slot: number;
  blockTime: number;
  feePayer: string;
  fee: number;
  signers?: string[];
  instructions: HeliusInstruction[];
  accountData: Array<{ address: string; executable: boolean; lamports: number }>;
  status?: { ok?: unknown; err?: unknown };
  tokenTransfers?: Array<{
    tokenProgram: string;
    mint: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: string;
    decimals: number;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    lamports: number;
  }>;
  transactionError?: unknown;
  type: string;
}

/**
 * Instruction from Helius
 */
export interface HeliusInstruction {
  programId: string;
  parsed?: Record<string, unknown>;
  data?: string;
  accounts?: string[];
}

/**
 * Webhook request payload
 */
export interface HeliusWebhookPayload {
  webhookID: string;
  timestamp: string;
  events: HeliusTransaction[];
}

/**
 * Parse and index a Helius webhook event
 */
export async function handleHeliusWebhook(
  payload: HeliusWebhookPayload,
  resolveTenantId: (walletAddress: string) => string | null,
  managedWallets: string[]
): Promise<Result<{ indexed: number; errors: number }, Error>> {
  try {
    const tracker = getDataTracker();
    let indexed = 0;
    let errors = 0;
    const managedWalletSet = new Set(managedWallets);

    // Update webhook health
    tracker.updateWebhookTime();

    for (const tx of payload.events) {
      const tenantId = resolveTenantId(tx.feePayer);
      if (!tenantId) {
        errors++;
        logger.warn('Skipping webhook event for unmanaged wallet', {
          signature: tx.signature.slice(0, 20),
          feePayer: tx.feePayer,
        });
        continue;
      }

      if (managedWalletSet.size > 0 && !managedWalletSet.has(tx.feePayer)) {
        errors++;
        logger.warn('Skipping webhook event outside managed wallet set', {
          signature: tx.signature.slice(0, 20),
          feePayer: tx.feePayer,
        });
        continue;
      }

      // Determine transaction type
      const txType = classifyTransaction(tx) as 'transfer_sol' | 'transfer_token' | 'swap' | 'stake' | 'unstake' | 'unknown';

      // Extract transfers
      const { recipients, amounts, mints } = extractTransfers(tx);

      // Parse error status
      const success = !tx.transactionError;
      const error = tx.transactionError
        ? `${tx.transactionError instanceof Object ? JSON.stringify(tx.transactionError) : String(tx.transactionError)}`
        : undefined;

      // Find primary recipient (if applicable)
      const recipient = recipients[0];
      const amount = amounts[0];
      const mint = mints[0];

      const indexResult = await tracker.indexTransaction({
        signature: tx.signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        tenantId,
        walletAddress: tx.feePayer,
        type: txType,
        status: success ? 'success' : 'failed',
        amount,
        recipient,
        mint,
        programId: tx.instructions?.[0]?.programId,
        fee: tx.fee,
        instructionCount: tx.instructions?.length ?? 0,
        logMessages: [],
        error,
        parsedData: {
          tokenTransfers: tx.tokenTransfers?.length ?? 0,
          nativeTransfers: tx.nativeTransfers?.length ?? 0,
          signers: tx.signers?.length ?? 0,
        },
      });

      if (indexResult.ok) {
        indexed++;

        logger.debug('Helius transaction indexed', {
          signature: tx.signature.slice(0, 20),
          type: txType,
          success,
        });
      } else {
        errors++;
        logger.warn('Failed to index Helius transaction', {
          signature: tx.signature.slice(0, 20),
          error: indexResult.error.message,
        });
      }
    }

    logger.info('Helius webhook processed', {
      indexed,
      errors,
      totalEvents: payload.events.length,
    });

    return success({ indexed, errors });
  } catch (err) {
    logger.error('Helius webhook handler error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return failure(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Classify transaction type based on instructions and transfers
 */
function classifyTransaction(tx: HeliusTransaction): string {
  // Check for token transfers
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    return 'transfer_token';
  }

  // Check for native SOL transfers
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    return 'transfer_sol';
  }

  // Check for known program interactions
  for (const instr of tx.instructions || []) {
    if (instr.programId.includes('JUP')) {
      return 'swap';
    }
    if (instr.programId.includes('Stake')) {
      return 'stake';
    }
    if (instr.programId.includes('9092')) {
      // SPL Token Program
      return 'transfer_token';
    }
  }

  return 'unknown';
}

/**
 * Extract transfer recipients, amounts, and mints
 */
function extractTransfers(
  tx: HeliusTransaction
): { recipients: string[]; amounts: number[]; mints: string[] } {
  const recipients: string[] = [];
  const amounts: number[] = [];
  const mints: string[] = [];

  if (tx.tokenTransfers) {
    for (const transfer of tx.tokenTransfers) {
      recipients.push(transfer.toUserAccount);
      const decimals = transfer.decimals ?? 0;
      amounts.push(parseInt(transfer.tokenAmount) / Math.pow(10, decimals));
      mints.push(transfer.mint);
    }
  }

  if (tx.nativeTransfers) {
    for (const transfer of tx.nativeTransfers) {
      recipients.push(transfer.toUserAccount);
      amounts.push(transfer.lamports / 1_000_000_000); // Convert lamports to SOL
    }
  }

  return { recipients, amounts, mints };
}

/**
 * Verify Helius webhook signature (optional security)
 * Helius can sign webhooks; verify with shared secret
 */
export function verifyHeliusSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }

  const normalizedSignature = signature.trim().replace(/^sha256=/i, '');
  const expectedHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBase64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');

  for (const expected of [expectedHex, expectedBase64]) {
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(normalizedSignature, 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      continue;
    }

    if (crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return true;
    }
  }

  return false;
}
