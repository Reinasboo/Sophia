import { describe, it, expect, beforeEach, vi } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

const mocks = vi.hoisted(() => ({
  getBearerTokenByValueMock: vi.fn(),
  verifyPrivyAccessTokenMock: vi.fn(),
}));

vi.mock('../src/utils/config.js', () => ({
  getConfig: () => ({
    ADMIN_API_KEY: 'admin-key-123',
  }),
}));

vi.mock('../src/utils/privy-auth.js', () => ({
  verifyPrivyAccessToken: mocks.verifyPrivyAccessTokenMock,
}));

vi.mock('../src/utils/bearer-token-store-db.js', () => ({
  getBearerTokenByValue: mocks.getBearerTokenByValueMock,
}));

import {
  tenantContextMiddleware,
  protectedRoute,
  adminRoute,
  getTenantIdOrFail,
} from '../src/integration/tenant-middleware.js';

function createRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('tenant middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBearerTokenByValueMock.mockResolvedValue(null);
    mocks.verifyPrivyAccessTokenMock.mockResolvedValue(null);
  });

  it('rejects protected routes without auth', () => {
    const req = { path: '/api/test', ip: '127.0.0.1', headers: {} } as any;
    const res = createRes();
    const next = vi.fn();

    protectedRoute()(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects admin routes without the admin key', () => {
    const req = { path: '/api/admin', ip: '127.0.0.1', headers: {} } as any;
    const res = createRes();
    const next = vi.fn();

    adminRoute()(req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('hydrates tenant context from a server-issued bearer token', async () => {
    mocks.getBearerTokenByValueMock.mockResolvedValue({ privyUserId: 'tenant-123' });

    const req = {
      path: '/api/agents',
      ip: '127.0.0.1',
      headers: { authorization: 'Bearer session-token-abc' },
    } as any;
    const res = createRes();
    const next = vi.fn();

    await tenantContextMiddleware()(req, res as any, next);

    expect(req.tenantContext).toEqual({
      tenantId: 'tenant-123',
      userId: 'tenant-123',
      apiKey: 'session-token-abc',
    });
    expect(next).toHaveBeenCalled();
  });

  it('accepts the configured admin API key', async () => {
    const req = {
      path: '/api/admin',
      ip: '127.0.0.1',
      headers: { authorization: 'Bearer admin-key-123' },
    } as any;
    const res = createRes();
    const next = vi.fn();

    await tenantContextMiddleware()(req, res as any, next);

    expect(req.isAdmin).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('returns the tenant id or a 401 failure', () => {
    const req = { tenantContext: { tenantId: 'tenant-abc' } } as any;
    const res = createRes();

    expect(getTenantIdOrFail(req, res as any)).toBe('tenant-abc');
    expect(res.status).not.toHaveBeenCalled();

    const missingReq = {} as any;
    const missingRes = createRes();
    expect(getTenantIdOrFail(missingReq, missingRes as any)).toBeNull();
    expect(missingRes.status).toHaveBeenCalledWith(401);
  });
});
