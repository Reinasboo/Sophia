/**
 * Admin Proxy Route
 *
 * C-1 FIX: This server-side API route proxies mutation requests to the backend
 * and injects the admin API key from a server-only environment variable
 * (ADMIN_API_KEY — *not* NEXT_PUBLIC_ADMIN_API_KEY).
 *
 * This ensures the admin key is NEVER embedded in client-side JavaScript bundles.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
// Server-only env var — never prefixed with NEXT_PUBLIC_
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Only allow mutations to specific safe paths
const ALLOWED_PATHS = new Set([
  '/api/agents',
  '/api/agents/start',
  '/api/agents/stop',
  '/api/byoa/register',
  '/api/byoa/agents',
]);

const ALLOWED_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!ALLOWED_METHODS.has(req.method ?? '')) {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const targetPath = typeof req.query['path'] === 'string' ? req.query['path'] : '';

  // Validate path to prevent open redirect / path traversal
  if (!targetPath || !ALLOWED_PATHS.has(targetPath) || targetPath.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid proxy target path' });
  }

  if (!ADMIN_API_KEY) {
    return res.status(500).json({ success: false, error: 'Server misconfiguration' });
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}${targetPath}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_API_KEY,
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ success: false, error: 'Upstream request failed' });
  }
}
