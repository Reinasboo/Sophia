/**
 * Custom React Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from './api';
import type {
  Agent,
  AgentDetail,
  SystemStats,
  SystemEvent,
  Transaction,
  ExternalAgent,
  ExternalAgentDetail,
  IntentHistoryRecord,
  StrategyDefinition,
} from './types';

// Hook for fetching available strategies
export function useStrategies() {
  const [strategies, setStrategies] = useState<StrategyDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    const response = await api.getStrategies();
    if (response.success && response.data) {
      setStrategies(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch strategies');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return { strategies, loading, error, refetch: fetchStrategies };
}

// Hook for health check
export function useHealth(pollInterval: number = 15000) {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  const fetchHealth = useCallback(async () => {
    const response = await api.checkHealth();
    setHealthy(response.success && response.data?.status === 'healthy');
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, pollInterval);
    return () => clearInterval(interval);
  }, [fetchHealth, pollInterval]);

  return { healthy };
}

// Hook for fetching events (REST fallback)
export function useEvents(count: number = 100, pollInterval: number = 5000) {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const response = await api.getEvents(count);
    if (response.success && response.data) {
      setEvents(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch events');
    }
    setLoading(false);
  }, [count]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchEvents, pollInterval]);

  return { events, loading, error, refetch: fetchEvents };
}

// Hook for fetching agents
export function useAgents(pollInterval: number = 5000) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const response = await api.getAgents();
    if (response.success && response.data) {
      setAgents(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch agents');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAgents, pollInterval]);

  return { agents, loading, error, refetch: fetchAgents };
}

// Hook for fetching single agent
export function useAgent(id: string | null, pollInterval: number = 3000) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    const response = await api.getAgent(id);
    if (response.success && response.data) {
      setData(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch agent');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchAgent();
    const interval = setInterval(fetchAgent, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAgent, pollInterval]);

  return { data, loading, error, refetch: fetchAgent };
}

// Hook for fetching system stats
export function useStats(pollInterval: number = 5000) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    const response = await api.getStats();
    if (response.success && response.data) {
      setStats(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch stats');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStats, pollInterval]);

  return { stats, loading, error, refetch: fetchStats };
}

// Hook for WebSocket events
export function useWebSocket(onEvent?: (event: SystemEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = api.createWebSocket(
      (event) => {
        setEvents((prev) => {
          // Add new event, keep last 100
          const updated = [event, ...prev].slice(0, 100);
          return updated;
        });
        onEvent?.(event);
      },
      () => setConnected(true),
      () => setConnected(false)
    );

    wsRef.current = ws;

    return () => {
      ws?.close();
    };
  }, [onEvent]);

  return { connected, events };
}

// Hook for fetching transactions
export function useTransactions(pollInterval: number = 5000) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    const response = await api.getTransactions();
    if (response.success && response.data) {
      // Backend wraps as { transactions: [...], total, page, limit }
      const txData = (response.data as any)?.transactions ?? response.data;
      setTransactions(Array.isArray(txData) ? txData : []);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch transactions');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
    const interval = setInterval(fetchTransactions, pollInterval);
    return () => clearInterval(interval);
  }, [fetchTransactions, pollInterval]);

  return { transactions, loading, error, refetch: fetchTransactions };
}

// ============================================
// BYOA Hooks
// ============================================

// Hook for fetching external (BYOA) agents
export function useExternalAgents(pollInterval: number = 5000) {
  const [agents, setAgents] = useState<ExternalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExternalAgents = useCallback(async () => {
    const response = await api.getExternalAgents();
    if (response.success && response.data) {
      setAgents(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch external agents');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExternalAgents();
    const interval = setInterval(fetchExternalAgents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchExternalAgents, pollInterval]);

  return { agents, loading, error, refetch: fetchExternalAgents };
}

// Hook for fetching a single external agent
export function useExternalAgent(id: string | null, pollInterval: number = 3000) {
  const [data, setData] = useState<ExternalAgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExternalAgent = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    const response = await api.getExternalAgent(id);
    if (response.success && response.data) {
      setData(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch external agent');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchExternalAgent();
    const interval = setInterval(fetchExternalAgent, pollInterval);
    return () => clearInterval(interval);
  }, [fetchExternalAgent, pollInterval]);

  return { data, loading, error, refetch: fetchExternalAgent };
}

// Hook for fetching BYOA intent history
export function useExternalIntents(agentId?: string, pollInterval: number = 5000) {
  const [intents, setIntents] = useState<IntentHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntents = useCallback(async () => {
    const response = await api.getExternalIntents(agentId);
    if (response.success && response.data) {
      setIntents(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch intents');
    }
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    fetchIntents();
    const interval = setInterval(fetchIntents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchIntents, pollInterval]);

  return { intents, loading, error, refetch: fetchIntents };
}

// Hook for fetching ALL intent history (built-in + BYOA agents)
export function useAllIntentHistory(pollInterval: number = 5000) {
  const [intents, setIntents] = useState<IntentHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntents = useCallback(async () => {
    const response = await api.getAllIntentHistory();
    if (response.success && response.data) {
      setIntents(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch intent history');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIntents();
    const interval = setInterval(fetchIntents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchIntents, pollInterval]);

  return { intents, loading, error, refetch: fetchIntents };
}

// Alias for useAllIntentHistory (used by pages)
export function useIntentHistory(pollInterval: number = 5000) {
  return useAllIntentHistory(pollInterval);
}

// Fetch connected BYOA agents from real backend
export function useConnectedAgents(pollInterval: number = 5000) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setError(null);
      const response = await api.getExternalAgents();
      if (response.success && response.data) {
        setAgents(response.data);
      } else {
        setAgents([]);
      }
      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch agents';
      setError(errorMessage);
      setAgents([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAgents, pollInterval]);

  const revoke = useCallback(async (id: string) => {
    try {
      setError(null);
      setAgents((agents) => agents.filter((a) => a.id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to revoke agent';
      setError(errorMessage);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await fetchAgents();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh agents';
      setError(errorMessage);
    }
  }, [fetchAgents]);

  return { agents, loading, error, refresh, revoke };
}
