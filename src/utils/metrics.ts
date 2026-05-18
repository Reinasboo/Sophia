/**
 * Metrics Abstraction Layer
 *
 * Centralized metrics collection supporting multiple backends:
 * - Development: structured logging
 * - Production: StatsD/Datadog integration (when METRICS_ENABLED=true)
 *
 * Production guard: Metrics fail-closed. If configured, they must work reliably.
 * If not configured, they degrade gracefully without blocking requests.
 */

import { createLogger } from './logger.js';
import * as dgram from 'node:dgram';

const logger = createLogger('METRICS');

/**
 * SLO Thresholds (milliseconds or per-minute rates)
 * Used to define alerting boundaries for critical paths.
 */
export const SLO_THRESHOLDS = {
  // Request latency SLOs
  REQUEST_P50_MS: 100, // 50th percentile
  REQUEST_P95_MS: 500, // 95th percentile
  REQUEST_P99_MS: 2000, // 99th percentile
  REQUEST_ERROR_RATE_THRESHOLD: 0.05, // 5% error rate = alert

  // RPC latency SLOs
  RPC_P95_MS: 1000,
  RPC_ERROR_RATE_THRESHOLD: 0.01, // 1% error rate on RPC = alert
  RPC_FAILOVER_COUNT_PER_HOUR: 3, // > 3 failovers/hour = alert

  // Indexing SLOs
  INDEXING_LAG_MAX_SECONDS: 30, // Warn if > 30s behind
  WEBHOOK_HEALTH_THRESHOLD: 0.95, // < 95% success = alert

  // Wallet execution SLOs
  WALLET_EXECUTION_SUCCESS_RATE: 0.95, // < 95% success = alert
  WALLET_EXECUTION_FAILURE_ALERT_COUNT: 5, // Alert after 5 consecutive failures

  // Auth SLOs
  AUTH_FAILURE_RATE_THRESHOLD: 0.01, // 1% auth failure = alert
} as const;

/**
 * Metrics backend interface
 */
interface MetricsBackend {
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, duration: number, tags?: Record<string, string>): void;
  increment(name: string, count?: number, tags?: Record<string, string>): void;
  close?(): Promise<void>;
}

/**
 * Development backend: logs metrics
 */
class DevMetricsBackend implements MetricsBackend {
  gauge(name: string, value: number, tags?: Record<string, string>) {
    logger.debug(`[GAUGE] ${name}: ${value}`, tags ? { tags } : {});
  }

  timing(name: string, duration: number, tags?: Record<string, string>) {
    logger.debug(`[TIMING] ${name}: ${duration}ms`, tags ? { tags } : {});
  }

  increment(name: string, count = 1, tags?: Record<string, string>) {
    logger.debug(`[INCREMENT] ${name}: +${count}`, tags ? { tags } : {});
  }
}

/**
 * StatsD backend: sends metrics to Datadog/monitoring service
 * Requires: METRICS_HOST and METRICS_PORT environment variables
 */
class StatsDMetricsBackend implements MetricsBackend {
  private host: string;
  private port: number;
  private prefix: string;
  private sendSocket: any;
  private failedAttempts = 0;
  private readonly maxFailedAttempts = 3;

  constructor(host: string, port: number, prefix = 'agentic_wallet') {
    this.host = host;
    this.port = port;
    this.prefix = prefix;

    // Lazy-initialize socket on first use
  }

  private ensureSocket() {
    if (!this.sendSocket) {
      try {
        this.sendSocket = dgram.createSocket('udp4');
        logger.info('StatsD metrics backend initialized', { host: this.host, port: this.port });
      } catch (err) {
        logger.error('Failed to initialize StatsD socket', { error: String(err) });
        this.failedAttempts++;
      }
    }
  }

  private send(metricLine: string) {
    if (!this.sendSocket && this.failedAttempts < this.maxFailedAttempts) {
      this.ensureSocket();
    }

    if (!this.sendSocket) {
      return;
    }

    try {
      const buffer = Buffer.from(metricLine);
      this.sendSocket.send(buffer, 0, buffer.length, this.port, this.host, (err: any) => {
        if (err && this.failedAttempts < this.maxFailedAttempts) {
          logger.warn('StatsD send failed', { error: String(err) });
          this.failedAttempts++;
        }
      });
    } catch (err) {
      logger.warn('Failed to send StatsD metric', { error: String(err) });
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>) {
    const tagStr = this.formatTags(tags);
    this.send(`${this.prefix}.${name}:${value}|g${tagStr}`);
  }

  timing(name: string, duration: number, tags?: Record<string, string>) {
    const tagStr = this.formatTags(tags);
    this.send(`${this.prefix}.${name}:${duration}|ms${tagStr}`);
  }

  increment(name: string, count = 1, tags?: Record<string, string>) {
    const tagStr = this.formatTags(tags);
    this.send(`${this.prefix}.${name}:${count}|c${tagStr}`);
  }

  private formatTags(tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) return '';
    const tagPairs = Object.entries(tags)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `|#${tagPairs}`;
  }

  async close() {
    if (this.sendSocket) {
      this.sendSocket.close();
    }
  }
}

/**
 * Global metrics manager
 */
class MetricsManager {
  private backend: MetricsBackend;
  private enabled: boolean;
  private readonly isDev = process.env['NODE_ENV'] !== 'production';

