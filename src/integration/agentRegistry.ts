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
import { Result, success, failure } from '../utils/types.js';
import { saveState, loadState } from '../utils/store.js';

const logger = createLogger('BYOA_REGISTRY');

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export type ExternalAgentType = 'local' | 'remote';
export type ExternalAgentStatus = 'registered' | 'active' | 'inactive' | 'revoked';

export type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS';

export interface ExternalAgentRegistration {
  readonly agentName: string;
  readonly agentType: ExternalAgentType;
  readonly agentEndpoint?: string;           // Required for remote agents
  readonly supportedIntents: SupportedIntentType[];
  readonly metadata?: Record<string, unknown>;
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
  readonly controlTokenHash: string;         // SHA-256 hash — raw token never stored
  readonly createdAt: Date;
  readonly lastActiveAt?: Date;
  readonly metadata?: Record<string, unknown>;
}

/** Public-safe view (no token hash) */
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
}

export interface RegistrationResult {
  readonly agentId: string;
  readonly controlToken: string;             // Returned ONCE
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
    interface SavedBYOA { agents: ExternalAgentRecord[] }
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
