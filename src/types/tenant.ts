/**
 * Tenant Types
 *
 * Defines multi-tenant architecture types for Sophia.
 * Each user (tenant) has isolated wallets, agents, and transaction history.
 * All user-scoped data is keyed by tenantId.
 */

import type { PublicKey } from '@solana/web3.js';

/**
 * Tenant — Represents a user or organization with isolated infrastructure.
 */
export interface Tenant {
  /** Unique tenant ID (e.g., 'user_123abc', derived from wallet pubkey or managed ID) */
  readonly id: string;
  /** User's Solana wallet public key (optional; can be assigned after signup) */
  readonly publicKey?: PublicKey | string;
  /** Human-readable label (display name) */
  readonly label: string;
  /** UTC creation timestamp */
  readonly createdAt: Date;
  /** Optional metadata (subscription tier, preferences, etc.) */
  readonly metadata?: Record<string, unknown>;
}

/**
 * TenantContext — Request context carrying tenant identification.
 * Attached to every API request to ensure proper isolation.
 */
export interface TenantContext {
  /** Tenant ID from auth token or header */
  readonly tenantId: string;
  /** Optional user ID within tenant (for multi-user orgs) */
  readonly userId?: string;
  /** API key or session token */
  readonly apiKey: string;
}

/**
 * API Token — Bearer token issued to tenant after signup/signin.
 */
export interface ApiToken {
  readonly tenantId: string;
  readonly apiKey: string;
  readonly createdAt: Date;
  /** Optional expiration; if null, never expires */
  readonly expiresAt?: Date;
  /** Token label for tracking (e.g., "Mobile App", "CLI") */
  readonly label?: string;
}

/**
 * TenantSession — In-memory session tracking for active tenants.
 * Used to cache tenant context and reduce database lookups.
 */
export interface TenantSession {
  readonly tenantId: string;
  readonly tenant: Tenant;
  readonly apiToken: ApiToken;
  /** Timestamp of last activity */
  readonly lastActiveAt: Date;
}

/**
 * Tenant storage schema — persisted to disk/database.
 */
export interface TenantStorageRecord {
  id: string;
  publicKey?: string;
  label: string;
  createdAt: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

/**
 * API Token storage schema — persisted to disk/database.
 */
export interface ApiTokenStorageRecord {
  tenantId: string;
  apiKey: string;
  createdAt: string; // ISO 8601
  expiresAt?: string; // ISO 8601
  label?: string;
  hashedSecret: string; // SHA256 hash for safe storage
}
