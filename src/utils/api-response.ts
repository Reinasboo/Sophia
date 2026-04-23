/**
 * API Response Utilities
 *
 * Centralized response and error handling for consistency across endpoints
 */

import { Response } from 'express';
import { createLogger } from './logger.js';

const logger = createLogger('API_RESPONSE');

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  statusCode?: number;
  timestamp: Date;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  timestamp: Date;
}

export interface ApiMessageResponse {
  success: true;
  message: string;
  timestamp: Date;
}

export type ApiResponse<T = unknown> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse
  | ApiMessageResponse;

/**
 * Standard HTTP status codes for common API errors
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Standard error codes for API responses
 */
export const ERROR_CODE = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  OPERATION_FAILED: 'OPERATION_FAILED',
  REGISTRATION_FAILED: 'REGISTRATION_FAILED',
  WALLET_BINDING_FAILED: 'WALLET_BINDING_FAILED',
  CHALLENGE_FAILED: 'CHALLENGE_FAILED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  DEACTIVATION_FAILED: 'DEACTIVATION_FAILED',
  ACTIVATION_FAILED: 'ACTIVATION_FAILED',
  REVOCATION_FAILED: 'REVOCATION_FAILED',
  TOKEN_ROTATION_FAILED: 'TOKEN_ROTATION_FAILED',
} as const;

/**
 * Send a success response with data
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date(),
  } as ApiSuccessResponse<T>);
}

/**
 * Send a success response with a message
 */
export function sendMessage(res: Response, message: string, statusCode: number = 200): void {
  res.status(statusCode).json({
    success: true,
    message,
    timestamp: new Date(),
  } as ApiMessageResponse);
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  error: string | Error,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  errorCode?: string,
  context?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log error with context
  logger.error('API Error', {
    statusCode,
    errorCode,
    message: errorMessage,
    ...context,
  });

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(errorCode && { code: errorCode }),
    timestamp: new Date(),
  } as ApiErrorResponse);
}

/**
 * Validate required query/body parameters
 */
export function validateRequired(
  value: unknown,
  fieldName: string
): { valid: boolean; error?: string } {
  if (value === undefined || value === null || value === '') {
    return {
      valid: false,
      error: `Missing required parameter: ${fieldName}`,
    };
  }
  return { valid: true };
}

/**
 * Validate parameter is a non-empty string
 */
export function validateString(
  value: unknown,
  fieldName: string
): { valid: boolean; error?: string } {
  const required = validateRequired(value, fieldName);
  if (!required.valid) return required;

  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      valid: false,
      error: `${fieldName} must be a non-empty string`,
    };
  }
  return { valid: true };
}

/**
 * Validate bearer token format from Authorization header
 */
export function validateBearerToken(authHeader: string | undefined): {
  valid: boolean;
  token?: string;
  error?: string;
} {
  if (!authHeader) {
    return {
      valid: false,
      error: 'Missing Authorization header',
    };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Invalid Authorization header format. Expected: Bearer <token>',
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      valid: false,
      error: 'Authorization token is empty',
    };
  }

  return { valid: true, token };
}

/**
 * Wrap an async endpoint handler with error handling
 */
export function asyncHandler(
  handler: (req: any, res: Response) => Promise<void>
): (req: any, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Unhandled endpoint error', {
        path: req.path,
        method: req.method,
        error: errorMsg,
      });

      sendError(res, errorMsg, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODE.INTERNAL_ERROR);
    }
  };
}

/**
 * Sanitize error messages for client responses
 */
export function sanitizeErrorForClient(error: unknown): string {
  if (error instanceof Error) {
    // Don't expose internal details
    if (error.message.includes('database') || error.message.includes('internal')) {
      return 'An internal error occurred. Please try again later.';
    }
    return error.message;
  }
  return 'An unexpected error occurred';
}
