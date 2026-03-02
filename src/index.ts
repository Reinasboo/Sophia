/**
 * Agentic Wallet System - Main Entry Point
 * 
 * Starts the API server and initializes the system.
 */

import { startServer } from './server.js';
import { createLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { getOrchestrator } from './orchestrator/index.js';

const logger = createLogger('MAIN');

// ── BigInt JSON serializer ──────────────────────────────────────────
// Prevents "TypeError: Do not know how to serialize a BigInt" when
// BalanceInfo.lamports or TokenBalance.amount reach JSON.stringify().
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Catch unhandled rejections to prevent silent crashes
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: String(error) });
  process.exit(1);
});

/**
 * Redact potential API keys from URLs for safe logging.
 * Strips query params and replaces path segments that look like tokens.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    // Mask long path segments that look like API keys
    u.pathname = u.pathname.replace(/\/[A-Za-z0-9_-]{20,}/g, '/***');
    return u.toString();
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}

async function main(): Promise<void> {
  try {
    const config = getConfig();
    
    logger.info('Starting Agentic Wallet System', {
      network: config.SOLANA_NETWORK,
      rpcUrl: redactUrl(config.SOLANA_RPC_URL),
    });
    
    startServer();
    
    // Restore persisted agents (wallets and BYOA records are loaded in their
    // respective constructors; agents need an explicit call because startup
    // auto-starts timers that cannot run from a constructor).
    getOrchestrator().restoreFromStore();
    
    logger.info('System started successfully');
    logger.info(`API available at http://localhost:${config.PORT}`);
    logger.info(`WebSocket available at ws://localhost:${config.WS_PORT}`);
  } catch (error) {
    logger.error('Failed to start system', { error: String(error) });
    process.exit(1);
  }
}

main();
