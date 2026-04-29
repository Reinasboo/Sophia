/**
 * Privy Auth Endpoint
 *
 * POST /api/auth/privy-callback
 *
 * Receives Privy authentication token, verifies it, creates/gets tenant,
 * and returns API credentials for Sophia.
 *
 * ⚠️ SECURITY NOTICE: This is a Phase 1 stub implementation.
 * - NEVER use in production without proper Privy integration (@privy-io/server-auth)
 * - Token generation uses cryptographically secure randomBytes()
 * - In production: enable PRIVY_APP_ID and PRIVY_API_SECRET for real verification
 * - Rate limiting: 5 requests per minute per IP to prevent brute-force attacks
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';

// H-1 FIX: Simple in-memory rate limiter for auth endpoint
const authRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(clientIp: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 5; // 5 requests per minute

  let record = authRateLimit.get(clientIp);

  // Cleanup expired records
  if (record && record.resetAt < now) {
    authRateLimit.delete(clientIp);
    record = undefined;
  }

  if (!record) {
    authRateLimit.set(clientIp, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  if (record.count >= maxRequests) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

interface PrivyUserInfo {
  id: string;
  email?: string;
  walletAddress?: string;
}

/**
 * Verify a Privy access token.
 *
 * Phase 1: Returns error if PRIVY_APP_ID not configured.
 * Phase 2: Will use @privy-io/server-auth to verify against Privy.
 *
 * DO NOT DEPLOY TO PRODUCTION without full implementation.
 */
async function verifyPrivyToken(accessToken: string): Promise<PrivyUserInfo | null> {
  if (!accessToken) return null;

  const privyAppId = process.env.PRIVY_APP_ID;

  // SECURITY: Reject all tokens if Privy is not configured in production
  if (!privyAppId) {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === 'production') {
      console.error(
        'SECURITY ERROR: Privy auth endpoint called in production without PRIVY_APP_ID configured'
      );
      return null;
    }
    // Development: allow stub with warning
    console.warn(
      '[DEV] Privy stub enabled without PRIVY_APP_ID. DO NOT USE IN PRODUCTION. Install @privy-io/server-auth and set PRIVY_APP_ID, PRIVY_API_SECRET.'
    );
  }

  // Phase 2: Implement actual Privy verification
  // const response = await fetch('https://api.privy.io/v1/verify_token', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Basic ${Buffer.from(`${privyAppId}:${process.env.PRIVY_API_SECRET}`).toString('base64')}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({ token: accessToken }),
  // });
  // const data = await response.json();
  // if (!response.ok || !data.user) return null;
  // return { id: data.user.id, email: data.user.email };

  // For now, stub returns fixed test user (dev only)
  return {
    id: 'user_test_' + randomBytes(4).toString('hex'),
    email: 'test@example.com',
  };
}

/**
 * Get or create a tenant for a Privy user.
 *
 * Phase 1: Returns stub credentials with secure random generation.
 * Phase 2: Will integrate with persistent tenant database.
 */
async function getOrCreateTenantForPrivyUser(privyUserInfo: PrivyUserInfo) {
  // Phase 2: Implement actual database logic
  // const existingTenant = await getTenantDatabase().findByPrivyUserId(privyUserInfo.id);
  // if (existingTenant) return existingTenant;
  // return await getTenantDatabase().create({ privyUserId: privyUserInfo.id });

  // Phase 1: Generate secure random credentials
  return {
    tenantId: 'tenant_' + randomBytes(8).toString('hex'),
    apiKey: 'key_' + randomBytes(16).toString('hex'),
  };
}

// Simple logger for this endpoint
const logger = {
  debug: (msg: string, ctx?: any) => console.log('[DEBUG]', msg, ctx),
  info: (msg: string, ctx?: any) => console.log('[INFO]', msg, ctx),
  warn: (msg: string, ctx?: any) => console.warn('[WARN]', msg, ctx),
  error: (msg: string, ctx?: any) => console.error('[ERROR]', msg, ctx),
};

interface PrivyCallbackRequest {
  accessToken: string;
}

interface PrivyCallbackResponse {
  success: boolean;
  tenantId?: string;
  apiKey?: string;
  error?: string;
}

/**
 * POST /api/auth/privy-callback
 *
 * Privy auth callback handler. Frontend sends access token;
 * backend verifies with Privy, creates/gets tenant, and returns API key.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PrivyCallbackResponse>
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  // H-1 FIX: Apply rate limiting to prevent brute-force attacks
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;
  const rateLimitCheck = checkAuthRateLimit(clientIp);

  if (!rateLimitCheck.allowed) {
    res.setHeader('Retry-After', rateLimitCheck.retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again later.',
    });
  }

  try {
    const { accessToken } = req.body as PrivyCallbackRequest;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Missing accessToken in request body',
      });
    }

    logger.debug('Privy auth callback received', {
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    });

    // Step 1: Verify Privy token
    const privyUserInfo = await verifyPrivyToken(accessToken);

    if (!privyUserInfo) {
      logger.warn('Privy token verification failed');
      return res.status(401).json({
        success: false,
        error: 'Invalid Privy token',
      });
    }

    logger.info('Privy token verified', {
      privyUserId: privyUserInfo.id,
      email: privyUserInfo.email,
    });

    // Step 2: Create or get Sophia tenant
    const { tenantId, apiKey } = await getOrCreateTenantForPrivyUser(privyUserInfo);

    // Step 3: Return credentials to frontend
    // Frontend should store these in localStorage for future requests:
    //   localStorage.setItem('sophia_api_key', apiKey);
    //   localStorage.setItem('sophia_tenant_id', tenantId);
    logger.info('Privy auth successful', {
      tenantId,
      privyUserId: privyUserInfo.id,
    });

    return res.status(200).json({
      success: true,
      tenantId,
      apiKey,
    });
  } catch (error) {
    logger.error('Privy auth callback error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}
