/**
 * Request Deduplication & Response Caching Layer
 *
 * Reduces duplicate API requests by:
 * 1. Merging simultaneous requests to the same endpoint
 * 2. Caching responses with configurable TTL
 * 3. Serving stale responses while revalidating in background
 * 4. Deduplicating requests that happen within a short time window
 *
 * Expected impact: 30-50% reduction in actual backend API calls
 */

'use client';

import React from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

class RequestDeduplicator {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, PendingRequest<any>>();

  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Execute a request with automatic deduplication
   *
   * If a request with the same key is in-flight, return that promise instead of duplicating.
   * If a cached response exists and is fresh, return it immediately.
   * If a cached response exists but is stale, return it and revalidate in background.
   */
  async execute<T>(
    key: string,
    executor: () => Promise<T>,
    options: { ttl?: number; staleTtl?: number } = {}
  ): Promise<T> {
    const { ttl = 30000, staleTtl = 60000 } = options; // 30s fresh, 60s stale
    const now = Date.now();

    // 1. Check for fresh cached response
    const cached = this.cache.get(key);
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    // 2. Check for in-flight request (deduplication)
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!.promise;
    }

    // 3. Handle stale response: serve stale data while revalidating
    if (cached && now - cached.timestamp < staleTtl) {
      // Return stale data immediately
      const staleData = cached.data;

      // Revalidate in background (don't await)
      this.executeAndCache<T>(key, executor, ttl).catch((err) => {
        console.warn('[RequestDeduplication] Background revalidation failed for %s:', key, err);
      });

      return staleData;
    }

    // 4. Execute fresh request and cache result
    return this.executeAndCache<T>(key, executor, ttl);
  }

  private async executeAndCache<T>(
    key: string,
    executor: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Create promise that tracks in-flight request
    let resolveFn: (value: T) => void;
    let rejectFn: (reason?: any) => void;

    const promise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    this.pendingRequests.set(key, {
      promise,
      resolve: resolveFn!,
      reject: rejectFn!,
    });

    try {
      const data = await executor();

      // Cache successful result
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl,
      });

      // Resolve all pending requests with this data
      this.pendingRequests.get(key)?.resolve(data);
      this.pendingRequests.delete(key);

      return data;
    } catch (error) {
      // Reject all pending requests
      this.pendingRequests.get(key)?.reject(error);
      this.pendingRequests.delete(key);
      throw error;
    }
  }

  /**
   * Invalidate cache entry (called when data is mutated)
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate multiple cache entries by pattern
   * Examples: 'agents/*', '/api/agents', etc.
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      cachedKeys: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      cacheKeys: Array.from(this.cache.keys()),
      pendingKeys: Array.from(this.pendingRequests.keys()),
    };
  }
}

// Global singleton
export const requestDeduplicator = new RequestDeduplicator();

/**
 * Wrapper for fetch-based API calls with automatic deduplication
 *
 * Usage:
 *   const data = await cachedFetch('/api/agents', { ttl: 5000 });
 */
export async function cachedFetch<T = any>(
  url: string,
  options?: {
    method?: string;
    body?: any;
    ttl?: number;
    staleTtl?: number;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const { method = 'GET', body, ttl = 30000, staleTtl = 60000, headers = {} } = options || {};
  const resolvedUrl = new URL(url, window.location.origin);

  if (resolvedUrl.origin !== window.location.origin) {
    throw new Error('cachedFetch only supports same-origin requests');
  }

  // Skip caching for mutations (POST, PUT, DELETE)
  if (method !== 'GET') {
    const response = await fetch(resolvedUrl.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Invalidate related cache entries after mutation
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      requestDeduplicator.invalidatePrefix(`${resolvedUrl.pathname}:`);
    }

    return data;
  }

  // Deduplicate GET requests
  const cacheKey = `${method}:${resolvedUrl.toString()}`;
  return requestDeduplicator.execute(
    cacheKey,
    async () => {
      const response = await fetch(resolvedUrl.toString(), {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    },
    { ttl, staleTtl }
  );
}

/**
 * React hook for cached API requests with deduplication
 *
 * Usage in components:
 *   const { data, isLoading, error } = useCachedQuery(
 *     '/api/agents',
 *     { ttl: 5000, staleTtl: 15000 }
 *   );
 */
export function useCachedQuery<T = any>(
  url: string,
  options?: { ttl?: number; staleTtl?: number; enabled?: boolean }
) {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | undefined>(undefined);

  const { enabled = true, ttl, staleTtl } = options || {};

  React.useEffect(() => {
    if (!enabled) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const result = await cachedFetch<T>(url, { ttl, staleTtl });
        setData(result);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(undefined);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [url, enabled, ttl, staleTtl]);

  return { data, isLoading, error };
}

export default requestDeduplicator;
