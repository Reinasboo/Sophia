/**
 * Service Policy Manager
 *
 * Enforces x402/MPP pay-per-use policies on a per-service basis:
 * - Per-transaction spend caps
 * - Daily budget limits with automatic reset at midnight UTC
 * - Cooldown periods between consecutive calls
 * - Program allowlists/blocklists (optional)
 *
 * SECURITY: This is the enforcement layer for service-scoped payments.
 * All BYOA service intents must pass validation here before execution.
 */

import {
  ServicePolicy,
  ServiceUsageRecord,
  ServicePaymentIntent,
  Result,
  success,
  failure,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('SERVICE_POLICY');

/**
 * Service Policy Manager — enforces service-scoped payment policies
 */
const GLOBAL_TENANT_ID = '__global__';

export class ServicePolicyManager {
  private policies: Map<string, ServicePolicy> = new Map();
  private usage: Map<string, ServiceUsageRecord> = new Map(); // key: `${tenantId}:${walletId}:${serviceId}`
  private nonces: Set<string> = new Set(); // Replay attack prevention
  private maxNonces: number = 10000;

  constructor() {
    this.loadFromStore();
    this.scheduleUsageReset();
  }

  private policyKey(serviceId: string, tenantId?: string): string {
    return `${tenantId ?? GLOBAL_TENANT_ID}:${serviceId}`;
  }

  private usageKey(walletId: string, serviceId: string, tenantId?: string): string {
    return `${tenantId ?? GLOBAL_TENANT_ID}:${walletId}:${serviceId}`;
  }

  /**
   * Register a service policy
   */
  registerServicePolicy(policy: ServicePolicy, tenantId?: string): Result<true, Error> {
    if (!policy.serviceId) {
      return failure(new Error('serviceId is required'));
    }
    if (policy.capPerTransaction < 0 || policy.dailyBudgetAmount < 0) {
      return failure(new Error('Caps must be non-negative'));
    }
    if (policy.cooldownSeconds < 0 || policy.cooldownSeconds > 86400) {
      return failure(new Error('Cooldown must be 0–86400 seconds'));
    }

    const scopedPolicy: ServicePolicy = {
      ...policy,
      tenantId: tenantId ?? policy.tenantId ?? GLOBAL_TENANT_ID,
    };

    this.policies.set(this.policyKey(scopedPolicy.serviceId, scopedPolicy.tenantId), scopedPolicy);
    logger.info('Service policy registered', {
      serviceId: scopedPolicy.serviceId,
      tenantId: scopedPolicy.tenantId,
      capPerTx: scopedPolicy.capPerTransaction,
      dailyBudget: scopedPolicy.dailyBudgetAmount,
      cooldown: scopedPolicy.cooldownSeconds,
    });

    this.saveToStore();
    return success(true);
  }

  /**
   * Get a service policy
   */
  getServicePolicy(serviceId: string, tenantId?: string): Result<ServicePolicy, Error> {
    const policy = this.policies.get(this.policyKey(serviceId, tenantId));
    if (!policy) {
      return failure(new Error(`Service policy not found: ${serviceId}`));
    }
    return success(policy);
  }

  /**
   * Update a service policy
   */
  updateServicePolicy(
    serviceId: string,
    updates: Partial<ServicePolicy>,
    tenantId?: string
  ): Result<ServicePolicy, Error> {
    const policyKey = this.policyKey(serviceId, tenantId ?? updates.tenantId);
    const current = this.policies.get(policyKey);
    if (!current) {
      return failure(new Error(`Service policy not found: ${serviceId}`));
    }

    const updated: ServicePolicy = {
      ...current,
      ...updates,
      serviceId,
      tenantId: updates.tenantId ?? current.tenantId ?? tenantId ?? GLOBAL_TENANT_ID,
    };
    this.policies.set(this.policyKey(serviceId, updated.tenantId), updated);

    logger.info('Service policy updated', { serviceId, tenantId: updated.tenantId, updates });
    this.saveToStore();
    return success(updated);
  }

  /**
   * Validate a service payment intent against policy
   *
   * Checks:
   * 1. Policy exists
   * 2. Amount ≤ cap per transaction
   * 3. Remaining daily budget sufficient
   * 4. Cooldown elapsed since last call
   * 5. No replay attack (nonce)
   * 6. Program allowlist/blocklist (if applicable)
   */
  validateServicePayment(
    walletId: string,
    intent: ServicePaymentIntent,
    programId?: string,
    tenantId?: string
  ): Result<true, Error> {
    const policyResult = this.getServicePolicy(intent.serviceId, tenantId);
    if (!policyResult.ok) {
      return failure(policyResult.error);
    }

    const policy = policyResult.value;

    // ── 1. Cap per transaction
    if (intent.amount > policy.capPerTransaction) {
      return failure(
        new Error(
          `Amount ${intent.amount} exceeds cap per transaction (${policy.capPerTransaction})`
        )
      );
    }

    // ── 2. Daily budget
    const usage = this.getOrCreateUsage(walletId, intent.serviceId, tenantId);

    if (usage.totalSpentToday + intent.amount > policy.dailyBudgetAmount) {
      return failure(
        new Error(
          `Amount would exceed daily budget. Spent: ${usage.totalSpentToday}, ` +
            `Limit: ${policy.dailyBudgetAmount}, Requested: ${intent.amount}`
        )
      );
    }

    // ── 3. Cooldown
    if (policy.cooldownSeconds > 0 && usage.lastCallAt) {
      const secondsElapsed = (Date.now() - usage.lastCallAt.getTime()) / 1000;
      if (secondsElapsed < policy.cooldownSeconds) {
        return failure(
          new Error(
            `Cooldown not elapsed. Wait ${Math.ceil(policy.cooldownSeconds - secondsElapsed)}s`
          )
        );
      }
    }

    // ── 4. Nonce (replay prevention)
    if (!intent.id) {
      return failure(new Error('Intent ID (nonce) is required'));
    }
    if (this.nonces.has(intent.id)) {
      return failure(new Error('Intent ID already used (replay attack detected)'));
    }

    // ── 5. Program allowlist/blocklist
    if (programId) {
      if (
        policy.allowedPrograms &&
        policy.allowedPrograms.length > 0 &&
        !policy.allowedPrograms.includes(programId)
      ) {
        return failure(new Error(`Program ${programId} is not in allowed list`));
      }

      if (policy.blockedPrograms && policy.blockedPrograms.includes(programId)) {
        return failure(new Error(`Program ${programId} is blocked`));
      }
    }

    logger.info('Service payment validated', {
      walletId,
      serviceId: intent.serviceId,
      amount: intent.amount,
    });

    return success(true);
  }

  /**
   * Record a service payment (after execution)
   * Returns Result type for error handling (e.g., replay attack detection)
   */
  recordServicePayment(
    walletId: string,
    serviceId: string,
    amount: number,
    nonce: string,
    tenantId?: string
  ): Result<true, Error> {
    // Check for replay attack (nonce already used)
    if (this.nonces.has(nonce)) {
      return failure(new Error('Nonce already used - replay attack detected'));
    }

    const usage = this.getOrCreateUsage(walletId, serviceId, tenantId);
    const updatedUsage: ServiceUsageRecord = {
      ...usage,
      totalSpentToday: usage.totalSpentToday + amount,
      lastCallAt: new Date(),
      callCountToday: usage.callCountToday + 1,
    };

    this.usage.set(this.usageKey(walletId, serviceId, tenantId), updatedUsage);

    // Track nonce for replay prevention
    this.nonces.add(nonce);
    if (this.nonces.size > this.maxNonces) {
      // Trim oldest nonces (simple FIFO, could use LRU in production)
      const noncesArray = Array.from(this.nonces);
      for (let i = 0; i < 1000; i++) {
        const n = noncesArray[i];
        if (n) this.nonces.delete(n);
      }
    }

    logger.debug('Service payment recorded', {
      walletId,
      serviceId,
      amount,
      totalTodayAfter: updatedUsage.totalSpentToday,
    });

    this.saveToStore();
    return success(true);
  }

  /**
   * Get usage record for a wallet + service
   */
  getUsageRecord(walletId: string, serviceId: string, tenantId?: string): Result<ServiceUsageRecord, Error> {
    const usage = this.usage.get(this.usageKey(walletId, serviceId, tenantId));
    if (!usage) {
      return failure(new Error(`No usage record found for ${walletId}:${serviceId}`));
    }
    return success({ ...usage }); // Return copy to prevent mutation
  }

  /**
   * Reset usage for a wallet + service (e.g., for testing)
   */
  resetUsage(walletId: string, serviceId: string, tenantId?: string): Result<true, Error> {
    const policy = this.getServicePolicy(serviceId, tenantId);
    if (!policy.ok) {
      return failure(new Error(`Cannot reset: ${policy.error.message}`));
    }

    this.usage.delete(this.usageKey(walletId, serviceId, tenantId));
    logger.info('Usage reset', { walletId, serviceId, tenantId });
    this.saveToStore();
    return success(true);
  }

  /**
   * Internal: get or create usage record
   */
  private getOrCreateUsage(walletId: string, serviceId: string, tenantId?: string): ServiceUsageRecord {
    const key = this.usageKey(walletId, serviceId, tenantId);
    let usage = this.usage.get(key);

    if (!usage) {
      const dailyResetAt = new Date();
      dailyResetAt.setUTCHours(24, 0, 0, 0);

      usage = {
        serviceId,
        tenantId: tenantId ?? GLOBAL_TENANT_ID,
        walletId,
        totalSpentToday: 0,
        callCountToday: 0,
        dailyResetAt,
      };
      this.usage.set(key, usage);
    }

    // Check if daily reset is needed (passed midnight UTC)
    if (Date.now() >= usage.dailyResetAt.getTime()) {
      const newReset = new Date();
      newReset.setUTCHours(24, 0, 0, 0);

      const resetUsage: ServiceUsageRecord = {
        ...usage,
        totalSpentToday: 0,
        callCountToday: 0,
        lastCallAt: undefined,
        dailyResetAt: newReset,
      };

      this.usage.set(key, resetUsage);
      logger.info('Daily usage reset (auto)', { walletId, serviceId, tenantId: usage.tenantId });
      return resetUsage;
    }

    return usage;
  }

  /**
   * Schedule daily usage reset at midnight UTC
   */
  private scheduleUsageReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
      logger.info('Daily service usage reset (scheduled)');
      // Note: we reset on-demand in getOrCreateUsage, so this is mainly for logging
      this.scheduleUsageReset();
    }, msUntilMidnight);
  }

  /**
   * List all registered service policies
   */
  listAllPolicies(): ServicePolicy[] {
    return Array.from(this.policies.values());
  }

  // ────────────────────────────────────────────────────────────────
  // Persistence
  // ────────────────────────────────────────────────────────────────

  private saveToStore(): void {
    const policiesArr = Array.from(this.policies.values());
    const usageArr = Array.from(this.usage.values());

    saveState('service-policies', {
      policies: policiesArr,
      usage: usageArr,
    });
  }

  private loadFromStore(): void {
    interface SavedData {
      policies: ServicePolicy[];
      usage: ServiceUsageRecord[];
    }

    const saved = loadState<SavedData>('service-policies');
    if (!saved) return;

    if (saved.policies) {
      for (const p of saved.policies) {
        const tenantId = p.tenantId ?? GLOBAL_TENANT_ID;
        this.policies.set(this.policyKey(p.serviceId, tenantId), {
          ...p,
          tenantId,
        });
      }
      logger.info('Service policies restored', { count: saved.policies.length });
    }

    if (saved.usage) {
      for (const u of saved.usage) {
        const tenantId = u.tenantId ?? GLOBAL_TENANT_ID;
        this.usage.set(this.usageKey(u.walletId, u.serviceId, tenantId), {
          ...u,
          tenantId,
          lastCallAt: u.lastCallAt ? new Date(u.lastCallAt) : undefined,
          dailyResetAt: new Date(u.dailyResetAt),
        });
      }
      logger.info('Service usage records restored', { count: saved.usage.length });
    }
  }
}

// Singleton instance
let servicePolicyManagerInstance: ServicePolicyManager | null = null;

export function getServicePolicyManager(): ServicePolicyManager {
  if (!servicePolicyManagerInstance) {
    servicePolicyManagerInstance = new ServicePolicyManager();
  }
  return servicePolicyManagerInstance;
}
