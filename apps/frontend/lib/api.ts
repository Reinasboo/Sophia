/**
 * API Client
 *
 * Handles all API communication with the backend.
 * The frontend is READ-ONLY for observing system state.
 *
 * MULTI-TENANT FIX: All requests now include tenant auth via Bearer token
 * DEDUPLICATION FIX: Read-only requests use request deduplication layer to reduce 429 errors
 */

import type {
  Agent,
  AgentDetail,
  SystemStats,
  Transaction,
  SystemEvent,
  ApiResponse,
  ExternalAgent,
  ExternalAgentDetail,
  IntentHistoryRecord,
  StrategyDefinition,
  BYOARegistrationResult,
  ServicePolicy,
  WithdrawalRecord,
  X402PaymentDescriptor,
} from './types';
import { getCurrentTenantApiKey } from './privy-provider';
import { cachedFetch, requestDeduplicator } from './request-deduplication';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://sophia-production-1a83.up.railway.app';

// C-1 FIX: Admin key is NEVER embedded in frontend JavaScript.
// Mutation requests are proxied through the Next.js API route at
// /api/proxy-admin which injects the key server-side from a
// server-only environment variable (no NEXT_PUBLIC_ prefix).
// Direct browser calls to mutation endpoints will be rejected.

/** Get tenant API key from in-memory session state. */
function getTenantApiKey(): string | null {
  return getCurrentTenantApiKey();
}

function isLikelyValidApiKey(token: string): boolean {
  if (!token) {
    return false;
  }

  if (token.startsWith('bearer_')) {
    return true;
  }

  return token.split('.').length === 3;
}

/** Headers for authenticated requests (includes tenant Bearer token) */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const apiKey = getTenantApiKey();

  // MULTI-TENANT FIX: Include API key as Bearer token for all requests
  if (apiKey && isLikelyValidApiKey(apiKey)) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}

/** Headers for admin-authenticated mutation requests (proxied server-side) */
function adminHeaders(): Record<string, string> {
  // No key exposed here — the Next.js proxy route handles injection.
  return {};
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const method = options?.method?.toUpperCase() ?? 'GET';
    const requestUrl =
      method === 'GET'
        ? `${API_BASE}${endpoint}`
        : `/api/proxy-admin?path=${encodeURIComponent(endpoint)}`;

    const response = await fetch(requestUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        // Always include auth headers for both GET and mutations
        // GET requests go directly to backend
        // Mutations go through proxy-admin which passes Authorization through
        ...authHeaders(),
        ...options?.headers,
      },
    });

    // M-6: Check HTTP status before parsing JSON
    if (!response.ok) {
      // Try to parse error body, fall back to status text
      try {
        const errorData = await response.json();
        return errorData as ApiResponse<T>;
      } catch {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date(),
        } as ApiResponse<T>;
      }
    }

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    } as ApiResponse<T>;
  }
}

// Health check
export async function checkHealth(): Promise<ApiResponse<{ status: string }>> {
  // Health is read-only, cache for 30 seconds, serve stale for up to 60 seconds
  return cachedFetch(`${API_BASE}/api/health`, { ttl: 30000, staleTtl: 60000 });
}

// Stats - high traffic endpoint, cache aggressively
export async function getStats(): Promise<ApiResponse<SystemStats>> {
  // Cache for 5 seconds, serve stale for 15 seconds
  return cachedFetch(`${API_BASE}/api/stats`, { ttl: 5000, staleTtl: 15000 });
}

export async function getMonitoringCache(): Promise<ApiResponse<any>> {
  return cachedFetch(`${API_BASE}/api/monitoring/cache`, { ttl: 10000, staleTtl: 30000 });
}

export async function getRateLimitStats(): Promise<ApiResponse<any>> {
  return cachedFetch(`${API_BASE}/api/monitoring/rate-limits`, { ttl: 10000, staleTtl: 30000 });
}

// Agents - high traffic endpoint, cache with moderate TTL
export async function getAgents(): Promise<ApiResponse<Agent[]>> {
  // Cache for 5 seconds, serve stale for 15 seconds
  return cachedFetch(`${API_BASE}/api/agents`, { ttl: 5000, staleTtl: 15000 });
}

export async function getAgent(id: string): Promise<ApiResponse<AgentDetail>> {
  // Cache individual agent for 3 seconds (more frequently accessed)
  return cachedFetch(`${API_BASE}/api/agents/${id}`, { ttl: 3000, staleTtl: 10000 });
}

