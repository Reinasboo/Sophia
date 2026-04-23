/**
 * Agent Registry
 *
 * Manages external agent registration for the Bring-Your-Own-Agent (BYOA) flow.
 * External agents register here and receive a scoped control token that authorises
 * intent submission against the wallet bound to that agent.
 *
 * SECURITY:
 * - Control tokens are cryptographically random (256-bit)
 * - Tokens are stored hashed; raw token is returned ONCE at registration
 * - Tokens scope access to exactly one wallet
 */

import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import { Result, success, failure } from '../types/index.js';
import { ExternalAgentType, ExternalAgentStatus, SupportedIntentType } from '../types/shared.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('BYOA_REGISTRY');

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
// ExternalAgentType, ExternalAgentStatus, SupportedIntentType are re-exported from types/shared

export type {
  ExternalAgentType,
  ExternalAgentStatus,
  SupportedIntentType,
} from '../types/shared.js';

export interface ExternalAgentRegistration {
  readonly agentName: string;
  readonly agentType: ExternalAgentType;
  readonly agentEndpoint?: string; // Required for remote agents
  readonly supportedIntents: SupportedIntentType[];
  readonly metadata?: Record<string, unknown>;
  readonly verificationMethods?: string[]; // 'none' | 'challenge-response' | 'hmac-signature'
}

export interface ExternalAgentRecord {
  readonly id: string;
  readonly name: string;
  readonly type: ExternalAgentType;
  readonly endpoint?: string;
  readonly supportedIntents: SupportedIntentType[];
  readonly status: ExternalAgentStatus;
  readonly walletId?: string;
  readonly walletPublicKey?: string;
  readonly controlTokenHash: string; // SHA-256 hash — raw token never stored
  readonly createdAt: Date;
  readonly lastActiveAt?: Date;
  readonly metadata?: Record<string, unknown>;
  readonly verificationMethods?: string[]; // 'none' | 'challenge-response' | 'hmac-signature'
  readonly challengeToken?: string; // Challenge to be verified for challenge-response
  readonly challengeVerified?: boolean; // Whether challenge was completed
  readonly hmacSecret?: string; // Secret for HMAC webhook signatures (shown once)
}

/** Public-safe view (no token hash, no secrets) */
export interface ExternalAgentInfo {
  readonly id: string;
  readonly name: string;
  readonly type: ExternalAgentType;
  readonly endpoint?: string;
  readonly supportedIntents: SupportedIntentType[];
  readonly status: ExternalAgentStatus;
  readonly walletId?: string;
  readonly walletPublicKey?: string;
  readonly createdAt: Date;
  readonly lastActiveAt?: Date;
  readonly metadata?: Record<string, unknown>;
  readonly verificationMethods?: string[];
  readonly challengeVerified?: boolean;
}

export interface RegistrationResult {
  readonly agentId: string;
  readonly controlToken: string; // Returned ONCE
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function generateControlToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * H-2 FIX: Validate an agent endpoint URL to prevent SSRF.
 * Returns an error string if invalid, or null if the URL is safe.
 *
 * Rules:
 * - Must be http:// or https://
 * - Hostname must not resolve to loopback, link-local, or RFC-1918 private ranges
 *   (checked textually — DNS rebind protection is out of scope here)
 * - Must not contain credentials (user:pass@)
 */
function validateAgentEndpoint(endpoint: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return 'must be a valid URL';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'must use http or https scheme';
  }

  if (parsed.username || parsed.password) {
    return 'must not contain credentials';
  }

  const host = parsed.hostname.toLowerCase();

  // Block loopback
  if (host === 'localhost' || host === '::1' || host.startsWith('127.')) {
    return 'must not target loopback addresses';
  }

  // Block link-local (169.254.x.x, fe80::)
  if (host.startsWith('169.254.') || host.startsWith('fe80')) {
    return 'must not target link-local addresses';
  }

  // Block RFC-1918 private ranges: 10.x, 172.16-31.x, 192.168.x
  if (host.startsWith('10.')) return 'must not target private network addresses';
  const parts = host.split('.');
  if (
    parts.length === 4 &&
    parts[0] === '172' &&
    parseInt(parts[1] ?? '', 10) >= 16 &&
    parseInt(parts[1] ?? '', 10) <= 31
  ) {
    return 'must not target private network addresses';
  }
  if (host.startsWith('192.168.')) return 'must not target private network addresses';

  // Block IPv4-mapped IPv6 addresses like ::ffff:192.168.1.1
  if (host.includes('::ffff:')) return 'must not target private network addresses';

  return null;
}

// ────────────────────────────────────────────
// Agent Registry
// ────────────────────────────────────────────

