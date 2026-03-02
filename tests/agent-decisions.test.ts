/**
 * Agent Decision-Making Tests
 *
 * Validates that each built-in agent strategy makes correct
 * autonomous decisions given various wallet contexts.
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

import { AccumulatorAgent } from '../src/agent/accumulator-agent.js';
import { BalanceGuardAgent } from '../src/agent/balance-guard-agent.js';
import { ScheduledPayerAgent } from '../src/agent/scheduled-payer-agent.js';
import type { AgentContext } from '../src/agent/base-agent.js';

function makeContext(sol: number): AgentContext {
  return {
    walletPublicKey: '11111111111111111111111111111111',
    balance: { sol, lamports: BigInt(Math.round(sol * 1e9)) },
    tokenBalances: [],
    recentTransactions: [],
  };
}

describe('AccumulatorAgent', () => {
  const params = {
    targetBalance: 2,
    minBalance: 0.5,
    airdropAmount: 1,
    maxAirdropsPerDay: 5,
  };

  it('requests airdrop when balance is below minBalance', async () => {
    const agent = new AccumulatorAgent(
      'test-acc', 'wallet_1', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(0.1));
    expect(decision.shouldAct).toBe(true);
    expect(decision.intent?.type).toBe('airdrop');
  });

  it('does not act when balance is above targetBalance', async () => {
    const agent = new AccumulatorAgent(
      'test-acc-ok', 'wallet_2', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(5.0));
    expect(decision.shouldAct).toBe(false);
  });
});

describe('BalanceGuardAgent', () => {
  const params = {
    criticalBalance: 0.05,
    airdropAmount: 1,
    maxAirdropsPerDay: 3,
  };

  it('triggers emergency airdrop when critically low', async () => {
    const agent = new BalanceGuardAgent(
      'test-bg', 'wallet_3', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(0.01));
    expect(decision.shouldAct).toBe(true);
    expect(decision.intent?.type).toBe('airdrop');
  });

  it('stays idle when balance is healthy', async () => {
    const agent = new BalanceGuardAgent(
      'test-bg-ok', 'wallet_4', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(1.0));
    expect(decision.shouldAct).toBe(false);
  });
});

describe('ScheduledPayerAgent', () => {
  // Use a different valid Solana address as recipient (SystemProgram)
  const recipient = 'So11111111111111111111111111111111111111112';
  const params = {
    recipient,
    amount: 0.01,
    maxPaymentsPerDay: 5,
    minBalanceToSend: 0.05,
  };

  it('sends payment when balance supports it', async () => {
    const agent = new ScheduledPayerAgent(
      'test-sp', 'wallet_5', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(1.0));
    expect(decision.shouldAct).toBe(true);
    expect(decision.intent?.type).toBe('transfer_sol');
  });

  it('does not pay when balance is too low', async () => {
    const agent = new ScheduledPayerAgent(
      'test-sp-low', 'wallet_6', '11111111111111111111111111111111', params,
    );
    const decision = await agent.think(makeContext(0.02));
    expect(decision.shouldAct).toBe(false);
  });
});
