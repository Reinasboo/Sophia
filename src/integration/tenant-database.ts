/**
 * Tenant Database - Phase 1 (Simplified)
 *
 * Persistent storage for tenant accounts and API tokens.
 * Phase 1: In-memory + simple file storage (data/tenants.json)
 * Phase 2: PostgreSQL + Redis for enterprise scale
 *
 * SIMPLIFICATIONS FOR MVP:
 * - No encryption at rest (assume secure server)
 * - No token rotation (30-day fixed expiry)
 * - Single-server deployment only
 */

import type {
  Tenant,
  ApiToken,
  TenantStorageRecord,
  ApiTokenStorageRecord,
} from '../types/tenant.js';
import { createLogger } from '../utils/logger.js';
import { saveState, loadState } from '../utils/store.js';
import { generateSecureId } from '../utils/encryption.js';
import * as crypto from 'crypto';

const logger = createLogger('TENANT_DB');

/**
 * TenantDatabase - Simple tenant account + token management
 */
export class TenantDatabase {
  private tenants: Map<string, TenantStorageRecord> = new Map();
  private tokens: Map<string, ApiTokenStorageRecord> = new Map();

  constructor() {
    this.loadFromStore();
  }

  /**
   * Create a new tenant account
   */
  createTenant(label: string, publicKey?: string, metadata?: Record<string, unknown>): Tenant {
    const tenantId = generateSecureId('tenant');
    const now = new Date();

    const record: TenantStorageRecord = {
      id: tenantId,
      label,
      publicKey,
      createdAt: now.toISOString(),
      metadata,
    };

    this.tenants.set(tenantId, record);
    this.saveToStore();

    logger.info(`Created tenant: ${tenantId}`, { label, publicKey });

    return this.recordToTenant(record);
  }

  /**
   * Get a tenant by ID
   */
  getTenant(tenantId: string): Tenant | null {
    const record = this.tenants.get(tenantId);
    if (!record) return null;
    return this.recordToTenant(record);
  }

  /**
   * List all tenants
   */
  listTenants(): Tenant[] {
    return Array.from(this.tenants.values()).map((r) => this.recordToTenant(r));
  }

  /**
   * Issue a new API token for a tenant
   */
  issueApiToken(tenantId: string, label?: string, expiresInDays: number = 30): ApiToken | null {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      logger.warn(`Attempted to issue token for non-existent tenant: ${tenantId}`);
      return null;
    }

    const apiKey = generateSecureId('token');
    const hashedSecret = this.hashToken(apiKey);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    const record: ApiTokenStorageRecord = {
      tenantId,
      apiKey: hashedSecret,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      label,
      hashedSecret,
    };

    this.tokens.set(apiKey, record);
    this.saveToStore();

    logger.info(`Issued API token for tenant: ${tenantId}`, { label });

    return {
      tenantId,
      apiKey,
      createdAt: now,
      expiresAt,
      label,
    };
  }

  /**
   * Verify an API token and return tenant
   */
  verifyApiToken(apiKey: string): Tenant | null {
    if (!apiKey) return null;

    const hashedSecret = this.hashToken(apiKey);

    for (const record of this.tokens.values()) {
      if (record.hashedSecret === hashedSecret) {
        // Check expiration
        if (record.expiresAt) {
          const expiresAt = new Date(record.expiresAt);
          if (expiresAt < new Date()) {
            logger.warn(`API token expired for tenant: ${record.tenantId}`);
            return null;
          }
        }

        const tenant = this.tenants.get(record.tenantId);
        if (!tenant) return null;

        return this.recordToTenant(tenant);
      }
    }

    logger.warn('Attempted access with invalid API token');
    return null;
  }

  /**
   * Revoke an API token
   */
  revokeApiToken(tenantId: string, tokenLabel: string): boolean {
    for (const [key, record] of this.tokens.entries()) {
      if (record.tenantId === tenantId && record.label === tokenLabel) {
        this.tokens.delete(key);
        this.saveToStore();
        logger.info(`Revoked API token for tenant: ${tenantId}`, { label: tokenLabel });
        return true;
      }
    }
    return false;
  }

  /**
   * Convert storage record to public Tenant
   */
  private recordToTenant(record: TenantStorageRecord): Tenant {
    return {
      id: record.id,
      publicKey: record.publicKey,
      label: record.label,
      createdAt: new Date(record.createdAt),
      metadata: record.metadata,
    };
  }

  /**
   * Hash token using SHA256
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ── Persistence ──────────────────────────────────────────────────────

  private saveToStore(): void {
    const tenantsArray = Array.from(this.tenants.values());
    const tokensArray = Array.from(this.tokens.values());
    saveState('tenants', {
      tenants: tenantsArray,
      tokens: tokensArray,
    });
  }

  private loadFromStore(): void {
    const saved = loadState<{
      tenants: TenantStorageRecord[];
      tokens: ApiTokenStorageRecord[];
    }>('tenants');

    if (!saved) {
      logger.info('No tenant data found; starting fresh');
      return;
    }

    for (const record of saved.tenants) {
      this.tenants.set(record.id, record);
    }

    for (const record of saved.tokens) {
      this.tokens.set(record.apiKey, record);
    }

    logger.info(`Loaded tenants and tokens`, {
      tenantCount: this.tenants.size,
      tokenCount: this.tokens.size,
    });
  }
}

let instance: TenantDatabase | null = null;

export function getTenantDatabase(): TenantDatabase {
  if (!instance) {
    instance = new TenantDatabase();
  }
  return instance;
}
