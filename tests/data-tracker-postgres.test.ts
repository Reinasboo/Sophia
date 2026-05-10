import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn().mockResolvedValue({ rows: [] }),
  releaseMock: vi.fn(),
  connectMock: vi.fn(),
  poolMock: vi.fn(),
}));

vi.mock('../src/utils/config.js', () => ({
  getConfig: () => ({
    DATABASE_URL: 'postgres://localhost:5432/agentic-wallet-test',
    GMGN_ENABLED: 'false',
  }),
}));

vi.mock('../src/utils/store.js', () => ({
  saveState: vi.fn(),
  loadState: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: mocks.poolMock,
}));

import { DataTracker } from '../src/data/tracker.js';

describe('DataTracker postgres persistence', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    vi.clearAllMocks();
    mocks.queryMock.mockResolvedValue({ rows: [] });
    mocks.connectMock.mockResolvedValue({
      query: mocks.queryMock,
      release: mocks.releaseMock,
    });
    mocks.poolMock.mockImplementation(() => ({
      query: mocks.queryMock,
      connect: mocks.connectMock,
      end: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('upserts indexing_state during repeated persistence runs', async () => {
    const tracker = new DataTracker();
    await (tracker as any).ensureReady();

    await (tracker as any).persistToDatabase();
    await (tracker as any).persistToDatabase();

    const indexingStateQuery = mocks.queryMock.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO indexing_state')
    );

    expect(indexingStateQuery?.[0]).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(mocks.connectMock).toHaveBeenCalled();
  });
});
