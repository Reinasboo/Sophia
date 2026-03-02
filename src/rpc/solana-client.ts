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
  Commitment,
  SendOptions,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Result,
  success,
  failure,
  BalanceInfo,
  TokenBalance,
  TransactionStatus,
} from '../utils/types.js';
import { getConfig } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

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
  private confirmationTimeout: number;

  constructor() {
    const config = getConfig();
    
    this.connection = new Connection(config.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.CONFIRMATION_TIMEOUT_MS,
    });
    
    this.maxRetries = config.MAX_RETRIES;
    this.confirmationTimeout = config.CONFIRMATION_TIMEOUT_MS;
    
    logger.info('Solana client initialized', {
      rpcUrl: config.SOLANA_RPC_URL,
      network: config.SOLANA_NETWORK,
    });
  }

  /**
   * Get connection for advanced operations
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
      logger.error('Network health check failed', { error: String(error) });
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get SOL balance for a public key
   */
  async getBalance(publicKey: PublicKey): Promise<Result<BalanceInfo, Error>> {
    try {
      const lamports = await this.connection.getBalance(publicKey);
      
      const balance: BalanceInfo = {
        sol: lamports / LAMPORTS_PER_SOL,
        lamports: BigInt(lamports),
      };
      
      logger.debug('Balance fetched', {
        publicKey: publicKey.toBase58(),
        sol: balance.sol,
      });
      
      return success(balance);
    } catch (error) {
      logger.error('Failed to fetch balance', {
        publicKey: publicKey.toBase58(),
        error: String(error),
      });
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get SPL token balances for a wallet
   */
  async getTokenBalances(owner: PublicKey): Promise<Result<TokenBalance[], Error>> {
    try {
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        owner,
        { programId: TOKEN_PROGRAM_ID }
      );
      
      const balances: TokenBalance[] = tokenAccounts.value.map((account) => {
        const parsed = account.account.data.parsed;
        const info = parsed.info;
        
        return {
          mint: info.mint,
          amount: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        };
      });
      
      logger.debug('Token balances fetched', {
        owner: owner.toBase58(),
        tokenCount: balances.length,
      });
      
      return success(balances);
    } catch (error) {
      logger.error('Failed to fetch token balances', {
        owner: owner.toBase58(),
        error: String(error),
      });
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
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
      
      const signature = await this.connection.requestAirdrop(
        publicKey,
        amount * LAMPORTS_PER_SOL
      );
      
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
        error: String(error),
      });
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send a signed transaction with retries
   */
  async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    options?: SendOptions
  ): Promise<Result<TransactionResult, Error>> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info('Retrying transaction', { attempt });
        }
        
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            ...options,
          }
        );
        
        logger.info('Transaction submitted', { signature });
        
        // Wait for confirmation
        const confirmation = await this.confirmTransaction(signature);
        
        if (!confirmation.ok) {
          lastError = confirmation.error;
          continue;
        }
        
        return success({
          signature,
          status: 'confirmed',
          slot: confirmation.value.slot,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('Transaction attempt failed', {
          attempt,
          error: lastError.message,
        });
        
        // Don't retry certain errors
        if (this.isNonRetryableError(lastError)) {
          break;
        }
        
        // Wait before retry (exponential backoff: 1s, 2s, 4s, 8s...)
        if (attempt < this.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 16_000);
          await this.sleep(backoffMs);
        }
      }
    }
    
    logger.error('Transaction failed after all retries', {
      error: lastError?.message,
    });
    
    return failure(lastError ?? new Error('Transaction failed'));
  }

  /**
   * Confirm a transaction
   */
  private async confirmTransaction(
    signature: TransactionSignature
  ): Promise<Result<{ slot: number }, Error>> {
    try {
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
        return failure(new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`));
      }
      
      logger.info('Transaction confirmed', {
        signature,
        slot: confirmation.context.slot,
      });
      
      return success({ slot: confirmation.context.slot });
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get recent blockhash and lastValidBlockHeight for transaction building.
   * The overloaded signature preserves backward compatibility.
   */
  async getRecentBlockhash(): Promise<Result<string, Error>>;
  async getRecentBlockhash(full: true): Promise<Result<{ blockhash: string; lastValidBlockHeight: number }, Error>>;
  async getRecentBlockhash(full?: true): Promise<Result<string | { blockhash: string; lastValidBlockHeight: number }, Error>> {
    try {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      if (full) {
        return success({ blockhash, lastValidBlockHeight });
      }
      return success(blockhash);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get minimum balance for rent exemption
   */
  async getMinimumBalanceForRentExemption(dataSize: number): Promise<Result<number, Error>> {
    try {
      const lamports = await this.connection.getMinimumBalanceForRentExemption(dataSize);
      return success(lamports);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch the decimals for an SPL token mint.
   * Falls back to 9 if the mint account can't be read.
   */
  async getMintDecimals(mint: PublicKey): Promise<number> {
    try {
      const info = await this.connection.getParsedAccountInfo(mint);
      const data = info?.value?.data;
      if (data && typeof data === 'object' && 'parsed' in data) {
        const decimals = data.parsed?.info?.decimals;
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
    transaction: import('@solana/web3.js').Transaction | import('@solana/web3.js').VersionedTransaction,
  ): Promise<Result<true, Error>> {
    try {
      let result;
      if ('version' in transaction) {
        result = await this.connection.simulateTransaction(transaction);
      } else {
        result = await this.connection.simulateTransaction(transaction);
      }
      if (result.value.err) {
        return failure(new Error(`Simulation failed: ${JSON.stringify(result.value.err)}`));
      }
      return success(true);
    } catch (error) {
      return failure(error instanceof Error ? error : new Error(String(error)));
    }
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

// Singleton instance
let solanaClientInstance: SolanaClient | null = null;

export function getSolanaClient(): SolanaClient {
  if (!solanaClientInstance) {
    solanaClientInstance = new SolanaClient();
  }
  return solanaClientInstance;
}
