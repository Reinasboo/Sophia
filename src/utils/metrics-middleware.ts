/**
 * Metrics Middleware
 *
 * Intercepts requests and records:
 * - Request latency
 * - Error rates
 * - Endpoint-specific performance
 */

import { Request, Response, NextFunction } from 'express';
import { metrics, isMetricsEnabled } from './metrics.js';
import { createLogger } from './logger.js';

const logger = createLogger('METRICS_MIDDLEWARE');

/**
 * Express middleware to record request metrics
 * Attach early in the middleware chain to capture full request time
 */
export function metricsMiddleware(_req: Request, res: Response, next: NextFunction) {
  if (!isMetricsEnabled()) {
    return next();
  }

  const startTime = Date.now();
  const originalJson = res.json;
  const originalSend = res.send;
  const endpoint = _req.route?.path || _req.path || 'unknown';
  const method = _req.method;

  // Track when response is sent
  const recordMetrics = (statusCode: number) => {
    const duration = Date.now() - startTime;

    // Record latency
    metrics.request.latency(duration, endpoint, method, statusCode);

    // Record errors
    if (statusCode >= 400) {
      metrics.request.error(endpoint, method, statusCode);
    }

    if (duration > 1000) {
      logger.debug(`[SLOW_REQUEST] ${method} ${endpoint}: ${duration}ms`, {
        statusCode,
      });
    }
  };

  // Hook into response methods
  res.json = function (data: any) {
    const statusCode = res.statusCode || 200;
    recordMetrics(statusCode);
    return originalJson.call(this, data);
  };

  res.send = function (data: any) {
    const statusCode = res.statusCode || 200;
    recordMetrics(statusCode);
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Optional: Record error handler metrics
 */
export function metricsErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (!isMetricsEnabled()) {
    return;
  }

  const statusCode = res.statusCode || 500;
  metrics.request.error(_req.path || 'unknown', _req.method, statusCode);

  logger.error('[METRICS] Unhandled error', {
    statusCode,
    endpoint: _req.path,
    error: err instanceof Error ? err.message : String(err),
  });
}