export async function createAgent(data: {
  name: string;
  strategy: string;
  strategyParams?: Record<string, unknown>;
  executionSettings?: {
    cycleIntervalMs?: number;
    maxActionsPerDay?: number;
    enabled?: boolean;
  };
}): Promise<ApiResponse<Agent>> {
  return fetchApi('/api/agents', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateAgentConfig(
  id: string,
  data: {
    strategyParams?: Record<string, unknown>;
    executionSettings?: {
      cycleIntervalMs?: number;
      maxActionsPerDay?: number;
      enabled?: boolean;
    };
  }
): Promise<ApiResponse<Agent>> {
  return fetchApi(`/api/agents/${id}/config`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function startAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/agents/${id}/start`, {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export async function stopAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/agents/${id}/stop`, {
    method: 'POST',
    headers: adminHeaders(),
  });
}

// Withdrawals
export async function requestWithdrawal(
  agentId: string,
  data: {
    recipient: string;
    amount?: number;
    description?: string;
  }
): Promise<ApiResponse<WithdrawalRecord>> {
  return fetchApi(`/api/agents/${agentId}/withdraw`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function executeWithdrawal(
  withdrawalId: string
): Promise<ApiResponse<WithdrawalRecord>> {
  return fetchApi(`/api/withdrawals/${withdrawalId}/execute`, {
    method: 'POST',
    headers: adminHeaders(),
  });
}

export async function getWithdrawals(
  limit?: number,
  offset?: number
): Promise<ApiResponse<WithdrawalRecord[]>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (offset) params.append('offset', offset.toString());
  const queryString = params.toString();
  return cachedFetch(`${API_BASE}/api/withdrawals${queryString ? `?${queryString}` : ''}`, {
    ttl: 5000,
    staleTtl: 15000,
  });
}

export async function getAgentWithdrawals(
  agentId: string,
  limit?: number,
  offset?: number
): Promise<ApiResponse<WithdrawalRecord[]>> {
  const params = new URLSearchParams();
  if (limit) params.append('limit', limit.toString());
  if (offset) params.append('offset', offset.toString());
  const queryString = params.toString();
  return cachedFetch(`${API_BASE}/api/agents/${agentId}/withdrawals${queryString ? `?${queryString}` : ''}`, {
    ttl: 5000,
    staleTtl: 15000,
  });
}

export async function getWithdrawal(withdrawalId: string): Promise<ApiResponse<WithdrawalRecord>> {
  return cachedFetch(`${API_BASE}/api/withdrawals/${withdrawalId}`, { ttl: 10000, staleTtl: 30000 });
}

// Transactions
export async function getTransactions(): Promise<ApiResponse<Transaction[]>> {
  return cachedFetch(`${API_BASE}/api/transactions`, { ttl: 5000, staleTtl: 15000 });
}

export async function getTransaction(signature: string): Promise<ApiResponse<any>> {
  return cachedFetch(`${API_BASE}/api/data/transactions/${signature}`, { ttl: 30000, staleTtl: 60000 });
}

// Events
export async function getEvents(count?: number): Promise<ApiResponse<SystemEvent[]>> {
  const params = count ? `?count=${count}` : '';
  return cachedFetch(`${API_BASE}/api/events${params}`, { ttl: 5000, staleTtl: 15000 });
}

// Explorer URL
export async function getExplorerUrl(signature: string): Promise<ApiResponse<{ url: string }>> {
  return cachedFetch(`${API_BASE}/api/explorer/${signature}`, { ttl: 60000, staleTtl: 120000 });
}

/**
 * Derive WebSocket URL from environment or current location
 * Priority:
 * 1. NEXT_PUBLIC_WS_URL (if set in environment)
 * 2. Derived from NEXT_PUBLIC_API_URL (convert http/https to ws/wss)
 * 3. Derived from window.location (for client-side fallback)
 * 4. Localhost fallback (dev only)
 */
function getWebSocketUrl(): string {
  // 1. Try explicit env var
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  // 2. Derive from API URL (http/https -> ws/wss)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    if (apiUrl.startsWith('https://')) {
      return apiUrl.replace(/^https:/, 'wss:');
    }
    if (apiUrl.startsWith('http://')) {
      return apiUrl.replace(/^http:/, 'ws:');
    }
  }

  // 3. Derive from current location (client-side)
  if (typeof window !== 'undefined' && window.location) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }

  // 4. Fallback to localhost (development only)
  return 'ws://localhost:3002';
}

// WebSocket connection
export function createWebSocket(
  onMessage: (event: SystemEvent) => void,
  onConnect?: () => void,
  onDisconnect?: () => void
): WebSocket | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const wsUrl = getWebSocketUrl();
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('WebSocket connected');
    }
    onConnect?.();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to parse WebSocket message:', error);
      }
    }
  };

  ws.onclose = () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('WebSocket disconnected');
    }
    onDisconnect?.();
  };

  ws.onerror = (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('WebSocket error:', error);
    }
  };

  return ws;
}

