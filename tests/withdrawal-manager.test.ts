/**
 * Withdrawal Manager Tests
 *
 * Covers validation, BYOA protection, rate limiting, execution,
 * and tenant-scoped history behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction } from '@solana/web3.js';

const mocks = vi.hoisted(() => ({
  loggerStub: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  emitMock: vi.fn(),
  saveStateMock: vi.fn(),
  loadStateMock: vi.fn(() => ({ records: [] })),
}));

const localAgent = {
  id: 'agent_local_1',
  name: 'Local Agent',
  type: 'local',
  walletId: 'wallet_local_1',
};

const remoteAgent = {
  id: 'agent_remote_1',
  name: 'Remote Agent',
  type: 'remote',
  walletId: 'wallet_remote_1',
};

vi.mock('../src/utils/logger.js', () => ({
  createLogger: () => mocks.loggerStub,
}));

vi.mock('../src/orchestrator/event-emitter.js', () => ({
  eventBus: {
    emit: mocks.emitMock,
  },
}));

vi.mock('../src/utils/store.js', () => ({
  saveState: mocks.saveStateMock,
  loadState: mocks.loadStateMock,
}));

vi.mock('../src/integration/agentRegistry.js', () => ({
  getAgentRegistry: () => ({
    getAgent: (agentId: string) => {
      if (agentId === 'missing_agent') {
        return { ok: false, error: new Error(`Agent not found: ${agentId}`) };
      }
      if (agentId === 'agent_remote_1') {
        return { ok: true, value: remoteAgent };
      }
      return { ok: true, value: localAgent };
    },
  }),
}));

vi.mock('../src/integration/walletBinder.js', () => ({
  getWalletBinder: () => ({
    // Note: implementation currently checks with agentId.
    getAgentForWallet: (key: string) => (key === 'agent_byoa_lookup' ? 'external-123' : undefined),
  }),
}));

vi.mock('../src/wallet/wallet-manager.js', () => ({
  getWalletManager: () => ({
    getWallet: (walletId: string) => ({
      ok: true,
      value: {
        id: walletId,
        publicKey: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU1111',
      },
    }),
    signTransaction: (_walletId: string, tx: Transaction) => ({
      ok: true,
      value: tx,
    }),
  }),
}));

vi.mock('../src/rpc/index.js', () => ({
  getSolanaClient: () => ({
    getBalance: async () => ({
      ok: true,
      value: {
        lamports: 5_000_000_000,
        sol: 5,
      },
    }),
    getRecentBlockhash: async () => ({
      ok: true,
      value: 'test_recent_blockhash_123',
    }),
    sendTransaction: async () => ({
      ok: true,
      value: {
        signature: 'test_signature_123',
        status: 'confirmed',
        slot: 1,
      },
    }),
  }),
}));

import { WithdrawalManager } from '../src/wallet/withdrawal-manager.js';

describe('WithdrawalManager', () => {
  let manager: WithdrawalManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadStateMock.mockReturnValue({ records: [] });
    manager = new WithdrawalManager();
  });

  it('rejects request when agent does not exist', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'missing_agent',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('not found');
  });

  it('rejects BYOA agents found via binder lookup', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_byoa_lookup',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('external agent');
  });

  it('rejects remote agent type from registry', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_remote_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('External agent');
  });

  it('rejects invalid recipient address', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: 'invalid-recipient',
      amount: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('Invalid recipient');
  });

  it('enforces one withdrawal per agent per 24h', async () => {
    const first = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });
    expect(first.ok).toBe(true);

    const second = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU3333',
      amount: 0.5,
    });

    expect(second.ok).toBe(false);
    expect(second.error?.message).toContain('already withdrawn');
  });

  it('rejects over-withdrawals above balance minus reserve', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('Maximum withdrawable');
  });

  it('defaults amount to full withdrawable when omitted', async () => {
    const result = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
    });

    expect(result.ok).toBe(true);
    expect(result.value?.amountSol).toBe(4.999);
    expect(result.value?.status).toBe('pending');
    expect(mocks.saveStateMock).toHaveBeenCalled();
    expect(mocks.emitMock).toHaveBeenCalled();
  });

  it('executes a pending withdrawal and stores signature', async () => {
    const request = await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });
    expect(request.ok).toBe(true);

    const execute = await manager.executeWithdrawal(request.value!.id);
    expect(execute.ok).toBe(true);
    expect(execute.value?.status).toBe('executed');
    expect(execute.value?.signature).toBe('test_signature_123');
    expect(execute.value?.executedAt).toBeTruthy();
  });

  it('rejects executing unknown withdrawal id', async () => {
    const result = await manager.executeWithdrawal('withdrawal_missing');
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('Withdrawal not found');
  });

  it('returns tenant and agent-scoped history from stored records', async () => {
    await manager.requestWithdrawal({
      tenantId: 'tenant_1',
      agentId: 'agent_local_1',
      recipient: '6VT1RL9LXXJbC2HZXZ9rMY3z8AzV9KzGjNpQrStU2222',
      amount: 1,
    });

    const tenantHistory = manager.getWithdrawalHistory('tenant_1');
    const agentHistory = manager.getAgentWithdrawalHistory('agent_local_1');

    expect(tenantHistory.length).toBe(1);
    expect(agentHistory.length).toBe(1);
    expect(tenantHistory[0]?.agentId).toBe('agent_local_1');
    expect(agentHistory[0]?.tenantId).toBe('tenant_1');
  });
});
