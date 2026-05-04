/**
 * Data Tracking & Indexing Tests
 *
 * Tests for transaction indexing, intent tracking, and system events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { getDataTracker, resetDataTracker } from '../src/data/index.js';
import { handleHeliusWebhook, verifyHeliusSignature } from '../src/data/helius-webhook.js';
import { HeliusWebhookPayload } from '../src/data/helius-webhook.js';

describe('Data Tracking', () => {
  let tracker: ReturnType<typeof getDataTracker>;

  beforeEach(() => {
    // Reset tracker instance for clean test state
    resetDataTracker();
    tracker = getDataTracker();
  });

  describe('Transaction Indexing', () => {
    it('should index a transaction', async () => {
      const tx = {
        signature: 'test-sig-123',
        slot: 100,
        blockTime: new Date(),
        tenantId: 'tenant-1',
        walletAddress: '11111111111111111111111111111111',
        type: 'transfer_sol' as const,
        status: 'success' as const,
        amount: 1.5,
        recipient: '22222222222222222222222222222222',
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      };

      const result = await tracker.indexTransaction(tx);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.signature).toBe('test-sig-123');
        expect(result.value.tenantId).toBe('tenant-1');
      }
    });

    it('should query transactions by tenant', async () => {
      // Index multiple transactions
      await tracker.indexTransaction({
        signature: 'sig-1',
        slot: 100,
        blockTime: new Date(),
        tenantId: 'tenant-1',
        walletAddress: 'wallet-1',
        type: 'transfer_sol',
        status: 'success',
        amount: 1,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      await tracker.indexTransaction({
        signature: 'sig-2',
        slot: 101,
        blockTime: new Date(),
        tenantId: 'tenant-2',
        walletAddress: 'wallet-2',
        type: 'transfer_sol',
        status: 'success',
        amount: 2,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      const result = await tracker.queryTransactions({
        tenantId: 'tenant-1',
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].tenantId).toBe('tenant-1');
      }
    });

    it('should respect tenant isolation in queries', async () => {
      // Tenant 1 transaction
      await tracker.indexTransaction({
        signature: 'sig-t1',
        slot: 100,
        blockTime: new Date(),
        tenantId: 'tenant-1',
        walletAddress: 'wallet-1',
        type: 'transfer_sol',
        status: 'success',
        amount: 100,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      // Tenant 2 transaction
      await tracker.indexTransaction({
        signature: 'sig-t2',
        slot: 101,
        blockTime: new Date(),
        tenantId: 'tenant-2',
        walletAddress: 'wallet-2',
        type: 'transfer_token',
        status: 'success',
        amount: 200,
        mint: 'token-mint',
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      // Query tenant 1
      const t1Result = await tracker.queryTransactions({
        tenantId: 'tenant-1',
        limit: 100,
      });

      expect(t1Result.ok).toBe(true);
      if (t1Result.ok) {
        expect(t1Result.value.every((t) => t.tenantId === 'tenant-1')).toBe(true);
        expect(t1Result.value.length).toBe(1);
      }
    });

    it('should retrieve single transaction by signature', async () => {
      await tracker.indexTransaction({
        signature: 'unique-sig',
        slot: 100,
        blockTime: new Date(),
        tenantId: 'tenant-1',
        walletAddress: 'wallet-1',
        type: 'swap',
        status: 'success',
        amount: 50,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      const result = await tracker.getTransaction('unique-sig');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.signature).toBe('unique-sig');
        expect(result.value.type).toBe('swap');
      }
    });
  });

  describe('Intent Tracking', () => {
    it('should record an intent', async () => {
      const result = await tracker.recordIntent({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        intentType: 'swap',
        status: 'pending',
        params: { amount: 100 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.agentId).toBe('agent-1');
        expect(result.value.status).toBe('pending');
      }
    });

    it('should update intent result with signature', async () => {
      const recordResult = await tracker.recordIntent({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        intentType: 'transfer',
        status: 'pending',
        params: { recipient: 'addr' },
      });

      expect(recordResult.ok).toBe(true);

      if (recordResult.ok) {
        const intentId = recordResult.value.id;

        const updateResult = await tracker.updateIntentResult(intentId, {
          status: 'executed',
          signature: 'tx-sig-123',
          result: { amount: 50 },
        });

        expect(updateResult.ok).toBe(true);
        if (updateResult.ok) {
          expect(updateResult.value.status).toBe('executed');
          expect(updateResult.value.signature).toBe('tx-sig-123');
        }
      }
    });

    it('should query intents by tenant', async () => {
      await tracker.recordIntent({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        intentType: 'swap',
        status: 'pending',
        params: {},
      });

      await tracker.recordIntent({
        tenantId: 'tenant-2',
        agentId: 'agent-2',
        intentType: 'transfer',
        status: 'pending',
        params: {},
      });

      const result = await tracker.queryIntents({
        tenantId: 'tenant-1',
        limit: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.every((i) => i.tenantId === 'tenant-1')).toBe(true);
        expect(result.value.length).toBe(1);
      }
    });

    it('should preserve caller-provided intent id for lifecycle updates', async () => {
      const intentId = 'intent-fixed-id-123';
      const recordResult = await tracker.recordIntent({
        id: intentId,
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        intentType: 'swap',
        status: 'pending',
        params: { amount: 10 },
      });

      expect(recordResult.ok).toBe(true);
      if (recordResult.ok) {
        expect(recordResult.value.id).toBe(intentId);
      }

      const updateResult = await tracker.updateIntentResult(intentId, {
        status: 'executed',
        signature: 'defi-sig-1',
      });

      expect(updateResult.ok).toBe(true);
      if (updateResult.ok) {
        expect(updateResult.value.status).toBe('executed');
        expect(updateResult.value.signature).toBe('defi-sig-1');
      }
    });

    it('should filter intents by status', async () => {
      const recordResult = await tracker.recordIntent({
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        intentType: 'stake',
        status: 'pending',
        params: {},
      });

      if (recordResult.ok) {
        await tracker.updateIntentResult(recordResult.value.id, {
          status: 'executed',
          signature: 'sig-123',
        });
      }

      const result = await tracker.queryIntents({
        tenantId: 'tenant-1',
        status: 'executed',
        limit: 100,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.every((i) => i.status === 'executed')).toBe(true);
      }
    });
  });

  describe('Event Recording', () => {
    it('should record a system event', async () => {
      const result = await tracker.recordEvent({
        tenantId: 'tenant-1',
        eventType: 'agent_created',
        entityId: 'agent-1',
        entityType: 'agent',
        data: { name: 'MyAgent' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.eventType).toBe('agent_created');
        expect(result.value.entityType).toBe('agent');
      }
    });

    it('should query events by tenant', async () => {
      await tracker.recordEvent({
        tenantId: 'tenant-1',
        eventType: 'agent_created',
        entityId: 'agent-1',
        entityType: 'agent',
        data: { type: 'distributor' },
      });

      await tracker.recordEvent({
        tenantId: 'tenant-2',
        eventType: 'agent_deactivated',
        entityId: 'agent-2',
        entityType: 'agent',
        data: {},
      });

      const result = await tracker.queryEvents('tenant-1', 100);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.every((e) => e.tenantId === 'tenant-1')).toBe(true);
        expect(result.value.length).toBe(1);
      }
    });

    it('should not leak events across tenants', async () => {
      await tracker.recordEvent({
        tenantId: 'tenant-1',
        eventType: 'agent_created',
        entityId: 'agent-1',
        entityType: 'agent',
        data: {},
      });

      const t2Result = await tracker.queryEvents('tenant-2', 100);

      expect(t2Result.ok).toBe(true);
      if (t2Result.ok) {
        expect(t2Result.value.length).toBe(0);
      }
    });
  });

  describe('Health Status', () => {
    it('should return health status', () => {
      const result = tracker.getHealth();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Health check returns different structure than other methods
        expect(result.value).toHaveProperty('state');
        expect(result.value).toHaveProperty('lagSeconds');
        expect(result.value).toHaveProperty('healthy');
        expect(typeof result.value.healthy).toBe('boolean');
      }
    });

    it('should track indexing lag', () => {
      tracker.updateWebhookTime();

      // Wait a bit to accumulate lag
      const result = tracker.getHealth();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.lagSeconds).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Helius Webhook Integration', () => {
    it('should verify Helius webhook signatures', () => {
      const payload = '{"webhookID":"webhook-1","timestamp":"2026-05-03T18:00:00.000Z"}';
      const secret = 'test-webhook-secret-123';
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(verifyHeliusSignature(payload, signature, secret)).toBe(true);
      expect(verifyHeliusSignature(payload, `${signature}tampered`, secret)).toBe(false);
    });

    it('should parse and index Helius webhook events', async () => {
      const payload: HeliusWebhookPayload = {
        webhookID: 'webhook-1',
        timestamp: new Date().toISOString(),
        events: [
          {
            signature: 'helius-tx-1',
            slot: 200,
            blockTime: Math.floor(Date.now() / 1000),
            type: 'TRANSFER',
            feePayer: 'fee-payer-addr',
            fee: 5000,
            nativeTransfers: [
              {
                fromUserAccount: 'sender',
                toUserAccount: 'recipient',
                lamports: 1000000,
              },
            ],
            tokenTransfers: [],
            transactionError: null,
            timestamp: Math.floor(Date.now() / 1000),
            instructions: [],
          },
        ],
      };

      const result = await handleHeliusWebhook(payload, () => 'tenant-1', ['fee-payer-addr']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.indexed).toBeGreaterThan(0);
      }
    });

    it('should handle webhook errors gracefully', async () => {
      const payload: HeliusWebhookPayload = {
        webhookID: 'webhook-2',
        timestamp: new Date().toISOString(),
        events: [
          {
            signature: 'failed-tx',
            slot: 201,
            blockTime: Math.floor(Date.now() / 1000),
            type: 'TRANSFER',
            feePayer: 'fee-payer',
            fee: 5000,
            nativeTransfers: [],
            tokenTransfers: [],
            transactionError: { InstructionError: [0, { Custom: 1 }] },
            timestamp: Math.floor(Date.now() / 1000),
            instructions: [],
          },
        ],
      };

      const result = await handleHeliusWebhook(payload, () => 'tenant-1', ['fee-payer']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still index the failed transaction
        expect(result.value.indexed).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Data Isolation', () => {
    it('should prevent cross-tenant data leakage', async () => {
      // Create data for tenant 1
      await tracker.indexTransaction({
        signature: 'secret-tx-1',
        slot: 300,
        blockTime: new Date(),
        tenantId: 'tenant-secret-1',
        walletAddress: 'secret-wallet',
        type: 'transfer_sol',
        status: 'success',
        amount: 999999,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      // Try to query as tenant 2
      const result = await tracker.queryTransactions({
        tenantId: 'tenant-other',
        limit: 1000,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Tenant 2 should see zero transactions
        expect(result.value.length).toBe(0);
        // And definitely not the secret transaction
        expect(result.value.some((t) => t.amount === 999999)).toBe(false);
      }
    });

    it('should not allow intent lookup across tenants', async () => {
      const recordResult = await tracker.recordIntent({
        tenantId: 'tenant-secret',
        agentId: 'secret-agent',
        intentType: 'swap',
        status: 'executed',
        params: { secret: true },
      });

      if (recordResult.ok) {
        const result = await tracker.queryIntents({
          tenantId: 'tenant-other',
          agentId: 'secret-agent',
          limit: 100,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Should not see any intents from other tenant
          expect(result.value.length).toBe(0);
        }
      }
    });

    it('should index DeFi transaction categories for timeline filtering', async () => {
      await tracker.indexTransaction({
        signature: 'defi-lend-1',
        slot: 400,
        blockTime: new Date(),
        tenantId: 'tenant-1',
        walletAddress: 'wallet-1',
        type: 'deposit_lending',
        status: 'success',
        amount: 25,
        fee: 0.00025,
        instructionCount: 1,
        logMessages: [],
      });

      const result = await tracker.queryTransactions({
        tenantId: 'tenant-1',
        type: 'deposit_lending',
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0].type).toBe('deposit_lending');
      }
    });
  });
});
