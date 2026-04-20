/**
 * Error Handling Helpers
 *
 * Provides utilities for consistent error conversion and handling
 * across the application.
 */

/**
 * Convert any error type to an Error instance
 *
 * This consolidates the repeated pattern:
 * `error instanceof Error ? error : new Error(String(error))`
 *
 * @param error - Any caught error
 * @returns A properly typed Error instance
 *
 * @example
 * try {
 *   // ...
 * } catch (error) {
 *   return failure(toError(error));
 * }
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Create a "resource not found" error with consistent messaging
 *
 * @param resourceType - Type of resource (e.g., "Wallet", "Agent")
 * @param identifier - The identifier of the missing resource
 * @returns An Error with standardized message
 *
 * @example
 * return failure(notFoundError('Wallet', walletId));
 */
export function notFoundError(resourceType: string, identifier: string): Error {
  return new Error(`${resourceType} not found: ${identifier}`);
}

/**
 * Create a validation error with a specific field
 *
 * @param fieldName - Name of the field that failed validation
 * @param reason - Why the validation failed
 * @returns An Error with standardized validation message
 *
 * @example
 * return failure(validationError('email', 'must be a valid email address'));
 */
export function validationError(fieldName: string, reason: string): Error {
  return new Error(`Validation failed: ${fieldName} ${reason}`);
}

/**
 * Extract error message safely
 *
 * Useful for logging or API responses where you need the error text
 * without exposing stack traces or sensitive data.
 *
 * @param error - Any value that might be an error
 * @returns Safe error message string
 *
 * @example
 * logger.error('Operation failed', { message: getErrorMessage(err) });
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}