// ============================================\n// Strategy API\n// ============================================

export async function getStrategies(): Promise<ApiResponse<StrategyDefinition[]>> {
  return cachedFetch(`${API_BASE}/api/strategies`, { ttl: 60000, staleTtl: 120000 });
}

export async function getStrategy(name: string): Promise<ApiResponse<StrategyDefinition>> {
  return cachedFetch(`${API_BASE}/api/strategies/${name}`, { ttl: 60000, staleTtl: 120000 });
}

// ============================================
// BYOA (Bring Your Own Agent) API
// ============================================

export async function registerExternalAgent(data: {
  agentName: string;
  agentType: 'local' | 'remote';
  agentEndpoint?: string;
  supportedIntents: string[];
  verificationMethods?: string[];
  metadata?: Record<string, unknown>;
}): Promise<ApiResponse<BYOARegistrationResult>> {
  return fetchApi('/api/byoa/register', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function getExternalAgents(): Promise<ApiResponse<ExternalAgent[]>> {
  return cachedFetch(`${API_BASE}/api/byoa/agents`, { ttl: 5000, staleTtl: 15000 });
}

export async function getExternalAgent(id: string): Promise<ApiResponse<ExternalAgentDetail>> {
  return cachedFetch(`${API_BASE}/api/byoa/agents/${id}`, { ttl: 5000, staleTtl: 15000 });
}

export async function getExternalIntents(
  agentId?: string,
  limit?: number
): Promise<ApiResponse<IntentHistoryRecord[]>> {
  if (agentId) {
    const params = limit ? `?limit=${limit}` : '';
    return cachedFetch(`${API_BASE}/api/byoa/agents/${agentId}/intents${params}`, {
      ttl: 5000,
      staleTtl: 15000,
    });
  }
  const params = limit ? `?limit=${limit}` : '';
  return cachedFetch(`${API_BASE}/api/byoa/intents${params}`, { ttl: 5000, staleTtl: 15000 });
}

/**
 * Get ALL intent history (both built-in and BYOA agents).
 */
export async function getAllIntentHistory(
  limit?: number
): Promise<ApiResponse<IntentHistoryRecord[]>> {
  const params = limit ? `?limit=${limit}` : '';
  return cachedFetch(`${API_BASE}/api/intents${params}`, { ttl: 5000, staleTtl: 15000 });
}

export async function deactivateExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/deactivate`, { method: 'POST', headers: adminHeaders() });
}

export async function activateExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/activate`, { method: 'POST', headers: adminHeaders() });
}

export async function generateAgentChallenge(agentId: string): Promise<
  ApiResponse<{
    challenge: string;
    expiresIn: number;
    instruction: string;
  }>
> {
  return fetchApi('/api/byoa/verify/challenge-generate', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ agentId }),
  });
}

export async function verifyChallengeResponse(
  agentId: string,
  challengeResponse: string
): Promise<
  ApiResponse<{
    verified: boolean;
    message: string;
  }>
> {
  return fetchApi('/api/byoa/verify/challenge-submit', {
    method: 'POST',
    body: JSON.stringify({ agentId, challengeResponse }),
  });
}

export async function revokeExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/revoke`, { method: 'POST', headers: adminHeaders() });
}

export async function getServicePolicies(): Promise<ApiResponse<ServicePolicy[]>> {
  return cachedFetch(`${API_BASE}/api/byoa/service-policies`, { ttl: 30000, staleTtl: 60000 });
}

export async function getServicePolicy(serviceId: string): Promise<ApiResponse<ServicePolicy>> {
  return cachedFetch(`${API_BASE}/api/byoa/service-policies/${serviceId}`, {
    ttl: 30000,
    staleTtl: 60000,
  });
}

export async function createServicePolicy(
  data: ServicePolicy
): Promise<ApiResponse<ServicePolicy>> {
  return fetchApi('/api/byoa/service-policies', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateServicePolicy(
  serviceId: string,
  data: Partial<ServicePolicy>
): Promise<ApiResponse<ServicePolicy>> {
  return fetchApi(`/api/byoa/service-policies/${serviceId}`, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function createX402Descriptor(
  serviceId: string,
  data: { paymentAddress: string; amount: number; durationSeconds?: number }
): Promise<
  ApiResponse<{
    serviceId: string;
    tenantId: string;
    policy: ServicePolicy;
    descriptor: X402PaymentDescriptor;
    encodedHeader: string;
  }>
> {
  return fetchApi(`/api/byoa/service-policies/${serviceId}/x402-descriptor`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
