/**
 * Privy Auth Endpoint
 *
 * POST /api/auth/privy-callback
 *
 * Receives Privy authentication token, verifies it, creates/gets tenant,
 * and returns API credentials for Sophia.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// Note: verifyPrivyToken and getOrCreateTenantForPrivyUser are stubs for Phase 1
// In Phase 2, when @privy-io SDK is installed, these will be fully implemented
interface PrivyUserInfo {
  id: string;
  email?: string;
  walletAddress?: string;
}

async function verifyPrivyToken(accessToken: string): Promise<PrivyUserInfo | null> {
  // Phase 1: Stub implementation
  // Phase 2: Will use @privy-io/server-auth to verify
  if (!accessToken) return null;
  return {
    id: 'user_' + Math.random().toString(36).substr(2, 9),
    email: 'user@example.com',
  };
}

async function getOrCreateTenantForPrivyUser(privyUserInfo: PrivyUserInfo) {
  // Phase 1: Stub implementation
  // Phase 2: Will use getTenantDatabase() to create/get tenant
  return {
    tenantId: 'tenant_' + Math.random().toString(36).substr(2, 9),
    apiKey: 'key_' + Math.random().toString(36).substr(2, 32),
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
