/**
 * Read Proxy Route
 *
 * Proxies safe, read-only backend requests through the Next.js origin so
 * browser-side cached fetches stay same-origin.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ALLOWED_PATH_PATTERNS = [
  /^\/api\/health$/,
  /^\/api\/stats$/,
  /^\/api\/monitoring\/cache$/,
  /^\/api\/monitoring\/rate-limits$/,
  /^\/api\/agents(?:\/[^/]+)?(?:\/withdrawals)?$/,
  /^\/api\/withdrawals(?:\/[^/]+)?$/,
  /^\/api\/transactions$/,
  /^\/api\/data\/transactions\/[^/]+$/,
  /^\/api\/events$/,
  /^\/api\/explorer\/[^/]+$/,
  /^\/api\/strategies(?:\/[^/]+)?$/,
  /^\/api\/byoa\/agents(?:\/[^/]+(?:\/intents)?)?$/,
  /^\/api\/byoa\/intents$/,
  /^\/api\/byoa\/service-policies(?:\/[^/]+)?$/,
];

function isAllowedPath(targetPath: string): boolean {
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(targetPath));
}

function parseUrl(input: string): URL {
  return new URL(input, 'http://localhost');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rawPath = typeof req.query['path'] === 'string' ? req.query['path'] : '';
  if (!rawPath) {
    return res.status(400).json({ success: false, error: 'Missing read proxy path' });
  }

  const decodedPath = decodeURIComponent(rawPath);
  if (!isAllowedPath(decodedPath) || decodedPath.includes('..')) {
    return res.status(400).json({ success: false, error: 'Invalid read proxy target path' });
  }

  const targetUrl = parseUrl(decodedPath);
  const upstreamUrl = `${BACKEND_URL.replace(/\/+$/, '')}${targetUrl.pathname}${targetUrl.search}`;

  try {
    const authHeader = req.headers.authorization;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers,
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    const body = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    return res.send(body);
  } catch (err) {
    return res.status(502).json({ success: false, error: 'Upstream request failed' });
  }
}
