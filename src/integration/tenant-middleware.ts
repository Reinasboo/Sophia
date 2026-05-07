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
import { verifyPrivyAccessToken } from '../utils/privy-auth.js';
import { getBearerTokenByValue } from '../utils/bearer-token-store-db.js';

const logger = createLogger('TENANT_MIDDLEWARE');

/**
 * Extend Express Request to include tenant context
 */
declare module 'express-serve-static-core' {
  interface Request {
    tenantContext?: TenantContext;
    isAdmin?: boolean;
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

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [k, ...v] = part.split('=');
    const key = k?.trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent((v || []).join('=').trim());
    return acc;
  }, {});
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
      let apiKey = parseAuthHeader(authHeader as string);

      // Fallback: check HttpOnly session cookie set by frontend
      if (!apiKey && req.headers.cookie) {
        const cookies = parseCookieHeader(req.headers.cookie);
        const sessionKey = cookies['sophia_session'] || cookies['sophia_session'.replace(/_/g, '%5F')];
        if (sessionKey) {
          apiKey = sessionKey;
          logger.debug('Using session cookie for tenant auth', { path: req.path });
        }
      }

      // Check for admin API key (for backward compatibility and admin operations)
      const config = getConfig();
      const adminKey = config.ADMIN_API_KEY;
      if (apiKey && adminKey && apiKey === adminKey) {
        req.isAdmin = true;
        logger.debug('Admin API key authenticated');
        return next();
      }

      // For user requests: extract tenant ID from token
      // Try server-issued bearer tokens first (most common, persistent)
      // Then fall back to Privy JWTs (ephemeral)
      const allowInsecureTenantTokens =
        process.env['NODE_ENV'] !== 'production' ||
        process.env['ALLOW_INSECURE_TENANT_TOKENS'] === 'true';

      if (apiKey) {
        // Step 1: Try server-issued bearer token (priority: persistent tokens)
        const tokenRecord = await getBearerTokenByValue(apiKey);
        if (tokenRecord) {
          req.tenantContext = {
             tenantId: tokenRecord.privyUserId,
             userId: tokenRecord.privyUserId,
            apiKey,
          };
          logger.debug('Server-issued bearer token authenticated', {
             tenantId: tokenRecord.privyUserId,
          });
          return next();
        }

        // Step 2: Fall back to Privy JWT verification (ephemeral, for backwards compatibility)
        try {
          const verifiedPrivyToken = await verifyPrivyAccessToken(apiKey);
          if (verifiedPrivyToken) {
            req.tenantContext = {
              tenantId: verifiedPrivyToken.userId,
              userId: verifiedPrivyToken.userId,
              apiKey,
            };
            logger.debug('Privy JWT bearer token authenticated', {
              tenantId: verifiedPrivyToken.userId,
              sessionId: verifiedPrivyToken.sessionId,
            });
            return next();
          }
        } catch (error) {
          logger.debug('Privy JWT verification failed (this is expected for server-issued tokens)', {
            path: req.path,
            ip: req.ip,
          });
        }

        if (!allowInsecureTenantTokens) {
          logger.warn('Rejected insecure tenant token format in production', {
            path: req.path,
            ip: req.ip,
          });
          return next();
        }

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
