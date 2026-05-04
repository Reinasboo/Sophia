import { describe, it, expect, beforeEach } from 'vitest';
import { getDataTracker, resetDataTracker } from '../src/data/index.js';

describe('GMGN Data Query', () => {
  beforeEach(() => {
    resetDataTracker();
  });

  it('returns GMGN market payloads recorded as events', async () => {
    const tracker = getDataTracker();

    // Record a gmgn market snapshot event
    await tracker.recordEvent({
      tenantId: 'tenant-gmgn',
      eventType: 'system_alert',
      entityId: 'gmgn.market.1',
      entityType: 'system',
      data: { source: 'gmgn', kind: 'market_snapshot', payload: { symbol: 'SOL', price: 25 } },
      createdAt: new Date(),
    });

    const res = await tracker.queryGmgnData('tenant-gmgn', 'market_snapshot', 10);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.length).toBe(1);
      expect((res.value[0] as any).symbol).toBe('SOL');
    }
  });
});
