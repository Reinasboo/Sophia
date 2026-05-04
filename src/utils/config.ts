/**
 * Configuration management
 * Loads and validates environment configuration
 */

import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

const ConfigSchema = z.object({
  // Solana
  SOLANA_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  SOLANA_NETWORK: z.enum(['devnet', 'testnet', 'mainnet-beta']).default('devnet'),
  DATABASE_URL: z.string().url().optional(),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(3002),

  // Security
  KEY_ENCRYPTION_SECRET: z.string().min(16).default('dev-secret-change-in-production'),
  ADMIN_API_KEY: z.string().min(8).default('dev-admin-key-change-in-production'),
  HELIUS_WEBHOOK_SECRET: z.string().min(16).optional(),

  // CORS
  CORS_ORIGINS: z.string().default(''),

  // Agent
  MAX_AGENTS: z.coerce.number().int().positive().default(20),
  AGENT_LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  // Transaction
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  CONFIRMATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Privy (Optional - for enterprise wallet infrastructure)
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_SECRET_KEY: z.string().optional(),
  PRIVY_JWKS_URL: z.string().url().optional(),
  PRIVY_PUBLIC_KEY_PEM: z.string().optional(),
  PRIVY_ISSUER: z.string().default('privy.io'),
  // GMGN integration (optional)
  GMGN_ENABLED: z.enum(['true', 'false']).default('false'),
  GMGN_CLI_PATH: z.string().optional(),
  GMGN_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  GMGN_DEFAULT_TENANT: z.string().default('__global__'),
  // If true, create pending `swap` intents from GMGN signals (does NOT auto-execute)
  GMGN_CREATE_INTENTS: z.enum(['true', 'false']).default('false'),
  GMGN_INTENT_AGENT_ID: z.string().default('gmgn-signal-agent'),
});

export type Config = z.infer<typeof ConfigSchema>;

let cachedConfig: Config | null = null;

/**
 * Get validated configuration
 * Throws if configuration is invalid
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = ConfigSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
  }

  // Warn if using default encryption secret
  if (result.data.KEY_ENCRYPTION_SECRET === 'dev-secret-change-in-production') {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        'CRITICAL: Using default KEY_ENCRYPTION_SECRET in production. ' +
          'Set a strong, unique KEY_ENCRYPTION_SECRET environment variable.'
      );
    }
    console.warn(
      '⚠ WARNING: Using default KEY_ENCRYPTION_SECRET. ' +
        'Set a strong, unique value for any non-local deployment.'
    );
  }

  // Warn if using default admin key
  if (result.data.ADMIN_API_KEY === 'dev-admin-key-change-in-production') {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        'CRITICAL: Using default ADMIN_API_KEY in production. ' +
          'Generate a strong key: openssl rand -hex 32'
      );
    }
    console.warn(
      '⚠ WARNING: Using default ADMIN_API_KEY. ' +
        'Set a strong, unique value for any non-local deployment.'
    );
  }

  if (process.env['NODE_ENV'] === 'production' && !result.data.HELIUS_WEBHOOK_SECRET) {
    throw new Error('CRITICAL: HELIUS_WEBHOOK_SECRET must be set in production to verify Helius webhook signatures.');
  }

  if (process.env['NODE_ENV'] === 'production' && !result.data.DATABASE_URL) {
    throw new Error('CRITICAL: DATABASE_URL must be set in production for persistent indexing and audit trails.');
  }

  // Enforce mainnet readiness in production
  if (process.env['NODE_ENV'] === 'production') {
    // Network must be mainnet-beta
    if (result.data.SOLANA_NETWORK !== 'mainnet-beta') {
      throw new Error(
        'CRITICAL: SOLANA_NETWORK must be set to "mainnet-beta" in production. Set SOLANA_NETWORK=mainnet-beta'
      );
    }

    // Disallow known devnet RPC defaults in production
    const rpc = result.data.SOLANA_RPC_URL || '';
    const devnetIndicators = ['devnet', 'api.devnet.solana.com', 'devnet.solana.com'];
    for (const marker of devnetIndicators) {
      if (rpc.includes(marker)) {
        throw new Error(
          `CRITICAL: SOLANA_RPC_URL contains devnet (${marker}). Use a mainnet RPC provider URL in production.`
        );
      }
    }
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env['NODE_ENV'] !== 'production';
}

// ── Fee constants ───────────────────────────────────────────
// Solana base fee is 5000 lamports (0.000005 SOL) per signature.
// For pre-decision balance checks we use a generous headroom so
// agents never undershoot when priority fees or rent are involved.

/** Estimated SOL fee for a simple transfer (single signature). */
export const ESTIMATED_SOL_TRANSFER_FEE = 0.00001;

/** Estimated SOL fee for a token transfer (may create ATA + priority). */
export const ESTIMATED_TOKEN_TRANSFER_FEE = 0.01;

/**
 * Get the Solana explorer URL for a transaction
 */
export function getExplorerUrl(signature: string): string {
  const config = getConfig();
  const cluster =
    config.SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${config.SOLANA_NETWORK}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
