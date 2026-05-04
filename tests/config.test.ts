/**
 * Configuration tests
 *
 * Validates production-only safety gates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('config validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('requires DATABASE_URL in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
    process.env.SOLANA_NETWORK = 'mainnet-beta';
    process.env.KEY_ENCRYPTION_SECRET = 'production-secret-value-12345';
    process.env.ADMIN_API_KEY = 'production-admin-key-12345';
    process.env.HELIUS_WEBHOOK_SECRET = 'production-helius-webhook-secret';
    delete process.env.DATABASE_URL;

    const module = await import('../src/utils/config.js');
    expect(() => module.getConfig()).toThrow(/DATABASE_URL must be set in production/);
  });
});