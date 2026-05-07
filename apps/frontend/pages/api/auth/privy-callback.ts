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

const SESSION_COOKIE_NAME = 'sophia_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 10;

function serializeSessionCookie(value: string): string {
  const secureFlag = process.env.NODE_ENV === 'production' ? 'Secure' : '';
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    secureFlag,
  ]
    .filter(Boolean)
    .join('; ');
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

    // Log incoming token structure for debugging "Invalid Compact JWS" error
    const tokenParts = String(accessToken).split('.');
    logger.debug('Privy auth callback received', {
      ip: clientIp,
      tokenLength: String(accessToken).length,
      tokenParts: tokenParts.length,
      firstPart: tokenParts[0]?.slice(0, 20) + '...',
      hasPayload: tokenParts.length >= 2,
    });

    // For production (and serverless) do not persist tokens to the frontend filesystem.
    // Instead, proxy the accessToken to the centralized backend which will verify and persist
    // the server-issued bearer token in PostgreSQL.
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    try {
      const backendRes = await fetch(`${API_BASE.replace(/\/+$/, '')}/internal/register-bearer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      const backendJson = await backendRes.json().catch(() => ({}));

      if (!backendRes.ok || !backendJson || !backendJson.success) {
        logger.warn('Backend register-bearer failed', { status: backendRes.status, body: backendJson });
        return res.status(500).json({ success: false, error: 'Failed to register tenant with backend' });
      }

      const tenantId = backendJson.tenantId;
      const apiKey = backendJson.apiKey;

      // Set HttpOnly cookie and return credentials
      res.setHeader('Set-Cookie', serializeSessionCookie(apiKey));
      logger.info('Privy auth proxied to backend and successful', { tenantId });
      return res.status(200).json({ success: true, tenantId, apiKey });
    } catch (err) {
      logger.error('Privy auth proxy error', { error: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ success: false, error: 'Authentication failed' });
    }
  } catch (error) {
    logger.error('Privy auth callback error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}