export class AgentRegistry {
  private agents: Map<string, ExternalAgentRecord> = new Map();
  /** Reverse lookup from tokenHash → agentId for fast auth */
  private tokenIndex: Map<string, string> = new Map();
  private maxAgents: number;

  constructor(maxAgents: number = 50) {
    this.maxAgents = maxAgents;
    this.loadFromStore();
  }

  // ── Persistence ──────────────────────────

  private saveToStore(): void {
    const agents = Array.from(this.agents.values());
    saveState('byoa-agents', { agents });
  }

  private loadFromStore(): void {
    interface SavedBYOA {
      agents: ExternalAgentRecord[];
    }
    const saved = loadState<SavedBYOA>('byoa-agents');
    if (!saved?.agents?.length) return;

    let restored = 0;
    for (const raw of saved.agents) {
      const record: ExternalAgentRecord = {
        ...raw,
        createdAt: new Date(raw.createdAt),
        lastActiveAt: raw.lastActiveAt ? new Date(raw.lastActiveAt) : undefined,
      };
      this.agents.set(record.id, record);
      // Only index non-revoked agents
      if (record.status !== 'revoked') {
        this.tokenIndex.set(record.controlTokenHash, record.id);
      }
      restored++;
    }
    logger.info('BYOA agents restored from disk', { count: restored });
  }

  // ── Registration ─────────────────────────

  register(reg: ExternalAgentRegistration): Result<RegistrationResult, Error> {
    // Validate
    if (!reg.agentName || reg.agentName.trim().length === 0) {
      return failure(new Error('Agent name is required'));
    }
    if (reg.agentName.length > 100) {
      return failure(new Error('Agent name must be 100 characters or fewer'));
    }
    if (reg.agentType === 'remote' && !reg.agentEndpoint) {
      return failure(new Error('Remote agents must provide an endpoint URL'));
    }
    // H-2 FIX: Validate endpoint URL to prevent SSRF (internal IP scanning).
    if (reg.agentEndpoint) {
      const endpointError = validateAgentEndpoint(reg.agentEndpoint);
      if (endpointError) {
        return failure(new Error(`Invalid agent endpoint: ${endpointError}`));
      }
    }
    if (!reg.supportedIntents || reg.supportedIntents.length === 0) {
      return failure(new Error('At least one supported intent type is required'));
    }
    if (this.agents.size >= this.maxAgents) {
      return failure(new Error(`Maximum external agent limit reached (${this.maxAgents})`));
    }

    // Check duplicate name
    for (const agent of this.agents.values()) {
      if (agent.name === reg.agentName && agent.status !== 'revoked') {
        return failure(new Error(`An active agent with name "${reg.agentName}" already exists`));
      }
    }

    const agentId = uuidv4();
    const controlToken = generateControlToken();
    const controlTokenHash = hashToken(controlToken);

    const record: ExternalAgentRecord = {
      id: agentId,
      name: reg.agentName,
      type: reg.agentType,
      endpoint: reg.agentEndpoint,
      supportedIntents: [...reg.supportedIntents],
      status: 'registered',
      controlTokenHash,
      createdAt: new Date(),
      metadata: reg.metadata,
      verificationMethods: reg.verificationMethods || ['none'],
      challengeVerified: false,
    };

    this.agents.set(agentId, record);
    this.tokenIndex.set(controlTokenHash, agentId);
    this.saveToStore();

    logger.info('External agent registered', {
      agentId,
      name: reg.agentName,
      type: reg.agentType,
    });

    return success({ agentId, controlToken });
  }

  // ── Wallet Binding ───────────────────────

  bindWallet(agentId: string, walletId: string, walletPublicKey: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    if (agent.walletId) {
      return failure(new Error(`Agent "${agent.name}" already has a bound wallet`));
    }

    this.agents.set(agentId, {
      ...agent,
      walletId,
      walletPublicKey,
      status: 'active',
    });
    this.saveToStore();

    logger.info('Wallet bound to external agent', { agentId, walletId, walletPublicKey });
    return success(true);
  }

  // ── Auth ─────────────────────────────────

