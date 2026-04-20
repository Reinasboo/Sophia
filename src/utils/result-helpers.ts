/**
 * Result Type Helpers
 *
 * Utilities for working with the Result<T, E> type pattern
 * that consolidate repeated unwrapping and chaining logic.
 */

import type { Result } from './types.js';

/**
 * Provide a fallback value if Result is an error
 *
 * @param result - The current Result
 * @param defaultValue - Value to return if error
 * @returns The success value or default
 *
 * @example
 * const walletLabel = result.mapError(() => 'Unknown').value;
 */
export function orElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (!result.ok) {
    return defaultValue;
  }
  return result.value;
}

/**
 * Extract either the value or error from a Result
 *
 * @param result - The Result to extract from
 * @returns The value if success, the error if failure
 *
 * @example
 * const valueOrError = extract(result);
 */
export function extract<T, E>(result: Result<T, E>): T | E {
  return result.ok ? result.value : result.error;
}

/**
 * Batch unwrap multiple Results
 *
 * If any result is a failure, returns that failure.
 * Otherwise returns all success values as tuple.
 *
 * @param results - Array of Results to unwrap
 * @returns Success with all values, or first error
 *
 * @example
 * const all = resultAll([r1, r2, r3]);
 * if (!all.ok) return failure(all.error);
 * const [v1, v2, v3] = all.value;
 */
export function resultAll<T extends readonly Result<any, any>[]>(
  results: T
): Result<{ [K in keyof T]: T[K] extends Result<infer V, any> ? V : never }, any> {
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
  }
  // @ts-expect-error: This is safe after loop validation
  return { ok: true, value: results.map((r) => r.value) };
}
