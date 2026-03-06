/**
 * API Client
 *
 * Handles all API communication with the backend.
 * The frontend is READ-ONLY for observing system state.
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
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// C-1 FIX: Admin key is NEVER embedded in frontend JavaScript.
// Mutation requests are proxied through the Next.js API route at
// /api/proxy-admin which injects the key server-side from a
// server-only environment variable (no NEXT_PUBLIC_ prefix).
// Direct browser calls to mutation endpoints will be rejected.

/** Headers for admin-authenticated mutation requests (proxied server-side) */
function adminHeaders(): Record<string, string> {
  // No key exposed here — the Next.js proxy route handles injection.
  return {};
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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
          timestamp: new Date().toISOString(),
        };
      }
    }

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

// Health check
export async function checkHealth(): Promise<ApiResponse<{ status: string }>> {
  return fetchApi('/api/health');
}

// Stats
export async function getStats(): Promise<ApiResponse<SystemStats>> {
  return fetchApi('/api/stats');
}

// Agents
export async function getAgents(): Promise<ApiResponse<Agent[]>> {
  return fetchApi('/api/agents');
}

export async function getAgent(id: string): Promise<ApiResponse<AgentDetail>> {
  return fetchApi(`/api/agents/${id}`);
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

// Transactions
export async function getTransactions(): Promise<ApiResponse<Transaction[]>> {
  return fetchApi('/api/transactions');
}

// Events
export async function getEvents(count?: number): Promise<ApiResponse<SystemEvent[]>> {
  const params = count ? `?count=${count}` : '';
  return fetchApi(`/api/events${params}`);
}

// Explorer URL
export async function getExplorerUrl(signature: string): Promise<ApiResponse<{ url: string }>> {
  return fetchApi(`/api/explorer/${signature}`);
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

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002';
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    onConnect?.();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    onDisconnect?.();
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return ws;
}

// ============================================\n// Strategy API\n// ============================================

export async function getStrategies(): Promise<ApiResponse<StrategyDefinition[]>> {
  return fetchApi('/api/strategies');
}

export async function getStrategy(name: string): Promise<ApiResponse<StrategyDefinition>> {
  return fetchApi(`/api/strategies/${name}`);
}

// ============================================
// BYOA (Bring Your Own Agent) API
// ============================================

export async function registerExternalAgent(data: {
  agentName: string;
  agentType: 'local' | 'remote';
  agentEndpoint?: string;
  supportedIntents: string[];
  metadata?: Record<string, unknown>;
}): Promise<ApiResponse<BYOARegistrationResult>> {
  return fetchApi('/api/byoa/register', {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
}

export async function getExternalAgents(): Promise<ApiResponse<ExternalAgent[]>> {
  return fetchApi('/api/byoa/agents');
}

export async function getExternalAgent(id: string): Promise<ApiResponse<ExternalAgentDetail>> {
  return fetchApi(`/api/byoa/agents/${id}`);
}

export async function getExternalIntents(
  agentId?: string,
  limit?: number
): Promise<ApiResponse<IntentHistoryRecord[]>> {
  if (agentId) {
    const params = limit ? `?limit=${limit}` : '';
    return fetchApi(`/api/byoa/agents/${agentId}/intents${params}`);
  }
  const params = limit ? `?limit=${limit}` : '';
  return fetchApi(`/api/byoa/intents${params}`);
}

/**
 * Get ALL intent history (both built-in and BYOA agents).
 */
export async function getAllIntentHistory(
  limit?: number
): Promise<ApiResponse<IntentHistoryRecord[]>> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchApi(`/api/intents${params}`);
}

export async function deactivateExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/deactivate`, { method: 'POST', headers: adminHeaders() });
}

export async function activateExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/activate`, { method: 'POST', headers: adminHeaders() });
}

export async function revokeExternalAgent(id: string): Promise<ApiResponse<void>> {
  return fetchApi(`/api/byoa/agents/${id}/revoke`, { method: 'POST', headers: adminHeaders() });
}
