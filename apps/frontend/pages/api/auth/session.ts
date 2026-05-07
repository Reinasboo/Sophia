/**
 * Privy Session Bootstrap Endpoint
 *
 * GET /api/auth/session
 *
 * Restores the persistent server-issued bearer token from the HttpOnly
 * session cookie so the SPA can rehydrate Authorization headers after reload.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { initializeBearerTokenStore, verifyBearerToken } from '@/lib/bearer-token-store';

interface SessionResponse {
  success: boolean;
  tenantId?: string;
  apiKey?: string;
  error?: string;
}

const SESSION_COOKIE_NAME = 'sophia_session';

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, chunk) => {
    const [rawKey, ...rawValue] = chunk.split('=');
    const key = rawKey.trim();
    if (!key) {
      return cookies;
    }

    cookies[key] = decodeURIComponent(rawValue.join('=').trim());
    return cookies;
  }, {});
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SessionResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const apiKey = cookies[SESSION_COOKIE_NAME];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'No session found',
    });
  }

  // Verify the stored apiKey with the authoritative backend to avoid
  // filesystem path mismatches between frontend and backend runtimes.
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const verifyUrl = `${API_BASE.replace(/\/+$/, '')}/internal/verify-bearer`;

  try {
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => null);
      return res.status(401).json({ success: false, error: body?.error || 'Invalid session' });
    }

    const payload = await verifyRes.json().catch(() => null);
    if (!payload?.success || !payload?.tenantId) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    return res.status(200).json({ success: true, tenantId: payload.tenantId, apiKey });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Session verification failed' });
  }
}