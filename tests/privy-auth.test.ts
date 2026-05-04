import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Privy auth fallback', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it('accepts an email placeholder in development when no verifier is configured', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PRIVY_JWKS_URL;
    delete process.env.PRIVY_PUBLIC_KEY_PEM;

    const { verifyPrivyAccessToken } = await import('../apps/frontend/lib/privy-auth.js');
    const token = await verifyPrivyAccessToken('test@example.com');

    expect(token).not.toBeNull();
    expect(token?.email).toBe('test@example.com');
    expect(token?.userId).toContain('dev_test_example_com');
  });

  it('rejects email placeholders in production when no verifier is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PRIVY_JWKS_URL;
    delete process.env.PRIVY_PUBLIC_KEY_PEM;

    const { verifyPrivyAccessToken } = await import('../apps/frontend/lib/privy-auth.js');
    const token = await verifyPrivyAccessToken('test@example.com');

    expect(token).toBeNull();
  });
});
