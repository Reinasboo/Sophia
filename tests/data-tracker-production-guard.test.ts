import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn().mockResolvedValue({ rows: [] }),
  poolMock: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: mocks.poolMock,
}));

vi.mock('../src/utils/config.js', () => ({
  getConfig: () => ({
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    GMGN_ENABLED: 'false',
    HELIUS_WEBHOOK_SECRET: process.env.HELIUS_WEBHOOK_SECRET || 'test-secret',
  }),
}));

vi.mock('../src/utils/store.js', () => ({
  saveState: vi.fn(),
  loadState: vi.fn(),
}));

describe('DataTracker production guard', () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'agentic-wallet-tracker-'));
    process.env = { ...originalEnv };
    process.env['DATA_DIR'] = tempDir;
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.poolMock.mockImplementation(() => ({
      query: mocks.queryMock,
      connect: vi.fn().mockResolvedValue({ query: mocks.queryMock, release: vi.fn() }),
      end: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('uses file-backed storage in development when postgres unavailable', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DATABASE_URL;

    const { DataTracker } = await import('../src/data/tracker.js');
    const tracker = new DataTracker();
    await (tracker as any).ensureReady();

    expect((tracker as any).storageMode).toBe('file');
  });

  it('uses postgres when DATABASE_URL is configured', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://localhost/test';

    const { DataTracker } = await import('../src/data/tracker.js');
    const tracker = new DataTracker();
    await (tracker as any).ensureReady();

    expect((tracker as any).storageMode).toBe('postgres');
  });

  it('fails in production when neither DATABASE_URL nor DATA_DIR is set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.DATA_DIR;

    const { DataTracker } = await import('../src/data/tracker.js');
    const tracker = new DataTracker();

    await expect((tracker as any).ensureReady()).rejects.toThrow(
      /Data tracker requires DATABASE_URL or DATA_DIR in production/
    );
  });

  it('succeeds in production with DATABASE_URL configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://localhost/test';

    const { DataTracker } = await import('../src/data/tracker.js');
    const tracker = new DataTracker();
    await (tracker as any).ensureReady();

    expect((tracker as any).storageMode).toBe('postgres');
  });

  it('succeeds in production with DATA_DIR configured (file fallback)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    process.env.DATA_DIR = tempDir;

    const { DataTracker } = await import('../src/data/tracker.js');
    const tracker = new DataTracker();
    await (tracker as any).ensureReady();

    // Should fall back to file storage when DATA_DIR is set
    expect((tracker as any).storageMode).toBe('file');
  });
});
