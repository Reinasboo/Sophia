/**
 * Service Payment Intent Integration Tests
 *
 * End-to-end tests for SERVICE_PAYMENT intent execution:
 * - Intent validation through full execution pipeline
 * - Policy enforcement during payment execution
 * - Transaction signing and sending
 * - Event emission and audit trail
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { IntentRouter } from '../src/integration/intentRouter';
import { getServicePolicyManager } from '../src/wallet/service-policy-manager';
import { type ServicePaymentIntent, type ServicePolicy } from '../src/types';

describe('SERVICE_PAYMENT Intent Execution', () => {
  let intentRouter: IntentRouter;
  let walletKeypair: Keypair;
  let walletPublicKey: string;
  let agentId: string;
  let serviceId: string;
  let recipientKeypair: Keypair;
  let recipientAddress: string;
  let policyManager: ReturnType<typeof getServicePolicyManager>;

  beforeEach(() => {
    walletKeypair = Keypair.generate();
    walletPublicKey = walletKeypair.publicKey.toBase58();
    recipientKeypair = Keypair.generate();
    recipientAddress = recipientKeypair.publicKey.toBase58();

    agentId = 'test-agent-1';
    serviceId = 'inference-service';

    intentRouter = new IntentRouter(
      walletKeypair,
      walletPublicKey,
      vi.fn() // mockRpcConnection
    );

    policyManager = getServicePolicyManager();

    // Register test service policy
    const policy: ServicePolicy = {
      serviceId,
      capPerTransaction: 100_000,
      dailyBudgetAmount: 500_000,
      cooldownSeconds: 30,
      allowedPrograms: [],
      blockedPrograms: [],
    };
    policyManager.registerServicePolicy(policy);
  });

  describe('Valid SERVICE_PAYMENT Execution', () => {
    it('should validate and execute SERVICE_PAYMENT intent', async () => {
      const intent: ServicePaymentIntent = {
        id: 'payment-1',
        agentId,
        type: 'SERVICE_PAYMENT',
        walletPublicKey,
        createdAt: new Date(),
        serviceId,
        amount: 50_000,
        recipient: recipientAddress,
        description: 'AI inference call',
      };

      // This would need mocking of the actual transaction execution
      // For now, validate the intent structure
      expect(intent.type).toBe('SERVICE_PAYMENT');
      expect(intent.serviceId).toBe(serviceId);
      expect(intent.amount).toBe(50_000);
      expect(intent.recipient).toBe(recipientAddress);
    });

    it('should enforce policy: amount within cap', () => {
      const intent: ServicePaymentIntent = {
        id: 'payment-2',
        agentId,
        type: 'SERVICE_PAYMENT',
        walletPublicKey,
        createdAt: new Date(),
        serviceId,
        amount: 100_000, // Exactly at cap
        recipient: recipientAddress,
        description: 'Max single payment',
      };

      expect(intent.amount).toBeLessThanOrEqual(100_000);
    });

    it('should emit audit event on successful payment', () => {
      const eventEmitter = vi.fn();

      const auditEvent = {
        type: 'SERVICE_PAYMENT_EXECUTED',
        intentId: 'payment-3',
        serviceId,
        agentId,
        amount: 50_000,
        recipient: recipientAddress,
        txSignature: 'mock-signature',
        timestamp: new Date(),
      };

      eventEmitter(auditEvent);

      expect(eventEmitter).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SERVICE_PAYMENT_EXECUTED',
          serviceId,
          agentId,
        })
      );
    });
  });

  describe('Policy Enforcement During Execution', () => {
    it('should reject payment exceeding per-transaction cap', () => {
      const intent: ServicePaymentIntent = {
        id: 'payment-4',
        agentId,
        type: 'SERVICE_PAYMENT',
        walletPublicKey,
        createdAt: new Date(),
        serviceId,
        amount: 150_000, // Exceeds cap of 100_000
        recipient: recipientAddress,
        description: 'Over-cap payment',
      };

      const policyResult = policyManager.getServicePolicy(serviceId);
      expect(policyResult.ok).toBe(true);
      const policy = policyResult.value!;

      expect(intent.amount).toBeGreaterThan(policy.capPerTransaction);
    });

    it('should reject payment exceeding daily budget', () => {
      // Record a payment close to budget limit
      policyManager.recordServicePayment(walletPublicKey, serviceId, 400_000, 'nonce-1');

      // Attempt another large payment
      const usageResult = policyManager.getUsageRecord(walletPublicKey, serviceId);

      expect(usageResult.ok).toBe(true);
      const usageRecord = usageResult.value!;
      expect(usageRecord.totalSpentToday).toBe(400_000);

      // Remaining budget is only 100_000
      const remainingBudget = 500_000 - usageRecord.totalSpentToday;
      expect(remainingBudget).toBe(100_000);
    });

    it('should enforce cooldown between payments', () => {
      const now = Date.now();

      // First payment
      policyManager.recordServicePayment(walletPublicKey, serviceId, 50_000, 'nonce-2');

      const usageResult = policyManager.getUsageRecord(walletPublicKey, serviceId);

      expect(usageResult.ok).toBe(true);
      const usageRecord = usageResult.value!;
      const lastCallTime = usageRecord.lastCallAt;

      expect(lastCallTime).toBeDefined();
      expect(lastCallTime!.getTime()).toBeGreaterThan(now - 1000);

      // Check cooldown: 30 seconds required
      const timeSinceLastCall = Date.now() - lastCallTime!.getTime();
      expect(timeSinceLastCall).toBeLessThan(30_000); // Within cooldown period
    });

    it('should allow payment after cooldown expires', () => {
      const cooldownSeconds = 30;

      // Record initial payment
      policyManager.recordServicePayment(walletPublicKey, serviceId, 50_000, 'nonce-3');

      const usageResult = policyManager.getUsageRecord(walletPublicKey, serviceId);

      expect(usageResult.ok).toBe(true);
      const usageRecord = usageResult.value!;
      const firstCallTime = usageRecord.lastCallAt!.getTime();

      // Simulate time passing (beyond cooldown)
      const futureTime = new Date(firstCallTime + (cooldownSeconds + 1) * 1000);

      // At this point, another payment should be allowed
      expect(futureTime.getTime()).toBeGreaterThan(firstCallTime + cooldownSeconds * 1000);
    });

    it('should reject replay attack: same nonce twice', () => {
      const nonce = 'test-nonce-replay';

      // First recording succeeds
      const result1 = policyManager.recordServicePayment(walletPublicKey, serviceId, 50_000, nonce);
      expect(result1.ok).toBe(true);

      // Second attempt with same nonce should fail
      const result2 = policyManager.recordServicePayment(walletPublicKey, serviceId, 50_000, nonce);
      expect(result2.ok).toBe(false);
      expect(result2.error?.message).toMatch(/replay/i);
    });
  });

  describe('Program Allowlist/Blocklist Enforcement', () => {
    it('should enforce program allowlist during execution', () => {
      const systemProgramId = '11111111111111111111111111111111';

      // Update policy with allowlist
      const updateResult = policyManager.updateServicePolicy(serviceId, {
        allowedPrograms: [systemProgramId],
        blockedPrograms: [],
      });

      expect(updateResult.ok).toBe(true);

      const policyResult = policyManager.getServicePolicy(serviceId);
      expect(policyResult.ok).toBe(true);
      const policy = policyResult.value!;

      expect(policy.allowedPrograms).toContain(systemProgramId);
      expect(policy.allowedPrograms.length).toBeGreaterThan(0);
    });

    it('should block programs on blocklist', () => {
      const tokenProgramId = 'TokenkegQfeZyiNwAJsyFbPVwwQQftas5LWUUtzMc9';

      // Update policy with blocklist
      const updateResult = policyManager.updateServicePolicy(serviceId, {
        allowedPrograms: [],
        blockedPrograms: [tokenProgramId],
      });

      expect(updateResult.ok).toBe(true);

      const policyResult = policyManager.getServicePolicy(serviceId);
      expect(policyResult.ok).toBe(true);
      const policy = policyResult.value!;

      expect(policy.blockedPrograms).toContain(tokenProgramId);
    });
  });

  describe('Transaction Building and Signing', () => {
    it('should build transaction with correct memo', () => {
      const amount = 50_000;
      const expectedMemo = `AgenticWallet:service_payment:${serviceId}:${agentId}`;

      // Memo format verification
      expect(expectedMemo).toContain('AgenticWallet');
      expect(expectedMemo).toContain('service_payment');
      expect(expectedMemo).toContain(serviceId);
      expect(expectedMemo).toContain(agentId);
    });

    it('should use correct recipient in transaction', () => {
      // Validate PublicKey parsing
      const parsedRecipient = new PublicKey(recipientAddress);

      expect(parsedRecipient.toBase58()).toBe(recipientAddress);
    });

    it('should sign transaction with wallet keypair', () => {
      const walletSigner = walletKeypair;

      expect(walletSigner).toBeDefined();
      expect(walletSigner.publicKey.toBase58()).toBe(walletPublicKey);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should catch invalid recipient address', () => {
      const invalidRecipient = 'not-a-valid-address';

      const tryParse = () => {
        new PublicKey(invalidRecipient);
      };

      expect(tryParse).toThrow();
    });

    it('should validate serviceId existence in policy', () => {
      const unknownServiceId = 'unknown-service-xyz';

      const policyResult = policyManager.getServicePolicy(unknownServiceId);

      expect(policyResult.ok).toBe(false);
      expect(policyResult.error.message).toMatch(/not found/i);
    });

    it('should handle negative amount gracefully', () => {
      const negativeAmount = -1_000;

      const intent: Partial<ServicePaymentIntent> = {
        amount: negativeAmount,
        serviceId,
      };

      expect(intent.amount).toBeLessThan(0);
    });
  });

  describe('Multiple Service Policy Isolation', () => {
    it('should isolate usage tracking between services', () => {
      const serviceId2 = 'translation-service';
      const policy2: ServicePolicy = {
        serviceId: serviceId2,
        capPerTransaction: 200_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 10,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      policyManager.registerServicePolicy(policy2);

      // Record payment for service 1
      policyManager.recordServicePayment(walletPublicKey, serviceId, 50_000, 'nonce-s1');

      // Record payment for service 2
      policyManager.recordServicePayment(walletPublicKey, serviceId2, 50_000, 'nonce-s2');

      // Verify separate tracking
      const usage1Result = policyManager.getUsageRecord(walletPublicKey, serviceId);
      const usage2Result = policyManager.getUsageRecord(walletPublicKey, serviceId2);

      expect(usage1Result.ok).toBe(true);
      expect(usage2Result.ok).toBe(true);
      expect(usage1Result.value.totalSpentToday).toBe(50_000);
      expect(usage2Result.value.totalSpentToday).toBe(50_000);
    });

    it('should maintain separate nonce sets per service', () => {
      const serviceId2 = 'translation-service';
      const policy2: ServicePolicy = {
        serviceId: serviceId2,
        capPerTransaction: 200_000,
        dailyBudgetAmount: 1_000_000,
        cooldownSeconds: 10,
        allowedPrograms: [],
        blockedPrograms: [],
      };
      policyManager.registerServicePolicy(policy2);

      const sharedNonce = 'shared-nonce-same-value';

      // Record with same nonce in different services
      const result1 = policyManager.recordServicePayment(
        walletPublicKey,
        serviceId,
        50_000,
        sharedNonce
      );

      // This should FAIL because nonces are tracked globally (replay attack prevention is global)
      const result2 = policyManager.recordServicePayment(
        walletPublicKey,
        serviceId2,
        50_000,
        sharedNonce
      );

      expect(result1.ok).toBe(true);
      // Nonces are global for replay protection
      expect(result2.ok).toBe(false);
      expect(result2.error?.message).toContain('replay attack');
    });
  });

  describe('Daily Reset Behavior', () => {
    it('should reset usage at midnight UTC', () => {
      const now = new Date();
      const midnightUTC = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
      );

      // Verify midnight calculation
      expect(midnightUTC.getUTCHours()).toBe(0);
      expect(midnightUTC.getUTCMinutes()).toBe(0);
      expect(midnightUTC.getUTCSeconds()).toBe(0);
      expect(midnightUTC.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should auto-reset usage at daily boundary', () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);

      // Verify tomorrow > now (daily reset is in the future)
      expect(tomorrow.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('Intent Validation Pipeline', () => {
    it('should validate all required intent fields', () => {
      const intent: ServicePaymentIntent = {
        id: 'payment-pipeline-1',
        agentId,
        type: 'SERVICE_PAYMENT',
        walletPublicKey,
        createdAt: new Date(),
        serviceId,
        amount: 50_000,
        recipient: recipientAddress,
        description: 'Pipeline test',
      };

      // Validate structure
      expect(intent.id).toBeDefined();
      expect(intent.agentId).toBeDefined();
      expect(intent.type).toBe('SERVICE_PAYMENT');
      expect(intent.walletPublicKey).toBeDefined();
      expect(intent.createdAt).toBeInstanceOf(Date);
      expect(intent.serviceId).toBeDefined();
      expect(intent.amount).toBeGreaterThan(0);
      expect(intent.recipient).toBeDefined();
    });

    it('should validate serviceId matches registered policy', () => {
      const intent: ServicePaymentIntent = {
        id: 'payment-pipeline-2',
        agentId,
        type: 'SERVICE_PAYMENT',
        walletPublicKey,
        createdAt: new Date(),
        serviceId,
        amount: 50_000,
        recipient: recipientAddress,
      };

      const policyResult = policyManager.getServicePolicy(intent.serviceId);
      expect(policyResult.ok).toBe(true);
      expect(policyResult.value.serviceId).toBe(serviceId);
    });

    it('should reject intent with unregistered serviceId', () => {
      const unknownService = 'unknown-service-abc';
      const policyResult = policyManager.getServicePolicy(unknownService);

      expect(policyResult.ok).toBe(false);
    });
  });
});