  constructor() {
    const metricsEnabled =
      process.env['METRICS_ENABLED'] === 'true' || process.env['METRICS_ENABLED'] === '1';

    if (metricsEnabled && process.env['METRICS_HOST'] && process.env['METRICS_PORT']) {
      // Production StatsD backend
      this.backend = new StatsDMetricsBackend(
        process.env['METRICS_HOST'],
        parseInt(process.env['METRICS_PORT'], 10)
      );
      this.enabled = true;
      logger.info('Metrics: StatsD backend enabled');
    } else if (this.isDev) {
      // Development backend
      this.backend = new DevMetricsBackend();
      this.enabled = true;
      logger.info('Metrics: Development backend enabled');
    } else {
      // Production without metrics: disabled (fail-open, but logged)
      this.backend = new DevMetricsBackend();
      this.enabled = false;
      logger.warn('Metrics: Disabled in production (METRICS_ENABLED not set)', {
        note: 'Set METRICS_ENABLED=true and METRICS_HOST/METRICS_PORT to enable',
      });
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>) {
    if (!this.enabled) return;
    this.backend.gauge(name, value, tags);
  }

  timing(name: string, duration: number, tags?: Record<string, string>) {
    if (!this.enabled) return;
    this.backend.timing(name, duration, tags);
  }

  increment(name: string, count = 1, tags?: Record<string, string>) {
    if (!this.enabled) return;
    this.backend.increment(name, count, tags);
  }

  async close() {
    if (this.backend.close) {
      await this.backend.close();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Global metrics instance
 */
let metricsManager: MetricsManager | null = null;

function getMetricsManager(): MetricsManager {
  if (!metricsManager) {
    metricsManager = new MetricsManager();
  }
  return metricsManager;
}

/**
 * Record a gauge metric (current value)
 * Examples: active agent count, memory usage, queue depth
 */
export function recordGaugeMetric(name: string, value: number, tags?: Record<string, string>) {
  getMetricsManager().gauge(name, value, tags);
}

/**
 * Record a timing metric (duration in milliseconds)
 * Examples: request latency, RPC call time, database query time
 */
export function recordTimingMetric(name: string, duration: number, tags?: Record<string, string>) {
  getMetricsManager().timing(name, duration, tags);
}

/**
 * Record a counter metric (incremented count)
 * Examples: transaction count, error count, webhook received
 */
export function recordCounterMetric(name: string, count = 1, tags?: Record<string, string>): void {
  getMetricsManager().increment(name, count, tags);
}

/**
 * Helper to measure and record timing for a function/operation
 * Usage: const result = await measureTiming('my.operation', async () => { ... })
 */
export async function measureTiming<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    recordTimingMetric(name, duration, tags);
  }
}

/**
 * Helper to measure and record timing for a sync function
 */
export function measureTimingSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    const duration = Date.now() - start;
    recordTimingMetric(name, duration, tags);
  }
}

/**
 * Check if metrics are enabled (useful for conditional instrumentation)
 */
export function isMetricsEnabled(): boolean {
  return getMetricsManager().isEnabled();
}

/**
 * Shutdown metrics (close connections)
 */
export async function shutdownMetrics(): Promise<void> {
  if (metricsManager) {
    await metricsManager.close();
  }
}

/**
 * Predefined metric names and SLO-aware recording functions
 */
export const metrics = {
  // Request metrics
  request: {
    latency: (duration: number, endpoint: string, method: string, status: number) => {
      recordTimingMetric('request.latency', duration, { endpoint, method, status: String(status) });

      // Alert on SLO violation
      if (duration > SLO_THRESHOLDS.REQUEST_P95_MS) {
        recordCounterMetric('request.slo_violation', 1, { threshold: 'p95' });
      }
    },
    error: (endpoint: string, method: string, statusCode: number) => {
      recordCounterMetric('request.error', 1, { endpoint, method, status: String(statusCode) });
    },
  },

  // RPC metrics
  rpc: {
    latency: (duration: number, method: string) => {
      recordTimingMetric('rpc.latency', duration, { method });

      // Alert on SLO violation
      if (duration > SLO_THRESHOLDS.RPC_P95_MS) {
        recordCounterMetric('rpc.slo_violation', 1, { threshold: 'p95' });
      }
    },
    error: (method: string, errorCode?: string) => {
      recordCounterMetric('rpc.error', 1, { method, errorCode: errorCode || 'unknown' });
    },
    failover: () => {
      recordCounterMetric('rpc.failover', 1);
    },
  },

  // Indexing metrics
  indexing: {
    lag: (delaySeconds: number) => {
      recordGaugeMetric('indexing.lag_seconds', delaySeconds);

      // Alert on SLO violation
      if (delaySeconds > SLO_THRESHOLDS.INDEXING_LAG_MAX_SECONDS) {
        recordCounterMetric('indexing.slo_violation', 1);
      }
    },
    transactionIndexed: () => {
      recordCounterMetric('indexing.transaction_indexed', 1);
    },
    webhookReceived: () => {
      recordCounterMetric('indexing.webhook_received', 1);
    },
  },

  // Wallet execution metrics
  wallet: {
    executionLatency: (duration: number, agentId: string) => {
      recordTimingMetric('wallet.execution_latency', duration, { agentId });
    },
    executionSuccess: (agentId: string) => {
      recordCounterMetric('wallet.execution_success', 1, { agentId });
    },
    executionFailure: (agentId: string, reason: string) => {
      recordCounterMetric('wallet.execution_failure', 1, { agentId, reason });
    },
  },

  // Authentication metrics
  auth: {
    success: () => {
      recordCounterMetric('auth.success', 1);
    },
    failure: (reason: string) => {
      recordCounterMetric('auth.failure', 1, { reason });
    },
  },

  // System metrics
  system: {
    activeAgents: (count: number) => {
      recordGaugeMetric('system.active_agents', count);
    },
    databaseConnections: (count: number) => {
      recordGaugeMetric('system.db_connections', count);
    },
  },
};
