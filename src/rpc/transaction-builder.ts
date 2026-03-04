/**
 * Transaction Builder
 *
 * Creates Solana transactions for various operations.
 * Does NOT sign transactions - that's the wallet layer's job.
 */

import {
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Result, success, failure } from '../utils/types.js';
import { getSolanaClient } from './solana-client.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('TX_BUILDER');

/**
 * Memo Program v2 — a deployed Solana program that stores arbitrary UTF-8
 * data on-chain.  Using it demonstrates real dApp / protocol interaction
 * because the transaction includes an instruction targeting a non-system
 * program (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr).
 */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * Build a standalone memo transaction (interacts with the Memo Program).
 */
export function buildMemoInstruction(
  message: string,
  signerPubkey: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signerPubkey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(message, 'utf-8'),
  });
}

/**
 * Build a standalone memo transaction that can be signed and sent.
 */
export async function buildMemoTransaction(
  signer: PublicKey,
  message: string
): Promise<Result<Transaction, Error>> {
  try {
    const client = getSolanaClient();
    const blockhashResult = await client.getRecentBlockhash();
    if (!blockhashResult.ok) return failure(blockhashResult.error);

    const transaction = new Transaction({
      recentBlockhash: blockhashResult.value,
      feePayer: signer,
    });

    transaction.add(buildMemoInstruction(message, signer));

    logger.debug('Built memo transaction', {
      signer: signer.toBase58(),
      messageLength: message.length,
    });

    return success(transaction);
  } catch (error) {
    logger.error('Failed to build memo transaction', { error: String(error) });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Build a SOL transfer transaction
 */
export async function buildSolTransfer(
  from: PublicKey,
  to: PublicKey,
  amount: number,
  memo?: string
): Promise<Result<Transaction, Error>> {
  try {
    const client = getSolanaClient();
    const blockhashResult = await client.getRecentBlockhash();

    if (!blockhashResult.ok) {
      return failure(blockhashResult.error);
    }

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction({
      recentBlockhash: blockhashResult.value,
      feePayer: from,
    });

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports,
      })
    );

    // Attach an on-chain memo via the Memo Program (dApp interaction)
    if (memo) {
      transaction.add(buildMemoInstruction(memo, from));
    }

    logger.debug('Built SOL transfer transaction', {
      from: from.toBase58(),
      to: to.toBase58(),
      amount,
      lamports,
      hasMemo: !!memo,
    });

    return success(transaction);
  } catch (error) {
    logger.error('Failed to build SOL transfer', { error: String(error) });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Build an SPL token transfer transaction
 */
export async function buildTokenTransfer(
  owner: PublicKey,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint,
  decimals: number,
  memo?: string
): Promise<Result<Transaction, Error>> {
  try {
    const client = getSolanaClient();
    const connection = client.getConnection();

    const blockhashResult = await client.getRecentBlockhash();
    if (!blockhashResult.ok) {
      return failure(blockhashResult.error);
    }

    // Get source token account
    const sourceTokenAccount = await getAssociatedTokenAddress(
      mint,
      owner,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Get destination token account
    const destTokenAccount = await getAssociatedTokenAddress(
      mint,
      recipient,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction({
      recentBlockhash: blockhashResult.value,
      feePayer: owner,
    });

    // Check if destination token account exists
    const destAccountInfo = await connection.getAccountInfo(destTokenAccount);

    if (!destAccountInfo) {
      // Create associated token account for recipient
      transaction.add(
        createAssociatedTokenAccountInstruction(
          owner, // payer
          destTokenAccount,
          recipient,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        sourceTokenAccount,
        destTokenAccount,
        owner,
        amount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Attach an on-chain memo via the Memo Program (dApp interaction)
    if (memo) {
      transaction.add(buildMemoInstruction(memo, owner));
    }

    logger.debug('Built token transfer transaction', {
      owner: owner.toBase58(),
      mint: mint.toBase58(),
      recipient: recipient.toBase58(),
      amount: amount.toString(),
    });

    return success(transaction);
  } catch (error) {
    logger.error('Failed to build token transfer', { error: String(error) });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Estimate transaction fee
 */
export async function estimateFee(transaction: Transaction): Promise<Result<number, Error>> {
  try {
    const client = getSolanaClient();
    const connection = client.getConnection();

    const message = transaction.compileMessage();
    const fees = await connection.getFeeForMessage(message);

    if (fees.value === null) {
      return failure(new Error('Failed to estimate fee'));
    }

    return success(fees.value / LAMPORTS_PER_SOL);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================
// AUTONOMOUS / RAW EXECUTION HELPERS
// ============================================

/**
 * Well-known Solana program IDs for DeFi protocols, NFT marketplaces,
 * staking, and other ecosystem programs.
 * All programs are allowed — this list is for logging and display only.
 * BYOA agents have full autonomy to interact with ANY deployed Solana program,
 * including programs not listed here.
 */
export const KNOWN_PROGRAMS: Record<string, string> = {
  // ── Core ──────────────────────────────────
  '11111111111111111111111111111111': 'System Program',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Program',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program v2',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',

  // ── Token Launchpads ──────────────────────
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
  BoNKFKgVR4AhBCbFvEJhEEGwBwMgh4xnSuFgrEbGo3xj: 'Bonk.fun',

  // ── DEX / AMMs ────────────────────────────
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: 'PumpSwap AMM',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter v6',
  jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu: 'Jupiter v6 Aggregator',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM v4',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Meteora DLMM',
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: 'Lifinity v2',

  // ── NFT / Metaplex ────────────────────────
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'Metaplex Token Metadata',
  cndy3Z4yapfJBmearM12BSwWbJyVnDErehJuiPaM2mn: 'Candy Machine v2',
  Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g: 'Candy Guard',
  CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d: 'Metaplex Core',
  BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY: 'Bubblegum (cNFTs)',
  TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN: 'Tensor Swap',
  TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfSsgAS: 'Tensor Compressed',
  M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K: 'Magic Eden v2',
  mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc: 'Magic Eden AMM',

  // ── Staking ───────────────────────────────
  Stake11111111111111111111111111111111111111: 'Native Stake Program',
  MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD: 'Marinade Finance',
  sSo14endRuUbvQaJS3dq36Q829a3A6BEfoeeRGJywEh: 'Sanctum (Marinade Native)',
  Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb: 'Jito Staking',
  stkitrT1Uoy18Dk1fTrgPw8W6MVzoCfYoAFT4MLsmhq: 'Lido for Solana',
  BLZEEuZUBVqFhj8adcCFPJvPVCiCyVmh3hkJMrU8KuJA: 'BlazeStake',

  // ── Lending / Borrowing ───────────────────
  So1endDq2YkqhipRh3WViPa8hFSqg167Mw2PWGmd2Mg: 'Solend',
  MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA: 'Marginfi v2',
  KLend2g3cP87ber8LCJR2MBk68DJYMAWfNBTamTzp8b: 'Kamino Lending',
  DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1: 'Drift Protocol',

  // ── Governance / Misc ─────────────────────
  GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw: 'SPL Governance',
  namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX: 'Name Service',
  auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg: 'Glow Auth',
};

/**
 * Instruction descriptor sent by the autonomous agent.
 * Each instruction targets a specific program with accounts and data.
 */
export interface InstructionDescriptor {
  programId: string; // base58 program address
  keys: Array<{
    pubkey: string; // base58
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // base64-encoded instruction data
}

/**
 * Build a transaction from an array of arbitrary instruction descriptors.
 * The payer is the agent's wallet (set as feePayer).
 * This enables interaction with ANY Solana program — Pump.fun, Jupiter,
 * PumpSwap, Raydium, Bonk.fun, or any custom program.
 */
export async function buildArbitraryTransaction(
  payer: PublicKey,
  instructions: InstructionDescriptor[],
  memo?: string
): Promise<Result<Transaction, Error>> {
  try {
    if (!instructions || instructions.length === 0) {
      return failure(new Error('At least one instruction is required'));
    }

    const client = getSolanaClient();
    const blockhashResult = await client.getRecentBlockhash();
    if (!blockhashResult.ok) return failure(blockhashResult.error);

    const transaction = new Transaction({
      recentBlockhash: blockhashResult.value,
      feePayer: payer,
    });

    for (const ix of instructions) {
      const programId = new PublicKey(ix.programId);
      const keys = ix.keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      }));
      const data = Buffer.from(ix.data, 'base64');

      transaction.add(new TransactionInstruction({ programId, keys, data }));

      const programName = KNOWN_PROGRAMS[ix.programId] ?? ix.programId.slice(0, 8) + '...';
      logger.debug('Added instruction', {
        programName,
        numKeys: keys.length,
        dataLen: data.length,
      });
    }

    // Optionally append a memo for audit trail
    if (memo) {
      transaction.add(buildMemoInstruction(memo, payer));
    }

    logger.info('Built arbitrary transaction', {
      payer: payer.toBase58(),
      numInstructions: instructions.length + (memo ? 1 : 0),
      programs: instructions.map((ix) => KNOWN_PROGRAMS[ix.programId] ?? ix.programId.slice(0, 8)),
    });

    return success(transaction);
  } catch (error) {
    logger.error('Failed to build arbitrary transaction', { error: String(error) });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Deserialize a base64-encoded transaction (wire format) and return a
 * Transaction object ready for signing.  The payer's recent blockhash is
 * refreshed to prevent the agent from using a stale one.
 */
export async function deserializeTransaction(
  base64Tx: string,
  payer: PublicKey
): Promise<Result<Transaction, Error>> {
  try {
    const buffer = Buffer.from(base64Tx, 'base64');
    const transaction = Transaction.from(buffer);

    // Refresh blockhash so the transaction is valid
    const client = getSolanaClient();
    const bh = await client.getRecentBlockhash();
    if (!bh.ok) return failure(bh.error);

    transaction.recentBlockhash = bh.value;
    transaction.feePayer = payer;

    logger.info('Deserialized raw transaction', {
      payer: payer.toBase58(),
      numInstructions: transaction.instructions.length,
    });

    return success(transaction);
  } catch (error) {
    logger.error('Failed to deserialize transaction', { error: String(error) });
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}