  /** Authenticate a bearer token and return the agent record */
  authenticateToken(token: string): Result<ExternalAgentRecord, Error> {
    const tokenHash = hashToken(token);
    const agentId = this.tokenIndex.get(tokenHash);

    if (!agentId) {
      return failure(new Error('Invalid control token'));
    }

    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error('Agent record not found'));
    }
    if (agent.status === 'revoked') {
      return failure(new Error('Agent has been revoked'));
    }

    // Touch lastActiveAt
    this.agents.set(agentId, { ...agent, lastActiveAt: new Date() });

    return success(this.agents.get(agentId)!);
  }

  // ── Queries ──────────────────────────────

  getAgent(agentId: string): Result<ExternalAgentInfo, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    return success(this.toPublicInfo(agent));
  }

  getAllAgents(): ExternalAgentInfo[] {
    return Array.from(this.agents.values()).map((a) => this.toPublicInfo(a));
  }

  getActiveAgents(): ExternalAgentInfo[] {
    return this.getAllAgents().filter((a) => a.status === 'active');
  }

  // ── Lifecycle ────────────────────────────

  deactivateAgent(agentId: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    this.agents.set(agentId, { ...agent, status: 'inactive' });
    this.saveToStore();
    logger.info('External agent deactivated', { agentId });
    return success(true);
  }

  activateAgent(agentId: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    if (!agent.walletId) {
      return failure(new Error('Agent has no bound wallet; cannot activate'));
    }
    this.agents.set(agentId, { ...agent, status: 'active' });
    this.saveToStore();
    logger.info('External agent activated', { agentId });
    return success(true);
  }

  revokeAgent(agentId: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    this.agents.set(agentId, { ...agent, status: 'revoked' });
    this.tokenIndex.delete(agent.controlTokenHash);
    this.saveToStore();
    logger.info('External agent revoked', { agentId });
    return success(true);
  }

  /**
   * Rotate the control token for an agent.
   *
   * Generates a new 256-bit control token, invalidates the old one, and keeps
   * the agent's wallet binding intact. Use this to recover access after a token
   * is lost or suspected-compromised. The new token is returned once — store
   * it securely.
   */
  rotateToken(agentId: string): Result<string, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    if (agent.status === 'revoked') {
      return failure(new Error('Cannot rotate token for a revoked agent'));
    }

    // Remove old token hash from index
    this.tokenIndex.delete(agent.controlTokenHash);

    // Generate and register new token
    const newToken = generateControlToken();
    const newHash = hashToken(newToken);

    this.agents.set(agentId, { ...agent, controlTokenHash: newHash });
    this.tokenIndex.set(newHash, agentId);
    this.saveToStore();

    logger.info('Control token rotated for external agent', { agentId, name: agent.name });
    return success(newToken);
  }

  // ── Verification ─────────────────────────

  /**
   * Set a challenge for an agent to verify webhook endpoint ownership.
   * Challenge expires after 5 minutes.
   */
  setChallenge(agentId: string, challenge: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }

    this.agents.set(agentId, {
      ...agent,
      challengeToken: challenge,
      challengeVerified: false,
    });
    this.saveToStore();

    logger.info('Challenge set for agent verification', { agentId });
    return success(true);
  }

  /**
   * Verify challenge response from agent.
   * Agent must respond with the exact challenge that was set.
   */
  verifyChallengeResponse(agentId: string, response: string): Result<true, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    if (!agent.challengeToken) {
      return failure(new Error('No active challenge for this agent'));
    }
    if (response !== agent.challengeToken) {
      return failure(new Error('Challenge response does not match'));
    }

    this.agents.set(agentId, {
      ...agent,
      challengeVerified: true,
      challengeToken: undefined, // Clear the used challenge
    });
    this.saveToStore();

    logger.info('Challenge verified for agent endpoint', { agentId });
    return success(true);
  }

  /**
   * Generate HMAC secret for webhook signature verification.
   * This secret is returned once and must be stored securely by the agent.
   */
  generateHmacSecret(agentId: string): Result<string, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }

    // Generate 32-byte random secret using cryptographically secure randomBytes
    const secret = randomBytes(32).toString('hex');

    this.agents.set(agentId, { ...agent, hmacSecret: secret });
    this.saveToStore();

    logger.info('HMAC secret generated for external agent', { agentId });
    return success(secret);
  }

  /**
   * Get HMAC secret for an agent (not shown to public — for internal use only).
   */
  getHmacSecret(agentId: string): Result<string | undefined, Error> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return failure(new Error(`External agent not found: ${agentId}`));
    }
    return success(agent.hmacSecret);
  }

  // ── Internal ─────────────────────────────

  private toPublicInfo(record: ExternalAgentRecord): ExternalAgentInfo {
    return {
      id: record.id,
      name: record.name,
      type: record.type,
      endpoint: record.endpoint,
      supportedIntents: record.supportedIntents,
      status: record.status,
      walletId: record.walletId,
      walletPublicKey: record.walletPublicKey,
      createdAt: record.createdAt,
      lastActiveAt: record.lastActiveAt,
      metadata: record.metadata,
      verificationMethods: record.verificationMethods,
      challengeVerified: record.challengeVerified,
    };
  }
}

// ── Singleton ──────────────────────────────

let registryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}
