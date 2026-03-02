/**
 * Agent Factory & Strategy Registry Tests
 *
 * Validates agent creation, strategy validation, and the factory's
 * ability to produce each built-in agent type.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/utils/config.js', () => ({
  getConfig: () => ({
    KEY_ENCRYPTION_SECRET: 'test-secret-at-least-16-characters',
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
    SOLANA_NETWORK: 'devnet',
    PORT: 3001,
    WS_PORT: 3002,
    ADMIN_API_KEY: 'test-admin-key-12345678',
    CORS_ORIGINS: '',
    MAX_AGENTS: 20,
    AGENT_LOOP_INTERVAL_MS: 5000,
    MAX_RETRIES: 3,
    CONFIRMATION_TIMEOUT_MS: 30000,
    LOG_LEVEL: 'info',
  }),
  ESTIMATED_SOL_TRANSFER_FEE: 0.00001,
  ESTIMATED_TOKEN_TRANSFER_FEE: 0.01,
}));

import { createAgent } from '../src/agent/index.js';
import { getStrategyRegistry } from '../src/agent/strategy-registry.js';

describe('Agent Factory (createAgent)', () => {
  const walletId = 'wallet_test_001';
  const walletPublicKey = '11111111111111111111111111111111';

  it('creates an accumulator agent with default params', () => {
    const result = createAgent({
      config: { name: 'acc-test', strategy: 'accumulator' },
      walletId,
      walletPublicKey,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy).toBe('accumulator');
    expect(result.value.id).toBeTruthy();
    expect(result.value.getWalletId()).toBe(walletId);
  });

  it('creates a distributor agent', () => {
    const result = createAgent({
      config: {
        name: 'dist-test',
        strategy: 'distributor',
        strategyParams: { recipients: ['11111111111111111111111111111111'] },
      },
      walletId,
      walletPublicKey,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy).toBe('distributor');
  });

  it('creates a balance_guard agent', () => {
    const result = createAgent({
      config: { name: 'bg-test', strategy: 'balance_guard' },
      walletId,
      walletPublicKey,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy).toBe('balance_guard');
  });

  it('creates a scheduled_payer agent', () => {
    const result = createAgent({
      config: {
        name: 'sp-test',
        strategy: 'scheduled_payer',
        strategyParams: { recipient: '11111111111111111111111111111111' },
      },
      walletId,
      walletPublicKey,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategy).toBe('scheduled_payer');
  });

  it('fails for an unknown strategy', () => {
    const result = createAgent({
      config: { name: 'bad', strategy: 'nonexistent_strategy' },
      walletId,
      walletPublicKey,
    });
    expect(result.ok).toBe(false);
  });

  it('preserves idOverride when provided', () => {
    const customId = 'custom-agent-id-12345';
    const result = createAgent({
      config: { name: 'id-test', strategy: 'accumulator' },
      walletId,
      walletPublicKey,
      idOverride: customId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(customId);
  });
});

describe('Strategy Registry', () => {
  it('has 4 built-in strategies registered', () => {
    const registry = getStrategyRegistry();
    const all = registry.getAllDTOs();
    const builtIn = all.filter((s) => s.builtIn);
    expect(builtIn.length).toBe(4);
  });

  it('validates accumulator params', () => {
    const registry = getStrategyRegistry();
    const result = registry.validateParams('accumulator', {
      targetBalance: 2,
      minBalance: 0.5,
      airdropAmount: 1,
      maxAirdropsPerDay: 5,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid accumulator params', () => {
    const registry = getStrategyRegistry();
    const result = registry.validateParams('accumulator', {
      targetBalance: -1, // invalid
      minBalance: 0.5,
    });
    expect(result.ok).toBe(false);
  });

  it('returns strategy definitions with field descriptors', () => {
    const registry = getStrategyRegistry();
    const acc = registry.getDTO('accumulator');
    expect(acc).toBeDefined();
    expect(acc!.fields.length).toBeGreaterThan(0);
    expect(acc!.fields[0].key).toBeTruthy();
    expect(acc!.fields[0].type).toBeTruthy();
  });
});
