/**
 * Solana RPC Client
 *
 * Handles all Solana blockchain interactions:
 * - Connection management
 * - Balance queries
 * - Transaction submission with retries
 * - Confirmation tracking
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionSignature,
  LAMPORTS_PER_SOL,
  SendOptions,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  Result,
  success,
  failure,
  BalanceInfo,
  TokenBalance,
  TransactionStatus,
} from '../types/index.js';
import { getConfig } from '../utils/config.js';
import { toError } from '../utils/error-helpers.js';
import { createLogger } from '../utils/logger.js';
import { getAgentContextCache } from '../utils/agent-context-cache.js';

const logger = createLogger('RPC');

interface TransactionResult {
  signature: TransactionSignature;
  status: TransactionStatus;
  slot?: number;
  error?: string;
}

/**
 * SolanaClient - Handles all blockchain interactions
 */
export class SolanaClient {
  private connection: Connection;
  private maxRetries: number;

  constructor() {
    const config = getConfig();

    this.connection = new Connection(config.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.CONFIRMATION_TIMEOUT_MS,
    });

    this.maxRetries = config.MAX_RETRIES;

    logger.info('Solana client initialized', {
      rpcUrl: config.SOLANA_RPC_URL,
      network: config.SOLANA_NETWORK,
    });
  }

  /**
   * Retry helper with exponential backoff + jitter
   * Attempts an operation multiple times with increasing delays and random jitter
   * to prevent thundering herd problem in distributed scenarios
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<Result<T, Error>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          logger.info(`${operationName} succeeded after ${attempt} attempts`);
        }
        return success(result);
      } catch (error) {
        lastError = toError(error);
        const isLastAttempt = attempt === this.maxRetries;

        if (isLastAttempt) {
          logger.error(`${operationName} failed (attempt ${attempt}/${this.maxRetries})`, {
            error: lastError.message,
          });
        } else {
          logger.warn(`${operationName} failed (attempt ${attempt}/${this.maxRetries})`, {
            error: lastError.message,
          });
        }

        if (!isLastAttempt) {
          // Exponential backoff with jitter: prevents thundering herd
          // Base: 100ms, 200ms, 400ms, 800ms...
          // Jitter: +/- 20% randomization
          const baseDelayMs = 100 * Math.pow(2, attempt - 1);
          const jitterRange = baseDelayMs * 0.2; // 20% jitter
          const jitter = Math.random() * jitterRange - jitterRange / 2;
          const delayMs = Math.max(baseDelayMs + jitter, 50); // Minimum 50ms
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    return failure(
      lastError || new Error(`${operationName} failed after ${this.maxRetries} attempts`)
    );
  }

  /**
   * Get singleton connection for advanced operations.
   * Reuses the same Connection instance to maintain state and avoid overhead.
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Check if the network is healthy
   */
  async checkHealth(): Promise<Result<boolean, Error>> {
    try {
      const version = await this.connection.getVersion();
      logger.debug('Network health check passed', { version });
      return success(true);
    } catch (error) {
      logger.error('Network health check failed', { error: toError(error).message });
      return failure(toError(error));
    }
  }

  /**
   * Get SOL balance for a public key (with caching)
   */
  async getBalance(publicKey: PublicKey): Promise<Result<BalanceInfo, Error>> {
    const cache = getAgentContextCache();
    const walletAddress = publicKey.toBase58();

    // Check cache first
    const cached = cache.getBalance(walletAddress);
    if (cached) {
      logger.debug('Balance cache hit', { publicKey: walletAddress });
      return success(cached.balance);
    }

    // Cache miss - fetch from RPC
    const result = await this.withRetry(async () => {
      const lamports = await this.connection.getBalance(publicKey);
      return {
        sol: lamports / LAMPORTS_PER_SOL,
        lamports: BigInt(lamports),
      };
    }, `getBalance(${publicKey.toBase58()})`);

    if (!result.ok) {
      logger.error('Failed to get balance after retries', {
        publicKey: publicKey.toBase58(),
        error: result.error.message,
      });
      return result;
    }

    logger.debug('Balance fetched from RPC', {
      publicKey: publicKey.toBase58(),
      sol: result.value.sol,
    });

    // Cache the result with token balances
    // Note: We'll cache token balances separately
    const tokenBalances = await this.getTokenBalances(publicKey);
    cache.setBalance(walletAddress, result.value, tokenBalances.ok ? tokenBalances.value : []);

    return success(result.value);
  }

  /**
   * Get SPL token balances for a wallet (with caching)
   */
  async getTokenBalances(owner: PublicKey): Promise<Result<TokenBalance[], Error>> {
    const cache = getAgentContextCache();
    const walletAddress = owner.toBase58();

    // Check cache first
    const cached = cache.getBalance(walletAddress);
    if (cached) {
      logger.debug('Token balances cache hit', { owner: walletAddress });
      return success(cached.tokenBalances);
    }

    const result = await this.withRetry(async () => {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      });

      return tokenAccounts.value.map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed.info;

        return {
          mint: info.mint,
          amount: info.tokenAmount.amount, // Keep as string to handle large numbers
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        };
      });
    }, `getTokenBalances(${owner.toBase58()})`);

    if (!result.ok) {
      logger.error('Failed to fetch token balances after retries', {
        owner: owner.toBase58(),
        error: result.error.message,
      });
      return result;
    }

    logger.debug('Token balances fetched from RPC', {
      owner: owner.toBase58(),
      tokenCount: result.value.length,
    });

    // Cache token balances along with balance info
    const balanceResult = await this.getBalance(owner);
    cache.setBalance(
      walletAddress,
      balanceResult.ok ? balanceResult.value : { sol: 0, lamports: BigInt(0) },
      result.value
    );

    return result;
  }

  /**
   * Request an airdrop (devnet only)
   */
  async requestAirdrop(
    publicKey: PublicKey,
    amount: number
  ): Promise<Result<TransactionResult, Error>> {
    const config = getConfig();

    if (config.SOLANA_NETWORK !== 'devnet') {
      return failure(new Error('Airdrops are only available on devnet'));
    }

    // Limit airdrop amount
    const maxAirdrop = 2; // SOL
    if (amount > maxAirdrop) {
      return failure(new Error(`Airdrop amount cannot exceed ${maxAirdrop} SOL`));
    }

    try {
      logger.info('Requesting airdrop', {
        publicKey: publicKey.toBase58(),
        amount,
      });

      const signature = await this.connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);

      // Wait for confirmation
      const confirmation = await this.confirmTransaction(signature);

      if (!confirmation.ok) {
        return failure(confirmation.error);
      }

      return success({
        signature,
        status: 'confirmed',
        slot: confirmation.value.slot,
      });
    } catch (error) {
      logger.error('Airdrop failed', {
        publicKey: publicKey.toBase58(),
        amount,
        error: toError(error).message,
      });
      return failure(toError(error));
    }
  }

  /**
   * Send a signed transaction with retries, preflight checks, and exponential backoff + jitter
   *
   * Strategy:
   * 1. Optionally preflight check transaction
   * 2. Send with skipPreflight=false for max safety
   * 3. If submission fails (transient), retry with exponential backoff + jitter
   * 4. If simulation fails (programming error), fail fast
   * 5. Confirmation polling with timeout
   */
  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ): Promise<Result<TransactionResult, Error>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info('Retrying transaction submission', { attempt, maxRetries: this.maxRetries });
        }

        const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          ...options,
        });

        logger.info('Transaction submitted successfully', { signature, attempt });

        // Wait for confirmation
        const confirmation = await this.confirmTransaction(signature);

        if (!confirmation.ok) {
          lastError = confirmation.error;

          // Don't retry confirmation failures — move to next attempt of full submission
          if (attempt < this.maxRetries) {
            logger.warn('Transaction confirmation failed, will retry submission', {
              attempt,
              error: lastError.message,
            });
            continue;
          } else {
            break;
          }
        }

        return success({
          signature,
          status: 'confirmed',
          slot: confirmation.value.slot,
        });
      } catch (error) {
        lastError = toError(error);
        logger.warn('Transaction attempt failed', {
          attempt,
          error: lastError.message,
          isRetryable: !this.isNonRetryableError(lastError),
        });

        // Don't retry certain errors (programming errors, invalid signatures, etc.)
        if (this.isNonRetryableError(lastError)) {
          logger.error('Non-retryable error encountered, failing immediately', {
            error: lastError.message,
          });
          break;
        }

        // Wait before retry with exponential backoff + jitter
        if (attempt < this.maxRetries) {
          // Base: 1s, 2s, 4s, 8s...
          const baseBackoffMs = 1000 * Math.pow(2, attempt);
          // Add jitter: ±25%
          const jitterRange = baseBackoffMs * 0.25;
          const jitter = Math.random() * jitterRange - jitterRange / 2;
          const backoffMs = Math.max(Math.min(baseBackoffMs + jitter, 16_000), 500);

          logger.debug('Waiting before retry', {
            backoffMs: Math.round(backoffMs),
            attempt,
          });

          await this.sleep(backoffMs);
        }
      }
    }

    logger.error('Transaction failed after all retry attempts', {
      attempts: this.maxRetries + 1,
      error: lastError?.message,
    });

    return failure(lastError ?? new Error('Transaction failed after all retry attempts'));
  }

  /**
   * Confirm a transaction
   */
  private async confirmTransaction(
    signature: TransactionSignature
  ): Promise<Result<{ slot: number }, Error>> {
    const result = await this.withRetry(async () => {
      const latestBlockhash = await this.connection.getLatestBlockhash();

      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.info('Transaction confirmed', {
        signature,
        slot: confirmation.context.slot,
      });

      return { slot: confirmation.context.slot };
    }, 'confirmTransaction');

    return result;
  }

  /**
   * Get recent blockhash and lastValidBlockHeight for transaction building.
   * The overloaded signature preserves backward compatibility.
   */
  async getRecentBlockhash(): Promise<Result<string, Error>>;
  async getRecentBlockhash(
    full: true
  ): Promise<Result<{ blockhash: string; lastValidBlockHeight: number }, Error>>;
  async getRecentBlockhash(
    full?: true
  ): Promise<Result<string | { blockhash: string; lastValidBlockHeight: number }, Error>> {
    const result = await this.withRetry(async () => {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      if (full) {
        return { blockhash, lastValidBlockHeight };
      }
      return blockhash;
    }, 'getRecentBlockhash');

    return result;
  }

  /**
   * Get minimum balance for rent exemption
   */
  async getMinimumBalanceForRentExemption(dataSize: number): Promise<Result<number, Error>> {
    const result = await this.withRetry(async () => {
      const lamports = await this.connection.getMinimumBalanceForRentExemption(dataSize);
      return lamports;
    }, 'getMinimumBalanceForRentExemption');

    return result;
  }

  /**
   * Fetch the decimals for an SPL token mint.
   * Falls back to 9 if the mint account can't be read.
   */
  async getMintDecimals(mint: PublicKey): Promise<number> {
    try {
      const result = await this.withRetry(async () => {
        return await this.connection.getParsedAccountInfo(mint);
      }, 'getMintDecimals');

      if (!result.ok) {
        logger.warn('Failed to fetch mint decimals (retry exhausted), defaulting to 9', {
          mint: mint.toBase58(),
          error: result.error.message,
        });
        return 9;
      }

      const rpcResponse = result.value;
      const accountInfo = rpcResponse?.value;

      if (
        accountInfo?.data &&
        typeof accountInfo.data === 'object' &&
        'parsed' in accountInfo.data
      ) {
        const decimals = (accountInfo.data as any).parsed?.info?.decimals;
        if (typeof decimals === 'number') return decimals;
      }
      return 9; // default for most SPL tokens
    } catch {
      logger.warn('Failed to fetch mint decimals, defaulting to 9', { mint: mint.toBase58() });
      return 9;
    }
  }

  /**
   * Simulate a transaction before sending to catch errors before paying fees.
   */
  async simulateTransaction(
    transaction:
      | import('@solana/web3.js').Transaction
      | import('@solana/web3.js').VersionedTransaction
  ): Promise<Result<true, Error>> {
    const result = await this.withRetry(async () => {
      let simResult;
      if ('version' in transaction) {
        simResult = await this.connection.simulateTransaction(transaction);
      } else {
        simResult = await this.connection.simulateTransaction(transaction);
      }
      if (simResult.value.err) {
        throw new Error(`Simulation failed: ${JSON.stringify(simResult.value.err)}`);
      }
      return true;
    }, 'simulateTransaction');

    return result as Result<true, Error>;
  }

  /**
   * Check if an error should not be retried
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryablePatterns = [
      'insufficient funds',
      'invalid account',
      'account not found',
      'invalid blockhash',
      'transaction too large',
    ];

    const message = error.message.toLowerCase();
    return nonRetryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Solana Client Singleton
 *
 * Maintains a single, reusable Connection instance to efficiently manage
 * Solana RPC resources. This prevents:
 * - Multiple concurrent connections to the same RPC endpoint
 * - Connection lifecycle overhead for each transaction
 * - Resource exhaustion from unbounded connection creation
 *
 * @returns The global SolanaClient instance (lazy-initialized on first call)
 */

// Singleton instance
let solanaClientInstance: SolanaClient | null = null;

export function getSolanaClient(): SolanaClient {
  if (!solanaClientInstance) {
    solanaClientInstance = new SolanaClient();
  }
  return solanaClientInstance;
}
