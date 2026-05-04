/**
 * Service Policy Manager Tests
 *
 * Tests for x402/MPP pay-per-use service policies:
 * - Per-transaction spend caps enforcement
 * - Daily budget limits and auto-reset
 * - Cooldown periods between calls
 * - Replay attack prevention via nonce tracking
 * - Policy validation and updates
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { ServicePolicyManager } from '../src/wallet/service-policy-manager';
import { ServicePolicy, ServicePaymentIntent } from '../src/types';

describe('ServicePolicyManager', () => {
  let manager: ServicePolicyManager;
  let testCounter = 0;

  beforeAll(() => {
    // Clear persisted state before all tests
    try {
      const dataDir = join(process.cwd(), 'data');
      const policyFile = join(dataDir, 'service-policies.json');
      if (existsSync(policyFile)) {
        rmSync(policyFile);
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    manager = new ServicePolicyManager();
    testCounter++;
  });

  describe('Service Policy Registration', () => {
    it('should register a valid service policy', () => {
      const policy: ServicePolicy = {
        serviceId: 'test-service',
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 30,
        allowedPrograms: [],
        blockedPrograms: [],
      };

      const result = manager.registerServicePolicy(policy);

      expect(result.ok).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should isolate service policies and usage by tenant', () => {
      const policy: ServicePolicy = {
        serviceId: 'tenant-service',
        capPerTransaction: 100_000,
        dailyBudgetAmount: 200_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };

      expect(manager.registerServicePolicy(policy, 'tenant-a').ok).toBe(true);
      expect(manager.getServicePolicy('tenant-service', 'tenant-a').ok).toBe(true);
      expect(manager.getServicePolicy('tenant-service', 'tenant-b').ok).toBe(false);

      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-tenant-a',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: 'wallet-tenant-a',
        serviceId: 'tenant-service',
        amount: 50_000,
        recipient: 'recipient-pk',
      };

      const validation = manager.validateServicePayment(
        'wallet-tenant-a',
        intent,
        undefined,
        'tenant-a'
      );
      expect(validation.ok).toBe(true);

      const record = manager.recordServicePayment(
        'wallet-tenant-a',
        'tenant-service',
        50_000,
        intent.id,
        'tenant-a'
      );
      expect(record.ok).toBe(true);
      expect(manager.getUsageRecord('wallet-tenant-a', 'tenant-service', 'tenant-a').ok).toBe(true);
      expect(manager.getUsageRecord('wallet-tenant-a', 'tenant-service', 'tenant-b').ok).toBe(
        false
      );
    });

    it('should reject policy with negative caps', () => {
      const policy: ServicePolicy = {
        serviceId: 'test-service',
        capPerTransaction: -1,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };

      const result = manager.registerServicePolicy(policy);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('non-negative');
    });

    it('should reject policy with invalid cooldown', () => {
      const policy: ServicePolicy = {
        serviceId: 'test-service',
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 100000,
        allowedPrograms: [],
        blockedPrograms: [],
      };

      const result = manager.registerServicePolicy(policy);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Cooldown');
    });
  });

  describe('Per-Transaction Spend Caps', () => {
    beforeEach(() => {
      const policy: ServicePolicy = {
        serviceId: `api.service-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);
    });

    it('should allow payment within cap', () => {
      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: `wallet-${testCounter}`,
        serviceId: `api.service-${testCounter}`,
        amount: 50_000,
        recipient: 'recipient-pk',
      };

      const result = manager.validateServicePayment(`wallet-${testCounter}`, intent);

      expect(result.ok).toBe(true);
    });

    it('should reject payment exceeding cap', () => {
      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: `wallet-${testCounter}`,
        serviceId: `api.service-${testCounter}`,
        amount: 200_000,
      };

      const result = manager.validateServicePayment(`wallet-${testCounter}`, intent);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/exceeds cap per transaction/i);
    });
  });

  describe('Daily Budget Enforcement', () => {
    beforeEach(() => {
      const policy: ServicePolicy = {
        serviceId: `api.service-budget-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 200_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);
    });

    it('should track cumulative spending across transactions', () => {
      const walletId = `wallet-budget-test-${testCounter}`;
      const serviceId = `api.service-budget-${testCounter}`;

      // First payment: 100_000
      const intent1: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 100_000,
        recipient: 'recipient-pk',
      };

      const result1 = manager.validateServicePayment(walletId, intent1);
      expect(result1.ok).toBe(true);

      manager.recordServicePayment(walletId, serviceId, 100_000, intent1.id);

      // Second payment: 100_000 (total 200_000)
      const intent2: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 100_000,
        recipient: 'recipient-pk',
      };

      const result2 = manager.validateServicePayment(walletId, intent2);
      expect(result2.ok).toBe(true);

      manager.recordServicePayment(walletId, serviceId, 100_000, intent2.id);

      // Third payment: 50k would exceed daily budget (total 200k + 50k = 250k > 200k budget)
      const intent3: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 50_000,
        recipient: 'recipient-pk',
      };

      const result3 = manager.validateServicePayment(walletId, intent3);
      expect(result3.ok).toBe(false);
      expect(result3.error?.message).toMatch(/exceed daily budget/i);
    });

    it('should allow payment equal to remaining budget', () => {
      // Setup a new policy with larger budget for this test
      const largeBudgetPolicy: ServicePolicy = {
        serviceId: `api.service-budget-large-${testCounter}`,
        capPerTransaction: 450_000,
        dailyBudgetAmount: 500_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(largeBudgetPolicy);

      const walletId = `wallet-budget-test-2-${testCounter}`;
      const serviceId = `api.service-budget-large-${testCounter}`;

      // First payment: 400_000
      const intent1: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 400_000,
        recipient: 'recipient-pk',
      };

      const result1 = manager.validateServicePayment(walletId, intent1);
      expect(result1.ok).toBe(true);
      manager.recordServicePayment(walletId, serviceId, 400_000, intent1.id);

      // Second payment: exactly 100_000 remaining (400k + 100k = 500k budget)
      const intent2: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 100_000,
        recipient: 'recipient-pk',
      };

      const result = manager.validateServicePayment(walletId, intent2);

      expect(result.ok).toBe(true);
    });
  });

  describe('Cooldown Enforcement', () => {
    beforeEach(() => {
      const policy: ServicePolicy = {
        serviceId: `api.service-cool-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 60,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);
    });

    it('should reject payment within cooldown period', () => {
      const walletId = `wallet-cooldown-test-${testCounter}`;
      const serviceId = `api.service-cool-${testCounter}`;

      // First payment
      const intent1: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      manager.validateServicePayment(walletId, intent1);
      manager.recordServicePayment(walletId, serviceId, 10_000, intent1.id);

      // Second payment immediately (within 60s cooldown)
      const intent2: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      const result = manager.validateServicePayment(walletId, intent2);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toMatch(/Cooldown not elapsed/i);
    });

    it('should allow payment after cooldown expires', async () => {
      const walletId = `wallet-cooldown-test-2-${testCounter}`;
      const serviceId = `api.service-cool-${testCounter}`;

      // First payment
      const intent1: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      manager.validateServicePayment(walletId, intent1);
      manager.recordServicePayment(walletId, serviceId, 10_000, intent1.id);

      // Reset usage to simulate cooldown expiration
      manager.resetUsage(walletId, serviceId);

      const intent2: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      const result = manager.validateServicePayment(walletId, intent2);

      expect(result.ok).toBe(true);
    });
  });

  describe('Replay Attack Prevention', () => {
    beforeEach(() => {
      const policy: ServicePolicy = {
        serviceId: `api.service-replay-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);
    });

    it('should reject duplicate nonce (replay attack)', () => {
      const walletId = `wallet-replay-test-${testCounter}`;
      const serviceId = `api.service-replay-${testCounter}`;
      const nonce = uuidv4();

      // First submission with nonce
      const intent1: ServicePaymentIntent = {
        id: nonce,
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      const result1 = manager.validateServicePayment(walletId, intent1);
      expect(result1.ok).toBe(true);

      manager.recordServicePayment(walletId, serviceId, 10_000, nonce);

      // Replay attack: same nonce again
      const intent2: ServicePaymentIntent = {
        id: nonce,
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      const result2 = manager.recordServicePayment(walletId, serviceId, 10_000, nonce);

      expect(result2.ok).toBe(false);
      expect(result2.error?.message).toMatch(/replay attack/i);
    });
  });

  describe('Program Allowlist/Blocklist', () => {
    beforeEach(() => {
      const policy: ServicePolicy = {
        serviceId: `api.dex-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 0,
        allowedPrograms: ['11111111111111111111111111111111'],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);
    });

    it('should enforce program allowlist', () => {
      const walletId = `wallet-allowlist-test-${testCounter}`;
      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId: `api.dex-${testCounter}`,
        amount: 10_000,
        recipient: 'recipient-pk',
      };

      const allowedProgram = '11111111111111111111111111111111';
      const result1 = manager.validateServicePayment(walletId, intent, allowedProgram);
      expect(result1.ok).toBe(true);

      const unauthorizedProgram = 'unverified1111111111111111111111';
      const result2 = manager.validateServicePayment(walletId, intent, unauthorizedProgram);
      expect(result2.ok).toBe(false);
    });
  });

  describe('Usage Record Management', () => {
    it('should retrieve usage records', () => {
      const policy: ServicePolicy = {
        serviceId: `api.service-usage-${testCounter}`,
        capPerTransaction: 100_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 0,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      manager.registerServicePolicy(policy);

      const walletId = `wallet-usage-test-${testCounter}`;
      const serviceId = `api.service-usage-${testCounter}`;
      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        createdAt: new Date(),
        type: 'SERVICE_PAYMENT',
        walletPublicKey: walletId,
        serviceId,
        amount: 25_000,
        recipient: 'recipient-pk',
      };

      manager.validateServicePayment(walletId, intent);
      manager.recordServicePayment(walletId, serviceId, 25_000, intent.id);

      const usageResult = manager.getUsageRecord(walletId, serviceId);

      expect(usageResult.ok).toBe(true);
      expect(usageResult.value.totalSpentToday).toBe(25_000);
      expect(usageResult.value.callCountToday).toBe(1);
      expect(usageResult.value.serviceId).toBe(serviceId);
      expect(usageResult.value.walletId).toBe(walletId);
    });

    it('should reset usage records on demand', () => {
      const policy: ServicePolicy = {
        serviceId: 'api.service-reset',
        capPerTransaction: 1.0,
        dailyBudgetAmount: 10.0,
        cooldownSeconds: 0,
      };
      manager.registerServicePolicy(policy);

      const walletId = 'wallet-reset-test';
      const serviceId = 'api.service-reset';

      const intent: ServicePaymentIntent = {
        id: uuidv4(),
        agentId: 'agent-1',
        timestamp: new Date(),
        type: 'service_payment',
        serviceId,
        amount: 5.0,
      };

      manager.validateServicePayment(walletId, intent);
      manager.recordServicePayment(walletId, serviceId, 5.0, intent.id);

      const usage = manager.getUsageRecord(walletId, serviceId);
      expect(usage.value.totalSpentToday).toBe(5.0);

      // Reset
      manager.resetUsage(walletId, serviceId);

      // After reset, should get error (no usage record)
      const result = manager.getUsageRecord(walletId, serviceId);
      expect(result.ok).toBe(false);
    });
  });
});
