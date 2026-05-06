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
import { verifyPrivyAccessToken } from '@/lib/privy-auth';
import { getOrCreateBearerToken, initializeBearerTokenStore } from '@/lib/bearer-token-store';

// Initialize bearer token store on module load
initializeBearerTokenStore();

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

  try {
    const verified = await verifyPrivyAccessToken(accessToken);
    if (verified) {
      return {
        id: verified.userId,
        email: verified.email,
        walletAddress: verified.walletAddress,
      };
    }
  } catch (error) {
    console.error('SECURITY ERROR: Privy token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (process.env.NODE_ENV === 'production') {
      return null;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const allowStub = process.env['ALLOW_INSECURE_PRIVY_STUB'] === 'true';
  if (!allowStub) {
    return null;
  }

  console.warn(
    '[DEV] Privy stub enabled. Install real JWKS or public key verification for production.'
  );

  return {
    id: 'user_test_' + randomBytes(4).toString('hex'),
    email: 'test@example.com',
  };
}

/**
 * Get or create a tenant for a Privy user.
 *
 * Phase 2: Issue a server-signed bearer token that persists across sessions.
 * The bearer token is stored in the bearer-token-store and never changes for the same user.
 */
async function getOrCreateTenantForPrivyUser(privyUserInfo: PrivyUserInfo) {
  // Use Privy user ID as the tenant ID (one tenant per Privy user)
  const tenantId = privyUserInfo.id;

  // Get or create a persistent bearer token for this user
  // This token remains the same across logins and devices.
  const bearerToken = getOrCreateBearerToken(tenantId);

  return {
    tenantId,
    apiKey: bearerToken, // Return the server-issued bearer token
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
  apiKey?: string; // Server-issued bearer token (persists across sessions)
  error?: string;
}

function getClientIp(req: NextApiRequest): string {
  return (req.socket.remoteAddress || 'unknown') as string;
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
  const clientIp = getClientIp(req);
  const rateLimitCheck = checkAuthRateLimit(clientIp);

  if (!rateLimitCheck.allowed) {
    res.setHeader('Retry-After', rateLimitCheck.retryAfter ?? 60);
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
      ip: clientIp,
    });

    // Step 1: Verify Privy token
    const privyUserInfo = await verifyPrivyToken(accessToken);

    if (!privyUserInfo) {
      logger.warn('Privy token verification failed', {
        hasVerifier:
          Boolean(process.env['PRIVY_JWKS_URL']) || Boolean(process.env['PRIVY_PUBLIC_KEY_PEM']),
        env: process.env.NODE_ENV,
      });
      return res.status(401).json({
        success: false,
        error:
          process.env.NODE_ENV === 'production'
            ? 'Invalid Privy token'
            : 'Privy sign-in is not configured. In development, enter an email address to use the local fallback or set PRIVY_JWKS_URL / PRIVY_PUBLIC_KEY_PEM.',
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
