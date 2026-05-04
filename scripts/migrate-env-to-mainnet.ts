import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'dotenv';

function normalizeForMainnet(env: Record<string, string>): Record<string, string> {
  const out = { ...env };

  out['NODE_ENV'] = 'production';
  out['SOLANA_NETWORK'] = 'mainnet-beta';

  const rpc = out['SOLANA_RPC_URL'] ?? '';
  if (!rpc || rpc.includes('devnet') || rpc.includes('localhost') || rpc.includes('127.0.0.1')) {
    out['SOLANA_RPC_URL'] = 'https://your-mainnet-rpc-provider';
  }

  if (!out['DATABASE_URL']) {
    out['DATABASE_URL'] = 'postgres://user:password@host:5432/database';
  }

  if (!out['HELIUS_WEBHOOK_SECRET']) {
    out['HELIUS_WEBHOOK_SECRET'] = 'replace-with-strong-webhook-secret';
  }

  if (!out['KEY_ENCRYPTION_SECRET'] || out['KEY_ENCRYPTION_SECRET'] === 'dev-secret-change-in-production') {
    out['KEY_ENCRYPTION_SECRET'] = 'replace-with-strong-32-byte-secret';
  }

  if (!out['ADMIN_API_KEY'] || out['ADMIN_API_KEY'] === 'dev-admin-key-change-in-production') {
    out['ADMIN_API_KEY'] = 'replace-with-strong-admin-key';
  }

  return out;
}

function serializeEnv(env: Record<string, string>): string {
  const keys = Object.keys(env).sort();
  return keys.map((k) => `${k}=${env[k]}`).join('\n') + '\n';
}

function main(): void {
  const root = process.cwd();
  const source = join(root, '.env');
  const target = join(root, '.env.mainnet');

  let parsed: Record<string, string> = {};
  if (existsSync(source)) {
    parsed = parse(readFileSync(source));
    console.log(`Loaded source env: ${source}`);
  } else {
    console.warn('No .env file found. Generating .env.mainnet template from defaults.');
  }

  const normalized = normalizeForMainnet(parsed);
  writeFileSync(target, serializeEnv(normalized), 'utf8');

  console.log(`Wrote mainnet env template: ${target}`);
  console.log('Review and replace placeholder values before deployment.');
}

main();
