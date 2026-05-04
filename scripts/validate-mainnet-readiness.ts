import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../src/utils/config.js';

type SavedAgent = {
  id: string;
  name: string;
  strategy: string;
};

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function warn(message: string): void {
  console.warn(`WARN: ${message}`);
}

function pass(message: string): void {
  console.log(`PASS: ${message}`);
}

function checkStoredAgentsForDevnetStrategies(): void {
  const agentsPath = join(process.cwd(), 'data', 'agents.json');
  if (!existsSync(agentsPath)) {
    pass('No persisted agents found (data/agents.json).');
    return;
  }

  const raw = readFileSync(agentsPath, 'utf8');
  const normalized = raw.replace(/^\uFEFF/, '').trim();
  const parsed = JSON.parse(normalized) as SavedAgent[];
  const blocked = new Set(['accumulator', 'balance_guard']);
  const legacy = parsed.filter((a) => blocked.has(a.strategy));

  if (legacy.length > 0) {
    const names = legacy.map((a) => `${a.id}:${a.strategy}`).join(', ');
    fail(`Persisted agents contain devnet-only strategies. Remove before mainnet start: ${names}`);
  }

  pass('Persisted agents do not include devnet-only strategies.');
}

function run(): void {
  const cfg = getConfig();

  if (process.env['NODE_ENV'] !== 'production') {
    fail('NODE_ENV must be set to production.');
  }
  pass('NODE_ENV=production');

  if (cfg.SOLANA_NETWORK !== 'mainnet-beta') {
    fail('SOLANA_NETWORK must be mainnet-beta.');
  }
  pass('SOLANA_NETWORK=mainnet-beta');

  const rpc = cfg.SOLANA_RPC_URL;
  if (rpc.includes('devnet') || rpc.includes('localhost') || rpc.includes('127.0.0.1')) {
    fail(`SOLANA_RPC_URL must point to mainnet provider. Found: ${rpc}`);
  }
  pass('SOLANA_RPC_URL points to a non-devnet endpoint');

  if (!cfg.DATABASE_URL) {
    fail('DATABASE_URL is required for production.');
  }
  pass('DATABASE_URL is set');

  if (!cfg.HELIUS_WEBHOOK_SECRET) {
    fail('HELIUS_WEBHOOK_SECRET is required for production webhook verification.');
  }
  pass('HELIUS_WEBHOOK_SECRET is set');

  if (cfg.GMGN_ENABLED === 'true') {
    pass('GMGN integration is enabled.');
    if (!cfg.GMGN_CLI_PATH) {
      warn('GMGN_CLI_PATH is not set. Ensure gmgn binary is available on PATH in production.');
    }
  }

  checkStoredAgentsForDevnetStrategies();
  pass('Mainnet readiness checks completed.');
}

run();
