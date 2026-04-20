/**
 * Generic Polling Hook
 *
 * Consolidates repeated polling pattern used in useStats, useTransactions, etc.
 * Provides reusable hook for fetching data on an interval.
 */

import { useState, useEffect, useCallback } from 'react';

export interface UsePolledDataOptions {
  /**
   * How often to poll in milliseconds
   * @default 5000
   */
  pollInterval?: number;

  /**
   * Whether to skip the initial fetch
   * @default false
   */
  skipInitial?: boolean;

  /**
   * Custom error message to use if fetch fails
   * @default 'Failed to fetch data'
   */
  defaultErrorMessage?: string;
}

/**
 * Generic hook for polling API endpoints
 *
 * Replaces repeated useState/useEffect/useCallback pattern.
 *
 * @template T - The data type being fetched
 * @param fetchFn - Async function that fetches the data
 * @param options - Configuration for polling behavior
 * @returns Object with data, loading, error, and refetch states
 *
 * @example
 * const { data: stats, loading, error, refetch } = usePolledData(
 *   () => api.getStats(),
 *   { pollInterval: 5000 }
 * );
 */
export function usePolledData<T>(
  fetchFn: () => Promise<{ success: boolean; data?: T; error?: string }>,
  options: UsePolledDataOptions = {}
) {
  const {
    pollInterval = 5000,
    skipInitial = false,
    defaultErrorMessage = 'Failed to fetch data',
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skipInitial);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchFn();
      if (response.success && response.data) {
        setData(response.data);
        setError(null);
      } else {
        setError(response.error || defaultErrorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : defaultErrorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, defaultErrorMessage]);

  useEffect(() => {
    if (!skipInitial) {
      refetch();
    }
    const interval = setInterval(refetch, pollInterval);
    return () => clearInterval(interval);
  }, [refetch, pollInterval, skipInitial]);

  return { data, loading, error, refetch };
}

/**
 * Specialized version with data transformation
 *
 * @template T - Raw data type from API
 * @template U - Transformed data type
 * @param fetchFn - Async function that fetches the data
 * @param transform - Function to transform fetched data
 * @param options - Configuration for polling behavior
 * @returns Object with transformed data, loading, error, and refetch states
 *
 * @example
 * const { data: transformed } = usePolledData(
 *   () => api.getTransactions(),
 *   (raw) => raw.transactions ?? [],
 *   { pollInterval: 5000 }
 * );
 */
export function usePolledDataTransform<T, U>(
  fetchFn: () => Promise<{ success: boolean; data?: T; error?: string }>,
  transform: (data: T) => U,
  options: UsePolledDataOptions = {}
) {
  const result = usePolledData(fetchFn, options);

  return {
    ...result,
    data: result.data ? transform(result.data) : null,
  };
}
