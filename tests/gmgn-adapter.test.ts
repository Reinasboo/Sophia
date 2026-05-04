import { describe, it, expect, beforeEach } from 'vitest';
import { getDataTracker, resetDataTracker } from '../src/data/index.js';
import GmgnAdapter from '../src/data/gmgn-adapter.js';

describe('GMGN Adapter', () => {
  beforeEach(() => {
    resetDataTracker();
  });

  it('pollOnce completes without throwing and queryEvents remains functional', async () => {
    const tracker = getDataTracker();
    const adapter = new GmgnAdapter();

    // Should not throw even if gmgn binary is missing or returns non-JSON
    await expect(adapter.pollOnce(tracker)).resolves.not.toThrow();

    // Query events for the adapter tenant (should be successful, may be empty)
    const tenant = (adapter as any).tenantId ?? '__global__';
    const events = await tracker.queryEvents(tenant, 10);
    expect(events.ok).toBe(true);
  });
});
