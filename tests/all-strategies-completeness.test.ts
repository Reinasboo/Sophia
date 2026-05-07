/**
 * All 11 Strategies - Completeness Verification
 *
 * This test verifies that all 11 built-in strategies are:
 * 1. Registered in the strategy registry
 * 2. Have complete default parameters
 * 3. Can be instantiated via the factory
 * 4. Have proper metadata (risk tiers, guardrails, etc.)
 */

import { describe, it, expect } from 'vitest';
import { createAgent } from '../src/agent/index.js';
import { getStrategyRegistry } from '../src/agent/strategy-registry.js';

const EXPECTED_STRATEGIES = [
  'scalping_trading',
  'breakout_trading',
  'mean_reversion_trading',
  'dca',
  'grid_trading',
  'momentum_trading',
  'arbitrage',
  'stop_loss_guard',
  'yield_harvesting',
  'portfolio_rebalancer',
  'airdrop_farmer',
];

describe('All 11 Mainnet Strategies - Completeness', () => {
  it('all 11 strategies are registered in the registry', () => {
    const registry = getStrategyRegistry();
    const registeredStrategies = registry.list();

    EXPECTED_STRATEGIES.forEach((strategyName) => {
      expect(registeredStrategies).toContain(
        strategyName,
        `Strategy "${strategyName}" should be registered`
      );
    });

    expect(registeredStrategies.length).toBe(EXPECTED_STRATEGIES.length);
  });

  it('each strategy has complete metadata', () => {
    const registry = getStrategyRegistry();

    EXPECTED_STRATEGIES.forEach((strategyName) => {
      const def = registry.get(strategyName);
      expect(def).toBeDefined(`Strategy "${strategyName}" should exist`);
      expect(def?.name).toBe(strategyName);
      expect(def?.label).toBeTruthy();
      expect(def?.description).toBeTruthy();
      expect(def?.defaultParams).toBeTruthy();
      expect(def?.paramSchema).toBeTruthy();
      expect(def?.supportedIntents.length).toBeGreaterThan(0);
      expect(def?.riskTier).toMatch(/^(degen|high|medium|low)$/);
      expect(def?.profitObjective).toBeTruthy();
      expect(def?.guardrails.length).toBeGreaterThan(0);
    });
  });

  it('each strategy can be created via the factory with default params', () => {
    const registry = getStrategyRegistry();
    const mockWalletId = 'test-wallet';
    const mockPublicKey = '11111111111111111111111111111111';

    EXPECTED_STRATEGIES.forEach((strategyName) => {
      const def = registry.get(strategyName);
      expect(def).toBeDefined();

      const result = createAgent({
        config: {
          name: `test-${strategyName}`,
          strategy: strategyName,
          strategyParams: def!.defaultParams,
        },
        walletId: mockWalletId,
        walletPublicKey: mockPublicKey,
      });

      expect(result.ok).toBe(true, `Factory should create ${strategyName} agent successfully`);
      if (result.ok) {
        expect(result.value.name).toBe(`test-${strategyName}`);
        expect(result.value.strategy).toBe(strategyName);
      }
    });
  });

  it('strategies are properly ordered by risk tier (degen → low)', () => {
    const registry = getStrategyRegistry();
    const allDTOs = registry.getAllDTOs();

    const riskOrder = { degen: 0, high: 1, medium: 2, low: 3 };
    for (let i = 0; i < allDTOs.length - 1; i++) {
      const current = riskOrder[allDTOs[i]?.riskTier];
      const next = riskOrder[allDTOs[i + 1]?.riskTier];
      expect(current).toBeLessThanOrEqual(next);
    }
  });

  it('each strategy has valid supported intents', () => {
    const registry = getStrategyRegistry();
    const validIntents = new Set([
      'swap',
      'harvest_yield',
      'transfer_sol',
      'transfer_token',
      'stake_sol',
      'unstake_sol',
      'REQUEST_AIRDROP',
      'AUTONOMOUS',
    ]);

    EXPECTED_STRATEGIES.forEach((strategyName) => {
      const def = registry.get(strategyName);
      def?.supportedIntents.forEach((intent) => {
        expect(validIntents.has(intent)).toBe(
          true,
          `Intent "${intent}" should be valid for ${strategyName}`
        );
      });
    });
  });

  it('all 11 strategies are marked as built-in', () => {
    const registry = getStrategyRegistry();

    EXPECTED_STRATEGIES.forEach((strategyName) => {
      const def = registry.get(strategyName);
      expect(def?.builtIn).toBe(true, `${strategyName} should be marked as built-in`);
    });
  });

  it('summary: all 11 strategies are production-ready', () => {
    const registry = getStrategyRegistry();
    const allDTOs = registry.getAllDTOs();
    const builtIn = allDTOs.filter((s) => s.builtIn);

    console.log('\n📊 STRATEGY COMPLETENESS REPORT:');
    console.log('================================\n');
    console.log(`Total strategies: ${allDTOs.length}`);
    console.log(`Built-in strategies: ${builtIn.length}`);
    console.log('\nStrategy Inventory:');
    builtIn.forEach((strategy) => {
      console.log(
        `  ✓ ${strategy.name.padEnd(25)} [${strategy.riskTier.padEnd(6)}] ${strategy.label}`
      );
    });
    console.log('\n' + '='.repeat(70) + '\n');

    expect(builtIn.length).toBe(11);
  });
});
