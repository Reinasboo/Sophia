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

/**
 * NOTE: Old agent factory tests (accumulator, distributor, balance_guard, scheduled_payer)
 * have been removed as these agents are deprecated in favor of the realistic DeFi strategies.
 * See Strategy Registry tests below for current strategy-based agent creation tests.
 */

describe('Strategy Registry', () => {
  it('has 8 realistic DeFi strategies registered', () => {
    const registry = getStrategyRegistry();
    const all = registry.getAllDTOs();
    const builtIn = all.filter((s) => s.builtIn);
    expect(builtIn.length).toBe(8);
    // Verify the realistic strategies are present
    const names = builtIn.map((s) => s.name).sort();
    expect(names).toContain('dca');
    expect(names).toContain('grid_trading');
    expect(names).toContain('momentum_trading');
    expect(names).toContain('arbitrage');
    expect(names).toContain('stop_loss_guard');
    expect(names).toContain('yield_harvesting');
    expect(names).toContain('portfolio_rebalancer');
    expect(names).toContain('airdrop_farmer');
  });

  it('validates DCA params', () => {
    const registry = getStrategyRegistry();
    const result = registry.validateParams('dca', {
      buyAmount: 100,
      buyToken: 'USDC',
      targetToken: 'SOL',
      swapDex: 'jupiter',
      maxSlippage: 0.5,
      frequencyHours: 24,
      maxBuysPerDay: 2,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invalid DCA params', () => {
    const registry = getStrategyRegistry();
    const result = registry.validateParams('dca', {
      buyAmount: -100, // invalid: negative amount
      buyToken: 'USDC',
    });
    expect(result.ok).toBe(false);
  });

  it('returns strategy definitions with field descriptors for DCA', () => {
    const registry = getStrategyRegistry();
    const dca = registry.getDTO('dca');
    expect(dca).toBeDefined();
    expect(dca!.fields.length).toBeGreaterThan(0);
    expect(dca!.fields[0].key).toBeTruthy();
    expect(dca!.fields[0].type).toBeTruthy();
    // Verify DCA specific fields
    const fieldKeys = dca!.fields.map((f) => f.key);
    expect(fieldKeys).toContain('buyAmount');
    expect(fieldKeys).toContain('buyToken');
    expect(fieldKeys).toContain('targetToken');
  });
});
