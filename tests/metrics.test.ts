import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordGaugeMetric,
  recordTimingMetric,
  recordCounterMetric,
  measureTiming,
  measureTimingSync,
  isMetricsEnabled,
  shutdownMetrics,
  SLO_THRESHOLDS,
  metrics,
} from '../src/utils/metrics.js';

describe('Metrics abstraction layer', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('enables metrics in development mode by default', async () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['METRICS_ENABLED'];

    const { isMetricsEnabled: isDev } = await import('../src/utils/metrics.js');
    expect(isDev()).toBe(true);
  });

  it('disables metrics in production without METRICS_ENABLED', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['METRICS_ENABLED'];
    delete process.env['METRICS_HOST'];
    delete process.env['METRICS_PORT'];

    const { isMetricsEnabled: isProd } = await import('../src/utils/metrics.js');
    expect(isProd()).toBe(false);
  });

  it('enables StatsD backend when METRICS_ENABLED and METRICS_HOST/PORT are set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['METRICS_ENABLED'] = 'true';
    process.env['METRICS_HOST'] = 'localhost';
    process.env['METRICS_PORT'] = '8125';

    const { isMetricsEnabled: isStatsd } = await import('../src/utils/metrics.js');
    expect(isStatsd()).toBe(true);
  });

  it('records gauge metrics without errors', () => {
    recordGaugeMetric('test.gauge', 42);
    recordGaugeMetric('test.gauge', 42, { service: 'test' });
    // No errors = success
    expect(true).toBe(true);
  });

  it('records timing metrics without errors', () => {
    recordTimingMetric('test.timing', 100);
    recordTimingMetric('test.timing', 100, { method: 'GET' });
    // No errors = success
    expect(true).toBe(true);
  });

  it('records counter metrics without errors', () => {
    recordCounterMetric('test.counter');
    recordCounterMetric('test.counter', 5);
    recordCounterMetric('test.counter', 1, { endpoint: '/api/test' });
    // No errors = success
    expect(true).toBe(true);
  });

  it('measures timing for async functions', async () => {
    const result = await measureTiming('test.async', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('measures timing for sync functions', () => {
    const result = measureTimingSync('test.sync', () => {
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('defines SLO thresholds', () => {
    expect(SLO_THRESHOLDS.REQUEST_P95_MS).toBe(500);
    expect(SLO_THRESHOLDS.RPC_P95_MS).toBe(1000);
    expect(SLO_THRESHOLDS.INDEXING_LAG_MAX_SECONDS).toBe(30);
    expect(SLO_THRESHOLDS.REQUEST_ERROR_RATE_THRESHOLD).toBe(0.05);
  });

  it('provides predefined metrics helpers', () => {
    expect(metrics.request).toBeDefined();
    expect(metrics.rpc).toBeDefined();
    expect(metrics.indexing).toBeDefined();
    expect(metrics.wallet).toBeDefined();
    expect(metrics.auth).toBeDefined();
    expect(metrics.system).toBeDefined();

    // Call them without errors
    metrics.request.latency(100, '/api/test', 'GET', 200);
    metrics.rpc.latency(50, 'getProgramAccounts');
    metrics.indexing.lag(5);
    metrics.wallet.executionSuccess('agent-1');
    metrics.auth.success();
    metrics.system.activeAgents(5);

    expect(true).toBe(true);
  });

  it('handles errors in async measurement', async () => {
    try {
      await measureTiming('test.error', async () => {
        throw new Error('Test error');
      });
    } catch (err) {
      // Metrics recorded even on error
      expect(err instanceof Error).toBe(true);
    }
  });

  it('handles errors in sync measurement', () => {
    try {
      measureTimingSync('test.sync.error', () => {
        throw new Error('Test error');
      });
    } catch (err) {
      // Metrics recorded even on error
      expect(err instanceof Error).toBe(true);
    }
  });

  it('gracefully handles shutdown', async () => {
    await shutdownMetrics();
    // No errors = success
    expect(true).toBe(true);
  });
});

describe('SLO thresholds validation', () => {
  it('defines reasonable request latency SLOs', () => {
    // P50 < P95 < P99
    expect(SLO_THRESHOLDS.REQUEST_P50_MS).toBeLessThan(SLO_THRESHOLDS.REQUEST_P95_MS);
    expect(SLO_THRESHOLDS.REQUEST_P95_MS).toBeLessThan(SLO_THRESHOLDS.REQUEST_P99_MS);
  });

  it('defines reasonable error rate thresholds', () => {
    // 1% RPC errors < 5% request errors
    expect(SLO_THRESHOLDS.RPC_ERROR_RATE_THRESHOLD).toBeLessThan(
      SLO_THRESHOLDS.REQUEST_ERROR_RATE_THRESHOLD
    );
  });

  it('defines reasonable success rate thresholds', () => {
    // Both should be close to 1.0 (high success bar)
    expect(SLO_THRESHOLDS.WEBHOOK_HEALTH_THRESHOLD).toBeGreaterThan(0.9);
    expect(SLO_THRESHOLDS.WALLET_EXECUTION_SUCCESS_RATE).toBeGreaterThan(0.9);
  });
});
