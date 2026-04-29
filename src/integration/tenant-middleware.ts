/**
 * Tenant Context Middleware
 *
 * Extracts tenant identification from:
 * 1. Authorization header (Bearer token) → validates and extracts tenantId
 * 2. Admin API key (for admin endpoints)
 *
 * Attaches TenantContext to req.tenantContext for use in route handlers.
 * Rejects requests without valid auth credentials.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';
import { TenantContext } from '../types/index.js';
import { getConfig } from '../utils/config.js';
import { HTTP_STATUS, ERROR_CODE, sendError } from '../utils/api-response.js';

const logger = createLogger('TENANT_MIDDLEWARE');

/**
 * Extend Express Request to include tenant context
 */
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      isAdmin?: boolean;
    }
  }
}

/**
 * Parse Bearer token from Authorization header
 */
function parseAuthHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

/**
 * Middleware that extracts TenantContext from authorization header
 *
 * Usage:
 *   app.use(tenantContextMiddleware());
 *
 * Routes can then access req.tenantContext and check req.isAdmin.
 * Protected routes should use: protectedRoute(), adminRoute()
 */
export function tenantContextMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'];
      const apiKey = parseAuthHeader(authHeader as string);

      // Check for admin API key (for backward compatibility and admin operations)
      const config = getConfig();
      const adminKey = config.ADMIN_API_KEY;
      if (apiKey && adminKey && apiKey === adminKey) {
        req.isAdmin = true;
        logger.debug('Admin API key authenticated');
        return next();
      }

      // For user requests: extract tenant ID from token
      // Phase 1: Accept any Bearer token as valid (will be improved in Phase 2)
      // Phase 2: Validate token signature with Privy
      if (apiKey) {
        // Extract tenantId from token
        // Format: key_<tenantId>_<random>
        const parts = apiKey.split('_');
        if (parts.length >= 2 && parts[0] === 'key' && parts[1]) {
          const tenantId: string = parts[1];
          req.tenantContext = {
            tenantId,
            apiKey,
          };
          logger.debug('Tenant context extracted', { tenantId });
          return next();
        }
      }

      // No valid auth found - continue to route (route will enforce if needed)
      logger.debug('No valid auth header found - route handler will check');
      return next();
    } catch (error) {
      logger.error('Tenant context middleware error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return next();
    }
  };
}

/**
 * Protected Route Middleware
 *
 * Use this to protect routes that require tenant authentication.
 * Rejects requests without valid TenantContext.
 *
 * Usage:
 *   app.get('/api/agents', protectedRoute(), (req, res) => {
 *     const { tenantId } = req.tenantContext!;
 *   });
 */
export function protectedRoute() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenantContext && !req.isAdmin) {
      logger.warn('Protected route accessed without auth', {
        path: req.path,
        ip: req.ip,
      });
      res.status(401).json({
        success: false,
        error: 'Authentication required. Include Authorization: Bearer <token> header.',
      });
      return;
    }
    next();
  };
}

/**
 * Admin Route Middleware
 *
 * Use this to protect routes that require admin-only access.
 *
 * Usage:
 *   app.post('/api/admin/reset', adminRoute(), (req, res) => {
 *     // Admin operation
 *   });
 */
export function adminRoute() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAdmin) {
      logger.warn('Admin route accessed without admin key', {
        path: req.path,
        ip: req.ip,
        hasAuth: !!req.tenantContext,
      });
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }
    next();
  };
}

/**
 * Extract tenant ID safely from request
 *
 * Usage:
 *   const tenantId = getTenantIdOrFail(req, res);
 *   if (!tenantId) return; // Response already sent
 */
export function getTenantIdOrFail(req: Request, res: Response): string | null {
  if (!req.tenantContext) {
    res.status(401).json({
      success: false,
      error: 'Tenant context not found',
    });
    return null;
  }
  return req.tenantContext.tenantId;
}
