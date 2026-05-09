/**
 * BYOA Registry Tests
 *
 * Validates the agent registry's registration, authentication,
 * and token rotation flows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── AgentRegistry tests (mocked persistence) ──────────────────────

vi.mock('../src/utils/store.js', () => ({
  saveState: vi.fn(),
  loadState: vi.fn().mockReturnValue(null),
}));

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

import { AgentRegistry } from '../src/integration/agentRegistry.js';
import { IntentRouter } from '../src/integration/intentRouter.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe('register', () => {
    it('returns an agent ID and control token', () => {
      const result = registry.register({
        agentName: 'test-bot',
        agentType: 'local',
        supportedIntents: ['REQUEST_AIRDROP', 'TRANSFER_SOL'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.agentId).toBeTruthy();
      expect(result.value.controlToken).toHaveLength(64); // 32 bytes hex
    });

    it('rejects empty agent name', () => {
      const result = registry.register({
        agentName: '',
        agentType: 'local',
        supportedIntents: ['REQUEST_AIRDROP'],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects remote agents without endpoint', () => {
      const result = registry.register({
        agentName: 'remote-bot',
        agentType: 'remote',
        supportedIntents: ['TRANSFER_SOL'],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('authenticateToken', () => {
    it('authenticates with the returned token', () => {
      const regResult = registry.register({
        agentName: 'auth-test',
        agentType: 'local',
        supportedIntents: ['QUERY_BALANCE'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      const authResult = registry.authenticateToken(regResult.value.controlToken);
      expect(authResult.ok).toBe(true);
      if (!authResult.ok) return;
      expect(authResult.value.id).toBe(regResult.value.agentId);
    });

    it('rejects an invalid token', () => {
      const result = registry.authenticateToken('invalid-token-string');
      expect(result.ok).toBe(false);
    });
  });

  describe('rotateToken', () => {
    it('issues a new token that authenticates', () => {
      const regResult = registry.register({
        agentName: 'rotate-test',
        agentType: 'local',
        supportedIntents: ['TRANSFER_SOL'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      const oldToken = regResult.value.controlToken;
      const rotateResult = registry.rotateToken(regResult.value.agentId);
      expect(rotateResult.ok).toBe(true);
      if (!rotateResult.ok) return;

      const newToken = rotateResult.value;
      expect(newToken).not.toBe(oldToken);

      // Old token should no longer work
      const oldAuth = registry.authenticateToken(oldToken);
      expect(oldAuth.ok).toBe(false);

      // New token should work
      const newAuth = registry.authenticateToken(newToken);
      expect(newAuth.ok).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('revoke prevents authentication', () => {
      const regResult = registry.register({
        agentName: 'revoke-test',
        agentType: 'local',
        supportedIntents: ['TRANSFER_SOL'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      registry.revokeAgent(regResult.value.agentId);

      const authResult = registry.authenticateToken(regResult.value.controlToken);
      expect(authResult.ok).toBe(false);
    });

    it('deactivate → activate round-trip', () => {
      const regResult = registry.register({
        agentName: 'lifecycle-test',
        agentType: 'local',
        supportedIntents: ['QUERY_BALANCE'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      const agentId = regResult.value.agentId;
      expect(registry.deactivateAgent(agentId).ok).toBe(true);

      const info = registry.getAgent(agentId);
      expect(info.ok).toBe(true);
      if (info.ok) expect(info.value.status).toBe('inactive');
    });
  });

  describe('verification', () => {
    it('sets and verifies a challenge response', () => {
      const regResult = registry.register({
        agentName: 'verify-test',
        agentType: 'local',
        supportedIntents: ['AUTONOMOUS'],
        verificationMethods: ['challenge-response'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      const challenge = 'challenge-abc123';
      const setResult = registry.setChallenge(regResult.value.agentId, challenge);
      expect(setResult.ok).toBe(true);

      const verifyResult = registry.verifyChallengeResponse(regResult.value.agentId, challenge);
      expect(verifyResult.ok).toBe(true);

      const infoResult = registry.getAgent(regResult.value.agentId);
      expect(infoResult.ok).toBe(true);
      if (!infoResult.ok) return;
      expect(infoResult.value.challengeVerified).toBe(true);
    });

    it('rejects an invalid challenge response', () => {
      const regResult = registry.register({
        agentName: 'verify-fail-test',
        agentType: 'local',
        supportedIntents: ['AUTONOMOUS'],
        verificationMethods: ['challenge-response'],
      });
      expect(regResult.ok).toBe(true);
      if (!regResult.ok) return;

      const setResult = registry.setChallenge(regResult.value.agentId, 'expected');
      expect(setResult.ok).toBe(true);

      const verifyResult = registry.verifyChallengeResponse(regResult.value.agentId, 'wrong');
      expect(verifyResult.ok).toBe(false);
      expect(verifyResult.error?.message).toMatch(/does not match/i);
    });

    it('blocks intent submission for unverified challenge-response agents', async () => {
      const router = new IntentRouter();
      const rejectSpy = vi.spyOn(router as any, 'reject');

      const fakeAgent = {
        id: 'agent-verify-block',
        name: 'verify-block',
        type: 'local',
        supportedIntents: ['AUTONOMOUS'],
        status: 'active',
        walletId: 'wallet-1',
        walletPublicKey: '11111111111111111111111111111111',
        controlTokenHash: 'hash',
        createdAt: new Date(),
        verificationMethods: ['challenge-response'],
        challengeVerified: false,
      } as any;

      (router as any).registry = {
        authenticateToken: vi.fn().mockReturnValue({ ok: true, value: fakeAgent }),
      };

      const result = await router.submitIntent('token', {
        type: 'AUTONOMOUS',
        params: { action: 'execute_instructions', instructions: [] },
      });

      expect(result.ok).toBe(true);
      expect(rejectSpy).toHaveBeenCalled();
      if (!result.ok) return;
      expect(result.value.status).toBe('rejected');
      expect(result.value.error).toMatch(/verification required/i);
    });
  });
});
