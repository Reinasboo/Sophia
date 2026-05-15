import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const poolMocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  pool: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: poolMocks.pool,
}));

describe('bearer-token-store-db', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'agentic-wallet-bearer-tokens-'));
    process.env = { ...originalEnv };
    process.env['DATA_DIR'] = tempDir;
    process.env['RAILWAY_ENVIRONMENT'] = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('uses the file backend in development when postgres is unavailable', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;

    const store = await import('../src/utils/bearer-token-store-db.js');
    await store.initializeBearerTokenStore();

    await store.storeBearerToken({
      privyUserId: 'tenant-123',
      bearerToken: 'bearer_tenant-123_abc',
      createdAt: new Date().toISOString(),
      issuedAt: Date.now(),
    });

    const tokenRecord = await store.getBearerTokenByValue('bearer_tenant-123_abc');

    expect(tokenRecord?.privyUserId).toBe('tenant-123');
    expect(existsSync(join(tempDir, 'bearer_tokens.json'))).toBe(true);
  });

  it('fails closed in production when postgres is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;

    const store = await import('../src/utils/bearer-token-store-db.js');

    await expect(store.initializeBearerTokenStore()).rejects.toThrow(
      'DATABASE_URL is required for bearer token storage in production.'
    );
  });
});
