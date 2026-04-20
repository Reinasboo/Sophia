/**
 * Agent Adapter
 *
 * Provides a unified interface for communicating with external agents,
 * regardless of whether they are local (in-process adapters) or remote
 * (HTTP endpoints).
 *
 * The adapter can:
 * - Call a remote agent's API to request intents or deliver results
 * - Invoke a local adapter function for in-process agents
 * - Probe health / readiness of remote agents
 *
 * This layer does NOT handle signing or key material — it is purely a
 * communication shim between the platform and the external agent.
 */

import { createLogger } from '../utils/logger.js';
import { Result, success, failure } from '../types/shared.js';
import { ExternalAgentInfo, SupportedIntentType } from './agentRegistry.js';
import { IntentResult } from './intentRouter.js';

const logger = createLogger('BYOA_ADAPTER');

/**
 * H-2 FIX: Validate a remote endpoint URL before making any HTTP request.
 * Rejects non-HTTP(S) schemes, credentials, and RFC-1918 / loopback addresses.
 * (Mirrors validateAgentEndpoint in agentRegistry.ts — defence-in-depth.)
 */
function isSafeEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '::1' || h.startsWith('127.')) return false;
    if (h.startsWith('169.254.') || h.startsWith('fe80')) return false;
    if (h.startsWith('10.') || h.startsWith('192.168.')) return false;
    if (h.includes('::ffff:')) return false;
    const p = h.split('.');
    if (
      p.length === 4 &&
      p[0] === '172' &&
      parseInt(p[1] ?? '', 10) >= 16 &&
      parseInt(p[1] ?? '', 10) <= 31
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────
// Adapter interfaces
// ────────────────────────────────────────────

/** Payload sent to the external agent for awareness / callbacks */
export interface AgentNotification {
  readonly event: 'intent_result' | 'wallet_funded' | 'ping';
  readonly agentId: string;
  readonly data?: Record<string, unknown>;
}

/** Response from an external agent (optional) */
export interface AgentCallbackResponse {
  readonly acknowledged: boolean;
  readonly intents?: Array<{
    type: SupportedIntentType;
    params: Record<string, unknown>;
  }>;
}

/**
 * Local agent adapter function signature.
 * A developer can register an in-process function that the platform
 * will invoke instead of making HTTP calls.
 */
export type LocalAdapterFn = (notification: AgentNotification) => Promise<AgentCallbackResponse>;

// ────────────────────────────────────────────
// Agent Adapter
// ────────────────────────────────────────────

export class AgentAdapter {
  /** Local adapters keyed by agentId */
  private localAdapters: Map<string, LocalAdapterFn> = new Map();
  private httpTimeoutMs: number;

  constructor(httpTimeoutMs: number = 10_000) {
    this.httpTimeoutMs = httpTimeoutMs;
  }

  // ── Local adapter management ─────────────

  registerLocalAdapter(agentId: string, fn: LocalAdapterFn): void {
    this.localAdapters.set(agentId, fn);
    logger.info('Local adapter registered', { agentId });
  }

  removeLocalAdapter(agentId: string): void {
    this.localAdapters.delete(agentId);
    logger.info('Local adapter removed', { agentId });
  }

  // ── Notify ───────────────────────────────

  /**
   * Send a notification to the external agent (fire-and-forget safe).
   * For remote agents: HTTP POST to their endpoint.
   * For local agents: invoke the registered adapter function.
   */
  async notify(
    agent: ExternalAgentInfo,
    notification: AgentNotification
  ): Promise<Result<AgentCallbackResponse, Error>> {
    try {
      if (agent.type === 'local') {
        return this.notifyLocal(agent.id, notification);
      } else {
        return this.notifyRemote(agent, notification);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to notify external agent', { agentId: agent.id, error: msg });
      return failure(new Error(msg));
    }
  }

  // ── Probe agent health ───────────────────

  async probeHealth(agent: ExternalAgentInfo): Promise<Result<boolean, Error>> {
    if (agent.type === 'local') {
      const hasAdapter = this.localAdapters.has(agent.id);
      return success(hasAdapter);
    }

    if (!agent.endpoint) {
      return failure(new Error('Agent has no endpoint configured'));
    }

    // H-2 FIX: Reject requests to private/loopback addresses.
    if (!isSafeEndpoint(agent.endpoint)) {
      logger.warn('Blocked health probe to unsafe endpoint', {
        agentId: agent.id,
        endpoint: agent.endpoint,
      });
      return failure(new Error('Agent endpoint is not a safe public URL'));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.httpTimeoutMs);

      const response = await fetch(`${agent.endpoint}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return success(response.ok);
    } catch (error) {
      return success(false);
    }
  }

  // ── Deliver intent result ────────────────

  /**
   * Convenience method to deliver an intent execution result
   * back to the external agent (optional callback).
   */
  async deliverResult(agent: ExternalAgentInfo, intentResult: IntentResult): Promise<void> {
    const notification: AgentNotification = {
      event: 'intent_result',
      agentId: agent.id,
      data: {
        intentId: intentResult.intentId,
        status: intentResult.status,
        type: intentResult.type,
        result: intentResult.result,
        error: intentResult.error,
      },
    };

    // Best-effort delivery; failures are logged but not propagated
    await this.notify(agent, notification);
  }

  // ── Internal ─────────────────────────────

  private async notifyLocal(
    agentId: string,
    notification: AgentNotification
  ): Promise<Result<AgentCallbackResponse, Error>> {
    const adapter = this.localAdapters.get(agentId);
    if (!adapter) {
      return failure(new Error(`No local adapter registered for agent ${agentId}`));
    }

    const response = await adapter(notification);
    return success(response);
  }

  private async notifyRemote(
    agent: ExternalAgentInfo,
    notification: AgentNotification
  ): Promise<Result<AgentCallbackResponse, Error>> {
    if (!agent.endpoint) {
      return failure(new Error(`Remote agent "${agent.name}" has no endpoint`));
    }

    // H-2 FIX: Block SSRF to private/loopback addresses.
    if (!isSafeEndpoint(agent.endpoint)) {
      logger.warn('Blocked notification to unsafe endpoint', {
        agentId: agent.id,
        endpoint: agent.endpoint,
      });
      return failure(new Error('Agent endpoint is not a safe public URL'));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.httpTimeoutMs);

    try {
      const response = await fetch(`${agent.endpoint}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return failure(new Error(`Remote agent returned ${response.status}`));
      }

      const body = (await response.json()) as AgentCallbackResponse;
      return success(body);
    } catch (error) {
      clearTimeout(timeout);
      const msg = error instanceof Error ? error.message : String(error);
      return failure(new Error(`Failed to reach remote agent: ${msg}`));
    }
  }
}

// ── Singleton ──────────────────────────────

let adapterInstance: AgentAdapter | null = null;

export function getAgentAdapter(): AgentAdapter {
  if (!adapterInstance) {
    adapterInstance = new AgentAdapter();
  }
  return adapterInstance;
}
