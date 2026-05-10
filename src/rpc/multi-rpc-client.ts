/**
 * Multi-RPC Failover Client
 *
 * Rotates between multiple Solana RPC endpoints to:
 * 1. Avoid single-provider rate limiting
 * 2. Distribute load across providers
 * 3. Automatically failover if one provider is down/rate-limited
 *
 * Configuration: Set comma-separated RPC URLs in SOLANA_RPC_URLS environment variable
 * Example: "https://api.mainnet-beta.solana.com,https://solana-mainnet.g.alchemy.com/v2/KEY,..."
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MULTI_RPC');

interface RpcEndpoint {
  url: string;
  successCount: number;
  failureCount: number;
  lastError?: string;
  isHealthy: boolean;
}

export class MultiRpcClient {
  private endpoints: RpcEndpoint[] = [];
  private connections: Map<string, Connection> = new Map();
  private currentIndex = 0;

  constructor(rpcUrls?: string[]) {
    // Parse RPC URLs from environment or parameter
    const envUrls = process.env['SOLANA_RPC_URLS'] || process.env['SOLANA_RPC_URL'] || '';
    const urls = rpcUrls || envUrls.split(',').filter(Boolean);

    if (!urls.length) {
      throw new Error(
        'No Solana RPC URLs configured. Set SOLANA_RPC_URLS env var with comma-separated URLs.'
      );
    }

    this.endpoints = urls.map((url) => ({
      url: url.trim(),
      successCount: 0,
      failureCount: 0,
      isHealthy: true,
    }));

    logger.info('Multi-RPC client initialized', {
      endpointCount: this.endpoints.length,
      endpoints: this.endpoints.map((e) => ({
        url: e.url.substring(0, 50) + '...',
        healthy: e.isHealthy,
      })),
    });
  }

  /**
   * Get next healthy endpoint (round-robin with failover)
   */
  private getHealthyEndpoint(): RpcEndpoint {
    if (this.endpoints.length === 0) {
      throw new Error('No RPC endpoints configured');
    }

    // Try to find a healthy endpoint starting from current index
    for (let i = 0; i < this.endpoints.length; i++) {
      const index = (this.currentIndex + i) % this.endpoints.length;
      const endpoint = this.endpoints[index];

      if (endpoint && endpoint.isHealthy) {
        this.currentIndex = (index + 1) % this.endpoints.length;
        return endpoint;
      }
    }

    // All unhealthy, use least-failed one
    let best: RpcEndpoint | null = null;
    for (const endpoint of this.endpoints) {
      if (!best || endpoint.failureCount < best.failureCount) {
        best = endpoint;
      }
    }

    if (!best) {
      best = this.endpoints[0]!;
    }

    logger.warn('All RPC endpoints unhealthy, using least-failed', {
      endpoint: best.url.substring(0, 50),
      failures: best.failureCount,
    });

    return best;
  }

  /**
   * Get or create connection for endpoint
   */
  private getConnection(endpoint: RpcEndpoint): Connection {
    if (!this.connections.has(endpoint.url)) {
      const conn = new Connection(endpoint.url, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30000,
      });
      this.connections.set(endpoint.url, conn);
    }
    const conn = this.connections.get(endpoint.url);
    if (!conn) {
      throw new Error(`Failed to get connection for ${endpoint.url}`);
    }
    return conn;
  }

  /**
   * Execute RPC call with automatic failover
   */
  async execute<T>(
    operation: (connection: Connection) => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const endpoint = this.getHealthyEndpoint();
      const connection = this.getConnection(endpoint);

      try {
        const result = await operation(connection);

        // Mark as healthy and increment success
        endpoint.isHealthy = true;
        endpoint.successCount++;
        endpoint.lastError = undefined;

        const duration = Date.now() - startTime;
        logger.debug(`[RPC] ${operationName} succeeded`, {
          endpoint: endpoint.url.substring(0, 40),
          duration,
          attempt,
        });

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        endpoint.failureCount++;
        endpoint.lastError = errorMsg;
        lastError = error as Error;

        // Mark endpoint as unhealthy if it's rate-limited or down
        if (
          errorMsg.includes('429') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('503') ||
          errorMsg.includes('502')
        ) {
          endpoint.isHealthy = false;
          logger.warn(`[RPC] Endpoint rate-limited/down, marking unhealthy`, {
            endpoint: endpoint.url.substring(0, 40),
            error: errorMsg,
            failureCount: endpoint.failureCount,
          });
        }

        logger.warn(`[RPC] ${operationName} failed on endpoint`, {
          endpoint: endpoint.url.substring(0, 40),
          error: errorMsg,
          attempt: attempt + 1,
          total: this.endpoints.length,
        });

        // If this was the last endpoint, throw
        if (attempt === this.endpoints.length - 1) {
          throw new Error(
            `RPC operation '${operationName}' failed on all ${this.endpoints.length} endpoints: ${lastError?.message}`
          );
        }

        // Otherwise, retry with next endpoint
        continue;
      }
    }

    throw lastError || new Error(`${operationName} failed on all RPC endpoints`);
  }

  /**
   * Get account balance
   */
  async getBalance(publicKey: PublicKey): Promise<number> {
    return this.execute(
      (conn) => conn.getBalance(publicKey),
      `getBalance(${publicKey.toBase58().substring(0, 8)}...)`
    );
  }

  /**
   * Get token balance
   */
  async getTokenBalances(owner: PublicKey, _mint?: PublicKey): Promise<unknown> {
    return this.execute(
      (conn) =>
        conn.getTokenAccountsByOwner(owner, {
          programId: new PublicKey('TokenkegQfeZyiNwAJsyFbPVwwQQnmLYEMud6pNvitLSg'),
        }),
      `getTokenBalances(${owner.toBase58().substring(0, 8)}...)`
    );
  }

  /**
   * Get account info
   */
  async getAccountInfo(publicKey: PublicKey): Promise<unknown> {
    return this.execute(
      (conn) => conn.getAccountInfo(publicKey),
      `getAccountInfo(${publicKey.toBase58().substring(0, 8)}...)`
    );
  }

  /**
   * Send transaction
   */
  async sendTransaction(tx: unknown): Promise<string> {
    return this.execute(
      (conn) => conn.sendRawTransaction(tx as Buffer | Uint8Array),
      'sendTransaction'
    );
  }

  /**
   * Get transaction details
   */
  async getTransaction(signature: string): Promise<unknown> {
    return this.execute(
      (conn) => conn.getTransaction(signature),
      `getTransaction(${signature.substring(0, 8)}...)`
    );
  }

  /**
   * Get endpoint health stats
   */
  getHealthStats() {
    return this.endpoints.map((ep) => ({
      url: ep.url.substring(0, 50) + '...',
      healthy: ep.isHealthy,
      successCount: ep.successCount,
      failureCount: ep.failureCount,
      successRate:
        ep.successCount + ep.failureCount > 0
          ? ((ep.successCount / (ep.successCount + ep.failureCount)) * 100).toFixed(1) + '%'
          : 'N/A',
      lastError: ep.lastError,
    }));
  }
}

// Singleton instance
let multiRpcClient: MultiRpcClient | null = null;

export function getMultiRpcClient(): MultiRpcClient {
  if (!multiRpcClient) {
    multiRpcClient = new MultiRpcClient();
  }
  return multiRpcClient;
}

export default MultiRpcClient;
