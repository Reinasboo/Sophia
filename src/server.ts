/**
 * API Server
 *
 * REST API for the frontend to observe system state.
 * The frontend is READ-ONLY - it cannot execute transactions or access keys.
 */

import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { getOrchestrator, eventBus } from './orchestrator/index.js';
import { getWalletManager, getServicePolicyManager } from './wallet/index.js';
import { getSolanaClient, X402Handler, getX402Handler } from './rpc/index.js';
import { getConfig, getExplorerUrl } from './utils/config.js';
import { createLogger } from './utils/logger.js';
import { secureCompare } from './utils/encryption.js';
import { ApiResponse, SystemEvent, AgentConfig } from './utils/types.js';
import type { IndexedTransaction, IndexedIntent, IndexedEvent } from './data/index.js';
import {
  getAgentRegistry,
  getWalletBinder,
  getIntentRouter,
  ExternalIntent,
  SupportedIntentType,
} from './integration/index.js';
import {
  tenantContextMiddleware,
  protectedRoute,
  getTenantIdOrFail,
} from './integration/tenant-middleware.js';
import { getStrategyRegistry } from './agent/strategy-registry.js';
import { openAPISpec } from './openapi.js';
import {
  sendSuccess,
  sendMessage,
  sendError,
  HTTP_STATUS,
  ERROR_CODE,
  validateBearerToken,
  asyncHandler,
} from './utils/api-response.js';
import {
  getDataTracker,
  attachDataTracker,
  handleHeliusWebhook,
  verifyHeliusSignature,
} from './data/index.js';
import { getDeFiRegistry } from './defi/index.js';

const logger = createLogger('API');

const app = express();

// ── Rate limiting and server configuration constants ──
const API_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window for rate limit
const API_RATE_LIMIT_MAX_REQUESTS = 120; // requests per minute per IP address
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 300_000; // 5 minutes cleanup interval
const REQUEST_BODY_SIZE_LIMIT = '512kb'; // Maximum request body size
const TRUST_PROXY_HOP_COUNT = 1; // Number of proxy hops to trust (prevents X-Forwarded-For spoofing)

// ── Helper: Validate CORS origin URL ──
function isValidCorsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    // Prevent open redirect: disallow wildcards in production
    if (url.hostname === '*') {
      return process.env['NODE_ENV'] !== 'production';
    }
    return true;
  } catch {
    return false;
  }
}

// M-8: Configurable CORS origins via env var
const config = getConfig();
const isProductionMainnet =
  process.env['NODE_ENV'] === 'production' && config.SOLANA_NETWORK === 'mainnet-beta';

// Build list of allowed origins
const corsOriginsList = config.CORS_ORIGINS
  ? config.CORS_ORIGINS.split(',')
      .map((o: string) => o.trim())
      .filter(Boolean)
      .filter((origin) => {
        if (!isValidCorsOrigin(origin)) {
          logger.warn('Invalid CORS origin rejected', { origin });
          return false;
        }
        return true;
      })
  : [
      `http://localhost:${config.PORT}`,
      `http://localhost:3000`,
      'http://127.0.0.1:3000',
      // Production defaults: Include Vercel frontend URL when deployed
      'https://frontend-virid-two-71.vercel.app',
    ];

// CORS origin validator with regex support for production
const corsOriginValidator = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (!origin) {
    callback(null, true); // Allow requests with no origin (like mobile apps)
    return;
  }

  // Check if origin is in the allowed list
  if (corsOriginsList.includes(origin)) {
    callback(null, true);
    return;
  }

  // In production, allow Vercel and Railway domains
  if (process.env['NODE_ENV'] === 'production') {
    if (/\.vercel\.app$/.test(origin) || /\.railway\.app$/.test(origin)) {
      callback(null, true);
      return;
    }
  }

  callback(new Error('CORS policy violation'));
};

if (corsOriginsList.length === 0) {
  logger.warn('No valid CORS origins configured. Using secure defaults.');
}

app.use(
  cors({
    origin: corsOriginValidator,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// L-3 FIX: Explicitly handle OPTIONS preflight so browsers get correct CORS headers.
app.options(
  '*',
  cors({
    origin: corsOriginValidator,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// H-3 FIX: Only trust the immediate upstream reverse proxy (first hop).
// This prevents X-Forwarded-For spoofing for rate-limit bypass.
// Set TRUST_PROXY=0 to disable (e.g. when running without a proxy).
app.set('trust proxy', process.env['TRUST_PROXY'] !== '0' ? TRUST_PROXY_HOP_COUNT : false);

// Limit request body size to prevent DoS and preserve raw request bodies for signed webhooks.
app.use(
  express.json({
    limit: REQUEST_BODY_SIZE_LIMIT,
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  })
);

// ── API-level rate limiting (per IP) ────────────────────────────────
const apiRateMap = new Map<string, number[]>();

app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  let timestamps = apiRateMap.get(ip) ?? [];
  timestamps = timestamps.filter((t) => now - t < API_RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= API_RATE_LIMIT_MAX_REQUESTS) {
    sendError(
      res,
      'Too many requests. Please slow down.',
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODE.OPERATION_FAILED
    );
    return;
  }
  timestamps.push(now);
  apiRateMap.set(ip, timestamps);
  next();
});

// Cleanup stale rate-limit entries periodically
setInterval(() => {
  const cutoff = Date.now() - API_RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of apiRateMap) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      apiRateMap.delete(ip);
    } else {
      apiRateMap.set(ip, filtered);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL_MS);

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug('API request', {
    method: req.method,
    path: req.path,
    query: req.query,
  });
  next();
});

// ============================================
// TENANT CONTEXT MIDDLEWARE
// ============================================

// MULTI-TENANT FIX: Extract tenant context from Authorization header
// Validates bearer token and attaches tenantId to req.tenantContext
app.use(tenantContextMiddleware());

/**
 * C-1/C-2: Require admin API key for mutation endpoints.
 * Expects header: X-Admin-Key: <ADMIN_API_KEY>
 * H-1 FIX: Uses constant-time comparison to prevent timing attacks.
 */
function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || !secureCompare(adminKey as string, config.ADMIN_API_KEY)) {
    sendError(
      res,
      'Missing or invalid X-Admin-Key header',
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODE.UNAUTHORIZED
    );
    return;
  }
  next();
}

/**
 * Sanitize error for response â€” never leak stack traces.
 * M-7: Error responses leak internal details.
 */
function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // Only return the message, not the stack
    return error.message;
  }
  return 'Internal server error';
}

// Root route â€” API index
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Agentic Wallet System',
    version: '1.0.0',
    network: config.SOLANA_NETWORK,
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      agents: '/api/agents',
      transactions: '/api/transactions',
      strategies: '/api/strategies',
      byoa: '/api/byoa/register',
      docs: 'https://github.com/Reinasboo/Agentic-wallet',
    },
    dashboard: 'http://localhost:3000',
    timestamp: new Date(),
  });
});

// M-1 FIX: Recursively strip prototype-polluting keys from nested objects.
// A shallow strip (top-level only) is bypassable with {a: {__proto__: ...}}.
function stripDangerousKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (dangerous.has(key)) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      cleaned[key] = stripDangerousKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? stripDangerousKeys(item as Record<string, unknown>)
          : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const safeRecord = z.record(z.unknown()).transform(stripDangerousKeys);

// Validation schemas
const CreateAgentSchema = z.object({
  name: z.string().min(1).max(50),
  strategy: z.string().min(1).max(50),
  strategyParams: safeRecord.optional(),
  executionSettings: z
    .object({
      cycleIntervalMs: z.number().int().min(5000).max(3600000).optional(),
      maxActionsPerDay: z.number().int().min(1).max(10000).optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
});

const UpdateAgentConfigSchema = z.object({
  strategyParams: safeRecord.optional(),
  executionSettings: z
    .object({
      cycleIntervalMs: z.number().int().min(5000).max(3600000).optional(),
      maxActionsPerDay: z.number().int().min(1).max(10000).optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
});

// ============================================
// HEALTH ENDPOINTS
// ============================================

app.get('/api/health', async (_req: Request, res: Response) => {
  const client = getSolanaClient();
  const healthResult = await client.checkHealth();

  const response: ApiResponse<{ status: string }> = {
    success: healthResult.ok,
    data: { status: healthResult.ok ? 'healthy' : 'degraded' },
    timestamp: new Date(),
  };

  res.json(response);
});

/**
 * OpenAPI specification endpoint
 * Serves the API documentation in OpenAPI 3.0 format
 */
app.get('/api/openapi.json', (_req: Request, res: Response) => {
  res.json(openAPISpec);
});

// ============================================
// STATS ENDPOINTS
// ============================================

app.get(
  '/api/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const stats = await orchestrator.getStats();

    sendSuccess(res, stats);
  })
);

/**
 * Rate limiting status endpoint
 * Returns current RPC budget and per-wallet transaction quotas
 */
app.get(
  '/api/monitoring/rate-limits',
  asyncHandler(async (_req: Request, res: Response) => {
    const { getRateLimiter } = await import('./utils/rate-limiter.js');
    const rateLimiter = getRateLimiter();

    const rpcStats = rateLimiter.getRpcStats();
    const walletStats = rateLimiter.getWalletStats();

    sendSuccess(res, {
      rpc: {
        used: rpcStats.used,
        limit: rpcStats.max,
        utilization: (rpcStats.utilization * 100).toFixed(2) + '%',
        blocked: rpcStats.blocked,
      },
      wallets: Object.entries(walletStats).map(([address, stats]) => ({
        address: address.slice(0, 8) + '...' + address.slice(-8), // Truncate for display
        used: stats.used,
        max: stats.max,
        utilization: (stats.utilization * 100).toFixed(2) + '%',
        blocked: stats.blocked,
      })),
    });
  })
);

/**
 * Cache health endpoint
 * Returns cache statistics and performance metrics
 */
app.get(
  '/api/monitoring/cache',
  asyncHandler(async (_req: Request, res: Response) => {
    const { getAgentContextCache } = await import('./utils/agent-context-cache.js');
    const cache = getAgentContextCache();

    const healthReport = cache.getHealthReport();

    sendSuccess(res, {
      cache: {
        sizes: healthReport.sizes,
        hitRate: (healthReport.hitRate * 100).toFixed(2) + '%',
        totalEntries: healthReport.sizes.total,
        estimatedRpcSavings: `${(healthReport.hitRate * 100).toFixed(0)}% reduction`,
      },
      stats: healthReport.stats,
      timestamp: new Date().toISOString(),
    });
  })
);

// ============================================
// AGENT ENDPOINTS
// ============================================

app.get(
  '/api/agents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const orchestrator = getOrchestrator();
    const walletManager = getWalletManager();
    const client = getSolanaClient();

    // Parse pagination parameters
    const limit = Math.min(
      Math.max(parseInt(String(req.query['limit'] ?? '50'), 10) || 50, 1),
      500 // Max 500 per request
    );
    const offset = Math.max(parseInt(String(req.query['offset'] ?? '0'), 10) || 0, 0);

    // MULTI-TENANT FIX: Get agents for THIS tenant only
    const tenantAgents = orchestrator.getAgentsByTenant(tenantId);
    const total = tenantAgents.length;

    // Apply pagination to the filtered list
    const paginatedAgents = tenantAgents.slice(offset, offset + limit);

    // Enrich with balance information - use allSettled to handle partial failures
    const enrichedAgents = await Promise.allSettled(
      paginatedAgents.map(async (agent) => {
        const walletResult = walletManager.getWallet(agent.walletId);
        let balance = 0;

        if (walletResult.ok && walletResult.value?.publicKey) {
          try {
            const pubkey = new PublicKey(walletResult.value.publicKey);
            const balanceResult = await client.getBalance(pubkey);
            if (balanceResult.ok) {
              balance = balanceResult.value.sol;
            }
          } catch (error) {
            logger.warn('Invalid public key for agent', {
              agentId: agent.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return {
          ...agent,
          balance,
        };
      })
    ).then((results) =>
      results
        .map((result) => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          logger.warn('Failed to enrich agent with balance', { reason: String(result.reason) });
          return null;
        })
        .filter(
          (agent): agent is (typeof paginatedAgents)[number] & { balance: number } => agent !== null
        )
    );

    sendSuccess(res, {
      data: enrichedAgents,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  })
);

app.get(
  '/api/agents/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const walletManager = getWalletManager();
    const client = getSolanaClient();

    const agentResult = orchestrator.getAgent(req.params['id'] ?? '');
    if (!agentResult.ok) {
      sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const agent = agentResult.value;
    let balance = 0;
    let tokenBalances: unknown[] = [];

    const walletResult = walletManager.getWallet(agent.walletId);
    if (walletResult.ok && walletResult.value?.publicKey) {
      try {
        const pubkey = new PublicKey(walletResult.value.publicKey);
        const balanceResult = await client.getBalance(pubkey);
        if (balanceResult.ok) {
          balance = balanceResult.value.sol;
        }
        const tokensResult = await client.getTokenBalances(pubkey);
        if (tokensResult.ok) {
          tokenBalances = tokensResult.value;
        }
      } catch (error) {
        logger.warn('Invalid public key for agent', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const transactions = orchestrator.getAgentTransactions(agent.id);
    const events = eventBus.getAgentEvents(agent.id, 50);

    sendSuccess(res, {
      agent,
      balance,
      tokenBalances,
      transactions,
      events,
    });
  })
);

app.post(
  '/api/agents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return; // getTenantIdOrFail already sent error response

    const validation = CreateAgentSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const orchestrator = getOrchestrator();
    const agentConfig: AgentConfig = {
      ...validation.data,
      tenantId, // MULTI-TENANT: Populate from auth context
    } as AgentConfig;
    const result = await orchestrator.createAgent(agentConfig);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(res, result.value, HTTP_STATUS.CREATED);
  })
);

app.post(
  '/api/agents/:id/start',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const result = orchestrator.startAgent(req.params['id'] ?? '');

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendMessage(res, 'Agent started successfully');
  })
);

app.post(
  '/api/agents/:id/stop',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const result = orchestrator.stopAgent(req.params['id'] ?? '');

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendMessage(res, 'Agent stopped successfully');
  })
);

/**
 * Pause agent (stop decision cycles without stopping the service)
 *
 * Unlike stop, pause is reversible and doesn't clear the agent state.
 * Useful for emergency stops or maintenance.
 */
app.post(
  '/api/agents/:id/pause',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const result = orchestrator.pauseAgent(req.params['id'] ?? '');

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendMessage(res, 'Agent paused successfully');
  })
);

/**
 * Resume agent (resume decision cycles from pause state)
 *
 * Only works if agent is currently paused.
 */
app.post(
  '/api/agents/:id/resume',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const result = orchestrator.resumeAgent(req.params['id'] ?? '');

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendMessage(res, 'Agent resumed successfully');
  })
);

app.patch(
  '/api/agents/:id/config',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const validation = UpdateAgentConfigSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const orchestrator = getOrchestrator();
    const result = orchestrator.updateAgentConfig(req.params['id'] ?? '', validation.data);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(res, result.value);
  })
);

// ============================================
// STRATEGY ENDPOINTS
// ============================================

app.get(
  '/api/strategies',
  asyncHandler(async (_req: Request, res: Response) => {
    const registry = getStrategyRegistry();
    const strategies = registry.getAllDTOs();

    sendSuccess(res, strategies);
  })
);

app.get(
  '/api/strategies/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getStrategyRegistry();
    const strategy = registry.getDTO(req.params['name'] ?? '');

    if (!strategy) {
      sendError(res, 'Strategy not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    sendSuccess(res, strategy);
  })
);

// ============================================
// DEFI QUERY ENDPOINTS
// ============================================

app.get(
  '/api/defi/dex/routes',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const inputMint = String(req.query['inputMint'] ?? '');
    const outputMint = String(req.query['outputMint'] ?? '');
    const amount = Number(req.query['amount'] ?? 0);
    const slippage = req.query['slippage'] ? Number(req.query['slippage']) : undefined;

    if (!inputMint || !outputMint || !Number.isFinite(amount) || amount <= 0) {
      sendError(
        res,
        'inputMint, outputMint, and positive amount are required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const registry = getDeFiRegistry();
    const dexQuotes = await Promise.all(
      Array.from(registry.dex.entries()).map(async ([name, adapter]) => {
        const quote = await adapter.routeSwap({ inputMint, outputMint, amount, slippage });
        return { dex: name, quote };
      })
    );

    const routes = dexQuotes
      .filter((item) => item.quote.ok && item.quote.value)
      .map((item) => ({ dex: item.dex, quote: item.quote.value }));

    sendSuccess(res, {
      tenantId,
      inputMint,
      outputMint,
      amount,
      slippage,
      routes,
    });
  })
);

app.get(
  '/api/defi/staking/validators',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const protocol = String(req.query['protocol'] ?? 'marinade');
    const registry = getDeFiRegistry();
    const adapter = registry.staking.get(protocol);

    if (!adapter) {
      sendError(res, 'Staking protocol not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    const validators = await adapter.getValidators();
    if (!validators.ok) {
      sendError(
        res,
        validators.error?.message ?? 'Failed to fetch validators',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.OPERATION_FAILED
      );
      return;
    }

    sendSuccess(res, { tenantId, protocol, validators: validators.value });
  })
);

app.get(
  '/api/defi/staking/:protocol/apy',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const protocol = req.params['protocol'] ?? '';
    const registry = getDeFiRegistry();
    const adapter = registry.staking.get(protocol);

    if (!adapter) {
      sendError(res, 'Staking protocol not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    const apyResult = await adapter.getApy();
    if (!apyResult.ok) {
      sendError(
        res,
        apyResult.error?.message ?? 'Failed to fetch APY',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.OPERATION_FAILED
      );
      return;
    }

    sendSuccess(res, { tenantId, protocol, apy: apyResult.value });
  })
);

app.get(
  '/api/defi/lending/reserves',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const protocol = req.query['protocol'] ? String(req.query['protocol']) : undefined;
    const registry = getDeFiRegistry();

    if (protocol) {
      const adapter = registry.lending.get(protocol);
      if (!adapter) {
        sendError(res, 'Lending protocol not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
        return;
      }

      const reserves = await adapter.getReserves();
      if (!reserves.ok) {
        sendError(
          res,
          reserves.error?.message ?? 'Failed to fetch lending reserves',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODE.OPERATION_FAILED
        );
        return;
      }

      sendSuccess(res, { tenantId, protocol, reserves: reserves.value });
      return;
    }

    const allReserves = await Promise.all(
      Array.from(registry.lending.entries()).map(async ([name, adapter]) => {
        const reserves = await adapter.getReserves();
        return { protocol: name, reserves };
      })
    );

    const markets = allReserves
      .filter((entry) => entry.reserves.ok && entry.reserves.value)
      .map((entry) => ({ protocol: entry.protocol, reserves: entry.reserves.value }));

    sendSuccess(res, { tenantId, markets });
  })
);

app.get(
  '/api/defi/lending/:protocol/borrowing-power',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const protocol = req.params['protocol'] ?? '';
    const walletAddress = String(req.query['walletAddress'] ?? '');

    if (!walletAddress) {
      sendError(
        res,
        'walletAddress query parameter is required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const registry = getDeFiRegistry();
    const adapter = registry.lending.get(protocol);

    if (!adapter) {
      sendError(res, 'Lending protocol not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    const powerResult = await adapter.getBorrowingPower(walletAddress);
    if (!powerResult.ok) {
      sendError(
        res,
        powerResult.error?.message ?? 'Failed to fetch borrowing power',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.OPERATION_FAILED
      );
      return;
    }

    sendSuccess(res, {
      tenantId,
      protocol,
      walletAddress,
      borrowingPower: powerResult.value,
    });
  })
);

// ============================================
// TRANSACTION ENDPOINTS
// ============================================

app.get(
  '/api/transactions',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const orchestrator = getOrchestrator();
    const tenantTransactions = orchestrator.getTransactionsByTenant(tenantId);

    // Pagination
    // M-3 FIX: parseInt can silently return NaN; use a safe parser with an
    // explicit radix and explicit integer-validity check.
    const parsePositiveInt = (val: unknown, def: number): number => {
      if (typeof val !== 'string') return def;
      const n = parseInt(val, 10);
      return Number.isInteger(n) && n > 0 ? n : def;
    };
    const page = parsePositiveInt(req.query['page'], 1);
    const limit = Math.min(parsePositiveInt(req.query['limit'], 50), 500);
    const start = (page - 1) * limit;
    const transactions = tenantTransactions.slice(start, start + limit);

    sendSuccess(res, {
      transactions,
      total: tenantTransactions.length,
      page,
      limit,
    });
  })
);

// ============================================
// EVENTS ENDPOINT
// ============================================

app.get(
  '/api/events',
  asyncHandler(async (req: Request, res: Response) => {
    const count = Math.min(parseInt(req.query['count'] as string) || 100, 500);
    const events = eventBus.getRecentEvents(count);

    sendSuccess(res, events);
  })
);

// ============================================
// UTILITY ENDPOINTS
// ============================================

app.get('/api/explorer/:signature', (req: Request, res: Response) => {
  const url = getExplorerUrl(req.params['signature'] ?? '');
  res.json({
    success: true,
    data: { url },
    timestamp: new Date(),
  });
});

// ============================================
// BYOA (Bring Your Own Agent) ENDPOINTS
// ============================================

// Validation schemas for BYOA
const RegisterAgentSchema = z.object({
  agentName: z.string().min(1).max(100),
  agentType: z.enum(['local', 'remote']),
  agentEndpoint: z.string().url().optional(),
  supportedIntents: z
    .array(
      z.enum([
        'REQUEST_AIRDROP',
        'TRANSFER_SOL',
        'TRANSFER_TOKEN',
        'QUERY_BALANCE',
        'AUTONOMOUS',
        'SERVICE_PAYMENT',
        'swap',
        'stake',
        'unstake',
        'liquid_stake',
        'provide_liquidity',
        'remove_liquidity',
        'deposit_lending',
        'withdraw_lending',
        'borrow_lending',
        'repay_lending',
        'farm_deposit',
        'farm_harvest',
        'wrap_token',
        'unwrap_token',
        'composite_strategy',
      ])
    )
    .min(1),
  metadata: safeRecord.optional(),
  verificationMethods: z
    .array(z.enum(['none', 'challenge-response', 'hmac-signature']))
    .default(['none']),
});

const SubmitIntentSchema = z
  .object({
    type: z.enum([
      'REQUEST_AIRDROP',
      'TRANSFER_SOL',
      'TRANSFER_TOKEN',
      'QUERY_BALANCE',
      'AUTONOMOUS',
      'SERVICE_PAYMENT',
      'swap',
      'stake',
      'unstake',
      'liquid_stake',
      'provide_liquidity',
      'remove_liquidity',
      'deposit_lending',
      'withdraw_lending',
      'borrow_lending',
      'repay_lending',
      'farm_deposit',
      'farm_harvest',
      'wrap_token',
      'unwrap_token',
      'composite_strategy',
    ]),
    params: safeRecord.default({}),
  })
  .refine(
    (data) => {
      // For AUTONOMOUS intents, ensure `action` is present
      if (data.type === 'AUTONOMOUS' && typeof data.params['action'] !== 'string') {
        return false;
      }
      return true;
    },
    { message: 'AUTONOMOUS intents require params.action (string)' }
  );

const ServicePolicySchema = z.object({
  serviceId: z.string().min(1).max(100),
  capPerTransaction: z.number().positive(),
  dailyBudgetAmount: z.number().positive(),
  cooldownSeconds: z.number().int().min(0).max(86400).default(0),
  allowedPrograms: z.array(z.string().min(1)).optional(),
  blockedPrograms: z.array(z.string().min(1)).optional(),
  metadata: safeRecord.optional(),
});

const X402DescriptorRequestSchema = z.object({
  paymentAddress: z.string().min(1),
  amount: z.number().positive(),
  durationSeconds: z.number().int().min(1).max(86400).default(300),
});

/**
 * Register an external agent and receive a wallet + control token.
 * The control token is returned ONCE; the caller must store it securely.
 */
app.post(
  '/api/byoa/register',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const validation = RegisterAgentSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const data = validation.data;

    if (isProductionMainnet && data.supportedIntents.includes('REQUEST_AIRDROP')) {
      sendError(
        res,
        'REQUEST_AIRDROP is disabled in mainnet production.',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const registry = getAgentRegistry();
    const binder = getWalletBinder();

    // 1. Register agent (with tenantId)
    const regResult = registry.register({
      agentName: data.agentName,
      agentType: data.agentType,
      agentEndpoint: data.agentEndpoint,
      supportedIntents: data.supportedIntents as SupportedIntentType[],
      metadata: data.metadata,
      tenantId, // MULTI-TENANT: Populate from auth context
    });

    if (!regResult.ok) {
      sendError(
        res,
        regResult.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.REGISTRATION_FAILED
      );
      return;
    }

    const { agentId, controlToken } = regResult.value;

    // 2. Create and bind a wallet (tenant-scoped)
    const bindResult = binder.bindNewWallet(agentId, tenantId);
    if (!bindResult.ok) {
      // Clean up the registration
      registry.revokeAgent(agentId);
      sendError(
        res,
        bindResult.error.message,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODE.WALLET_BINDING_FAILED
      );
      return;
    }

    const { walletId, walletPublicKey } = bindResult.value;

    logger.info('BYOA agent registered', {
      agentId,
      agentName: data.agentName,
      walletPublicKey,
      tenantId,
    });

    // 3. Return credentials (control token shown ONCE)
    sendSuccess(
      res,
      {
        agentId,
        controlToken,
        walletId,
        walletPublicKey,
        supportedIntents: data.supportedIntents,
        message: 'Store the controlToken securely. It will NOT be shown again.',
      },
      HTTP_STATUS.CREATED
    );
  })
);

app.get(
  '/api/byoa/service-policies',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const policyManager = getServicePolicyManager();
    const policies = policyManager
      .listAllPolicies()
      .filter((policy) => (policy.tenantId ?? '__global__') === tenantId);

    sendSuccess(res, policies);
  })
);

app.get(
  '/api/byoa/service-policies/:serviceId',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const serviceId = req.params['serviceId'] ?? '';
    const policyManager = getServicePolicyManager();
    const policyResult = policyManager.getServicePolicy(serviceId, tenantId);

    if (!policyResult.ok) {
      sendError(res, policyResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    sendSuccess(res, policyResult.value);
  })
);

app.post(
  '/api/byoa/service-policies',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const validation = ServicePolicySchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const policyManager = getServicePolicyManager();
    const result = policyManager.registerServicePolicy(validation.data, tenantId);
    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(
      res,
      {
        ...validation.data,
        tenantId,
      },
      HTTP_STATUS.CREATED
    );
  })
);

app.patch(
  '/api/byoa/service-policies/:serviceId',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const serviceId = req.params['serviceId'] ?? '';
    const validation = ServicePolicySchema.partial().safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const policyManager = getServicePolicyManager();
    const result = policyManager.updateServicePolicy(serviceId, validation.data, tenantId);
    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    sendSuccess(res, result.value);
  })
);

app.post(
  '/api/byoa/service-policies/:serviceId/x402-descriptor',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const serviceId = req.params['serviceId'] ?? '';
    const policyManager = getServicePolicyManager();
    const policyResult = policyManager.getServicePolicy(serviceId, tenantId);
    if (!policyResult.ok) {
      sendError(res, policyResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    const validation = X402DescriptorRequestSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const { paymentAddress, amount, durationSeconds } = validation.data;
    const x402 = getX402Handler(paymentAddress);
    const descriptor = x402.generatePaymentDescriptor(amount, durationSeconds);

    sendSuccess(res, {
      serviceId,
      tenantId,
      policy: policyResult.value,
      descriptor,
      encodedHeader: X402Handler.encodeX402Header(descriptor),
    });
  })
);

/**
 * Generate a challenge for agent endpoint verification.
 * Required for challenge-response verification method.
 * Agent must POST the challenge back signed.
 */
app.post(
  '/api/byoa/verify/challenge-generate',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const { agentId } = req.body;
    if (!agentId || typeof agentId !== 'string') {
      sendError(res, 'agentId is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODE.VALIDATION_FAILED);
      return;
    }

    const registry = getAgentRegistry();

    // MULTI-TENANT: Validate agent belongs to tenant
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    // Generate random challenge
    const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const result = registry.setChallenge(agentId, challenge);
    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.CHALLENGE_FAILED);
      return;
    }

    sendSuccess(res, {
      agentId,
      challenge,
      expiresIn: 300, // 5 minutes
      instruction: 'Agent must POST signed challenge back to /api/byoa/verify/challenge-submit',
    });
  })
);

/**
 * Submit challenge-response to complete verification.
 * Agent submits the signed challenge it received.
 */
app.post(
  '/api/byoa/verify/challenge-submit',
  asyncHandler(async (req: Request, res: Response) => {
    const { agentId, challengeResponse } = req.body;
    if (
      !agentId ||
      typeof agentId !== 'string' ||
      !challengeResponse ||
      typeof challengeResponse !== 'string'
    ) {
      sendError(
        res,
        'agentId and challengeResponse are required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const registry = getAgentRegistry();
    const result = registry.verifyChallengeResponse(agentId, challengeResponse);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.FORBIDDEN, ERROR_CODE.VERIFICATION_FAILED);
      return;
    }

    sendSuccess(res, {
      agentId,
      verified: true,
      message: 'Challenge-response verification successful. Agent endpoint confirmed.',
    });
  })
);

/**
 * Submit an intent as an external agent.
 * Requires Authorization: Bearer <controlToken>
 */
app.post(
  '/api/byoa/intents',
  asyncHandler(async (req: Request, res: Response) => {
    // Extract bearer token
    const authHeader = req.headers['authorization'];
    const bearerValidation = validateBearerToken(authHeader as string | undefined);

    if (!bearerValidation.valid || !bearerValidation.token) {
      sendError(
        res,
        bearerValidation.error || 'Invalid authorization',
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODE.INVALID_TOKEN
      );
      return;
    }

    const validation = SubmitIntentSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(
        res,
        validation.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    if (isProductionMainnet && validation.data.type === 'REQUEST_AIRDROP') {
      sendError(
        res,
        'REQUEST_AIRDROP is disabled in mainnet production.',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }

    const router = getIntentRouter();
    const result = await router.submitIntent(
      bearerValidation.token,
      validation.data as ExternalIntent
    );

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.FORBIDDEN, ERROR_CODE.FORBIDDEN);
      return;
    }

    const intentResult = result.value;
    const statusCode =
      intentResult.status === 'executed' ? HTTP_STATUS.OK : HTTP_STATUS.UNPROCESSABLE_ENTITY;

    sendSuccess(res, intentResult, statusCode);
  })
);

/**
 * List all connected external agents for the authenticated tenant.
 */
app.get(
  '/api/byoa/agents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const registry = getAgentRegistry();
    const client = getSolanaClient();
    const walletManager = getWalletManager();

    // MULTI-TENANT: Filter agents by tenant
    const agents = registry.getAgentsByTenant(tenantId);

    // Enrich with balance information - use allSettled to handle partial failures
    const enriched = await Promise.allSettled(
      agents.map(async (agent) => {
        let balance = 0;
        if (agent.walletId) {
          const walletResult = walletManager.getWallet(agent.walletId);
          if (walletResult.ok && walletResult.value?.publicKey) {
            try {
              const pubkey = new PublicKey(walletResult.value.publicKey);
              const balanceResult = await client.getBalance(pubkey);
              if (balanceResult.ok) {
                balance = balanceResult.value.sol;
              }
            } catch (error) {
              logger.warn('Invalid public key for BYOA agent', {
                agentId: agent.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        return { ...agent, balance };
      })
    ).then((results) =>
      results
        .map((result) => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          logger.warn('Failed to enrich BYOA agent with balance', {
            reason: String(result.reason),
          });
          return null;
        })
        .filter((agent): agent is (typeof agents)[number] & { balance: number } => agent !== null)
    );

    sendSuccess(res, enriched);
  })
);

/**
 * Get a single external agent detail.
 * MULTI-TENANT: Requires authentication; validates agent belongs to tenant
 */
app.get(
  '/api/byoa/agents/:id',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const router = getIntentRouter();
    const client = getSolanaClient();
    const walletManager = getWalletManager();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentResult = registry.getAgent(req.params['id'] ?? '');
    if (!agentResult.ok) {
      sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const agent = agentResult.value;
    if (!registry.agentBelongsToTenant(agent.id, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }
    let balance = 0;
    let tokenBalances: unknown[] = [];

    if (agent.walletId) {
      const walletResult = walletManager.getWallet(agent.walletId);
      if (walletResult.ok && walletResult.value?.publicKey) {
        try {
          const pubkey = new PublicKey(walletResult.value.publicKey);
          const balanceResult = await client.getBalance(pubkey);
          if (balanceResult.ok) {
            balance = balanceResult.value.sol;
          }
          const tokensResult = await client.getTokenBalances(pubkey);
          if (tokensResult.ok) {
            tokenBalances = tokensResult.value;
          }
        } catch (error) {
          logger.warn('Invalid public key for BYOA agent detail', {
            agentId: agent.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const intents = router.getIntentHistory(agent.id, 100);

    sendSuccess(res, {
      agent,
      balance,
      tokenBalances,
      intents,
    });
  })
);

/**
 * Get intent history for a specific external agent.
 * MULTI-TENANT: Requires authentication; validates agent belongs to tenant
 */
app.get(
  '/api/byoa/agents/:id/intents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const router = getIntentRouter();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentId = req.params['id'] ?? '';
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);
    const intents = router.getIntentHistory(agentId, limit);

    sendSuccess(res, intents);
  })
);

/**
 * Deactivate an external agent.
 * Admin action â€” no bearer token required (dashboard use).
 */
app.post(
  '/api/byoa/agents/:id/deactivate',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentId = req.params['id'] ?? '';
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const result = registry.deactivateAgent(agentId);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.DEACTIVATION_FAILED);
      return;
    }

    sendSuccess(res, { message: 'Agent deactivated' });
  })
);

/**
 * Activate an external agent.
 * Admin action â€” no bearer token required (dashboard use).
 */
app.post(
  '/api/byoa/agents/:id/activate',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentId = req.params['id'] ?? '';
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const result = registry.activateAgent(agentId);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.ACTIVATION_FAILED);
      return;
    }

    sendSuccess(res, { message: 'Agent activated' });
  })
);

/**
 * Revoke an external agent (permanent).
 * Admin action â€” no bearer token required (dashboard use).
 */
app.post(
  '/api/byoa/agents/:id/revoke',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentId = req.params['id'] ?? '';
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const result = registry.revokeAgent(agentId);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.REVOCATION_FAILED);
      return;
    }

    sendSuccess(res, { message: 'Agent revoked' });
  })
);

/**
 * Rotate the control token for a BYOA agent.
 *
 * Invalidates the current token and issues a brand-new 256-bit token.
 * The agent's wallet binding is preserved — the agent reconnects to the
 * SAME wallet using the new token.
 *
 * Use this when:
 *  - The agent has lost its original token
 *  - The token is suspected compromised
 *
 * Requires admin auth. The new token is returned ONCE — store it securely.
 */
app.post(
  '/api/byoa/agents/:id/rotate-token',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const agentId = req.params['id'] ?? '';
    if (!registry.agentBelongsToTenant(agentId, tenantId)) {
      sendError(res, 'Agent not found', HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const agentResult = registry.getAgent(agentId);
    if (!agentResult.ok) {
      sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const result = registry.rotateToken(agentId);
    if (!result.ok) {
      sendError(
        res,
        result.error.message,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.TOKEN_ROTATION_FAILED
      );
      return;
    }

    logger.info('Control token rotated via API', { agentId });

    sendSuccess(res, {
      agentId,
      controlToken: result.value, // New token shown once
      walletPublicKey: agentResult.value.walletPublicKey,
      note: 'Token rotated. Update your agent with this new token. The wallet is unchanged.',
    });
  })
);

/**
 * Get all intent history (for dashboard).
 * MULTI-TENANT: Requires authentication; returns intents from user's agents only
 * Includes intents from both BYOA external agents and built-in orchestrated agents.
 */
app.get(
  '/api/byoa/intents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const router = getIntentRouter();
    const orchestrator = getOrchestrator();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);

    // Get all agents for this tenant
    const tenantAgents = orchestrator.getAgentsByTenant(tenantId);
    const tenantAgentIds = tenantAgents.map((a) => a.id);

    // Get all intents and filter to tenant's agents
    const allIntents = router.getIntentHistory(undefined, limit * 2); // fetch more to account for filtering
    const filteredIntents = allIntents.filter((intent) => tenantAgentIds.includes(intent.agentId));

    sendSuccess(res, filteredIntents.slice(0, limit));
  })
);

/**
 * Global intent history endpoint â€” returns ALL intents (built-in + BYOA).
 * The frontend intent-history page uses this.
 */
app.get(
  '/api/intents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const router = getIntentRouter();
    const orchestrator = getOrchestrator();
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const limit = Math.min(parseInt(req.query['limit'] as string) || 200, 1000);

    // Get all agents for this tenant
    const tenantAgents = orchestrator.getAgentsByTenant(tenantId);
    const tenantAgentIds = tenantAgents.map((a) => a.id);

    // Get all intents and filter to tenant's agents
    const allIntents = router.getIntentHistory(undefined, limit * 2); // fetch more to account for filtering
    const filteredIntents = allIntents.filter((intent) => tenantAgentIds.includes(intent.agentId));

    sendSuccess(res, filteredIntents.slice(0, limit));
  })
);

// ============================================
// DATA TRACKING & INDEXING
// ============================================

/**
 * Helius webhook endpoint — receive real-time transaction events
 * POST https://your-domain/api/webhook/helius
 * No auth required (Helius-only endpoint); set up at https://api.helius.xyz/webhooks
 */
app.post(
  '/api/webhook/helius',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const walletManager = getWalletManager();
      const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(payload);
      const webhookSignature =
        (req.headers['x-helius-signature'] as string | undefined) ??
        (req.headers['x-helius-webhook-signature'] as string | undefined) ??
        (req.headers['helius-signature'] as string | undefined) ??
        '';

      if (process.env['NODE_ENV'] === 'production') {
        const secret = config.HELIUS_WEBHOOK_SECRET;
        if (!secret) {
          sendError(
            res,
            'Helius webhook secret is not configured',
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            ERROR_CODE.OPERATION_FAILED
          );
          return;
        }

        if (!verifyHeliusSignature(rawBody, webhookSignature, secret)) {
          sendError(
            res,
            'Invalid Helius webhook signature',
            HTTP_STATUS.UNAUTHORIZED,
            ERROR_CODE.UNAUTHORIZED
          );
          return;
        }
      }

      // Validate payload structure
      if (!payload.webhookID || !Array.isArray(payload.events)) {
        sendError(
          res,
          'Invalid Helius webhook payload',
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODE.VALIDATION_FAILED
        );
        return;
      }

      const managedWallets = walletManager.getAllWallets().map((wallet) => wallet.publicKey);
      const resolveTenantId = (walletAddress: string) =>
        walletManager.getTenantIdForPublicKey(walletAddress);

      const result = await handleHeliusWebhook(payload, resolveTenantId, managedWallets);

      if (!result.ok) {
        sendError(
          res,
          result.error.message,
          HTTP_STATUS.INTERNAL_SERVER_ERROR,
          ERROR_CODE.OPERATION_FAILED
        );
        return;
      }

      sendSuccess(res, { indexed: result.value.indexed, errors: result.value.errors });
    } catch (err) {
      logger.error('Helius webhook error', { error: String(err) });
      sendError(
        res,
        'Webhook processing failed',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODE.OPERATION_FAILED
      );
    }
  })
);

/**
 * Query indexed transactions
 * GET /api/data/transactions?wallet=...&type=transfer_sol&limit=100
 */
app.get(
  '/api/data/transactions',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const tracker = getDataTracker();
    const filter = {
      tenantId,
      walletAddress: req.query['wallet'] as string | undefined,
      type: req.query['type'] as string | undefined,
      status: req.query['status'] as string | undefined,
      limit: req.query['limit'] ? Math.min(parseInt(req.query['limit'] as string), 1000) : 100,
      offset: req.query['offset'] ? parseInt(req.query['offset'] as string) : 0,
    };

    const result = await tracker.queryTransactions(filter);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(res, result.value);
  })
);

/**
 * Get single indexed transaction by signature
 */
app.get(
  '/api/data/transactions/:signature',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const tracker = getDataTracker();
    const signature = req.params['signature'];
    if (!signature) {
      sendError(
        res,
        'Signature is required',
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODE.VALIDATION_FAILED
      );
      return;
    }
    const result = await tracker.getTransaction(signature);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.NOT_FOUND);
      return;
    }

    // Verify tenant owns this transaction
    if (result.value.tenantId !== tenantId) {
      sendError(res, 'Access denied', HTTP_STATUS.FORBIDDEN, ERROR_CODE.UNAUTHORIZED);
      return;
    }

    sendSuccess(res, result.value);
  })
);

/**
 * Query indexed intents
 * GET /api/data/intents?agentId=...&status=executed&limit=50
 */
app.get(
  '/api/data/intents',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const tracker = getDataTracker();
    const filter = {
      tenantId,
      agentId: req.query['agentId'] as string | undefined,
      status: req.query['status'] as string | undefined,
      limit: req.query['limit'] ? Math.min(parseInt(req.query['limit'] as string), 1000) : 100,
      offset: req.query['offset'] ? parseInt(req.query['offset'] as string) : 0,
    };

    const result = await tracker.queryIntents(filter);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(res, result.value);
  })
);

/**
 * Query system events for tenant
 * GET /api/data/events?limit=100
 */
app.get(
  '/api/data/events',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const tracker = getDataTracker();
    const limit = req.query['limit'] ? Math.min(parseInt(req.query['limit'] as string), 1000) : 100;

    const result = await tracker.queryEvents(tenantId, limit);

    if (!result.ok) {
      sendError(res, result.error.message, HTTP_STATUS.BAD_REQUEST, ERROR_CODE.OPERATION_FAILED);
      return;
    }

    sendSuccess(res, result.value);
  })
);

/**
 * Unified DeFi activity timeline for dashboard
 * GET /api/data/timeline?limit=100
 */
app.get(
  '/api/data/timeline',
  protectedRoute(),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getTenantIdOrFail(req, res);
    if (!tenantId) return;

    const limit = req.query['limit'] ? Math.min(parseInt(req.query['limit'] as string), 500) : 100;
    const tracker = getDataTracker();

    const [txResult, intentResult, eventResult] = await Promise.all([
      tracker.queryTransactions({ tenantId, limit: 500 }),
      tracker.queryIntents({ tenantId, limit: 500 }),
      tracker.queryEvents(tenantId, 500),
    ]);

    if (!txResult.ok || !intentResult.ok || !eventResult.ok) {
      sendError(
        res,
        'Failed to build timeline from indexed data',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODE.OPERATION_FAILED
      );
      return;
    }

    const defiIntentTypes = new Set([
      'swap',
      'stake',
      'unstake',
      'liquid_stake',
      'provide_liquidity',
      'remove_liquidity',
      'deposit_lending',
      'withdraw_lending',
      'borrow_lending',
      'repay_lending',
      'farm_deposit',
      'farm_harvest',
      'wrap_token',
      'unwrap_token',
      'composite_strategy',
    ]);

    const timeline = [
      ...txResult.value
        .filter((tx: IndexedTransaction) => defiIntentTypes.has(tx.type))
        .map((tx) => ({
          id: tx.id,
          kind: 'transaction',
          timestamp: tx.createdAt,
          txType: tx.type,
          signature: tx.signature,
          walletAddress: tx.walletAddress,
          amount: tx.amount,
          protocol: tx.programId,
          status: tx.status,
          data: tx.parsedData,
        })),
      ...intentResult.value
        .filter((intent: IndexedIntent) => defiIntentTypes.has(intent.intentType))
        .map((intent) => ({
          id: intent.id,
          kind: 'intent',
          timestamp: intent.executedAt ?? intent.createdAt,
          intentType: intent.intentType,
          agentId: intent.agentId,
          status: intent.status,
          signature: intent.signature,
          params: intent.params,
          result: intent.result,
          error: intent.error,
        })),
      ...eventResult.value
        .filter((event: IndexedEvent) => event.data['category'] === 'defi')
        .map((event) => ({
          id: event.id,
          kind: 'event',
          timestamp: event.createdAt,
          eventType: event.eventType,
          entityId: event.entityId,
          data: event.data,
        })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    sendSuccess(res, {
      tenantId,
      total: timeline.length,
      timeline,
    });
  })
);

/**
 * Get data pipeline health status
 * Returns indexing lag, transaction count, and health status
 */
app.get(
  '/api/data/health',
  asyncHandler(async (req: Request, res: Response) => {
    const tracker = getDataTracker();
    const result = tracker.getHealth();

    if (!result.ok) {
      sendError(
        res,
        result.error.message,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODE.OPERATION_FAILED
      );
      return;
    }

    sendSuccess(res, result.value);
  })
);

// ============================================
// WEBSOCKET SERVER
// ============================================

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

interface WebSocketClient extends WebSocket {
  isAlive?: boolean;
  lastHeartbeat?: number;
}

function setupWebSocket(server: import('http').Server): void {
  wss = new WebSocketServer({
    server,
    // H-2: Validate origin for WebSocket connections
    verifyClient: (info: {
      origin?: string;
      req: { headers: Record<string, string | string[] | undefined> };
    }) => {
      const origin =
        info.origin ??
        (Array.isArray(info.req.headers['origin'])
          ? info.req.headers['origin'][0]
          : info.req.headers['origin']) ??
        '';
      // Allow connections with no origin (e.g. CLI tools, server-to-server)
      if (!origin || typeof origin !== 'string') return true;
      // Allow configured CORS origins
      if (corsOriginsList.some((allowed: string) => origin === allowed)) return true;
      // In production, allow Vercel and Railway domains
      if (process.env['NODE_ENV'] === 'production') {
        if (/\.vercel\.app$/.test(origin) || /\.railway\.app$/.test(origin)) {
          return true;
        }
      }
      logger.warn('WebSocket connection rejected — origin not allowed', { origin });
      return false;
    },
  });

  wss.on('connection', (ws: WebSocketClient) => {
    logger.info('WebSocket client connected', {
      clientCount: wss?.clients.size || 0,
      timestamp: new Date().toISOString(),
    });

    // Initialize heartbeat state
    ws.isAlive = true;
    ws.lastHeartbeat = Date.now();

    // Helper: safely send JSON to WebSocket
    const safeSend = (obj: unknown) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(obj));
        }
      } catch (error) {
        logger.warn('Failed to send WebSocket message', {
          error: sanitizeError(error),
          readyState: ws.readyState,
        });
      }
    };

    // Send initial connection message
    safeSend({
      type: 'connection_established',
      timestamp: new Date().toISOString(),
      data: { clientCount: wss?.clients.size || 0 },
    });

    // Send initial state
    const orchestrator = getOrchestrator();
    const agents = orchestrator.getAllAgents();
    safeSend({
      type: 'initial_state',
      data: { agents },
    });

    // Respond to client pings
    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastHeartbeat = Date.now();
      logger.debug('WebSocket pong received', {
        clientCount: wss?.clients.size || 0,
      });
    });

    // Handle client messages (pings, etc.)
    ws.on('message', (data: Buffer) => {
      try {
        // Safely decode buffer to string
        let messageStr: string;
        try {
          messageStr = data.toString('utf8');
        } catch (error) {
          logger.warn('Failed to decode WebSocket message buffer', { error: sanitizeError(error) });
          return;
        }

        // Safely parse JSON
        let message: unknown;
        try {
          message = JSON.parse(messageStr);
        } catch (error) {
          logger.warn('Failed to parse WebSocket message JSON', { error: sanitizeError(error) });
          return;
        }

        // Handle ping messages
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'ping'
        ) {
          safeSend({ type: 'pong', timestamp: new Date().toISOString() });
        }
      } catch (error) {
        logger.error('Unexpected error in WebSocket message handler', {
          error: sanitizeError(error),
        });
      }
    });

    // Subscribe to events (with error handling)
    const unsubscribe = eventBus.subscribe((event: SystemEvent) => {
      try {
        safeSend(event);
      } catch (error) {
        logger.error('Failed to send event to WebSocket client', {
          error: sanitizeError(error),
        });
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected', {
        clientCount: (wss?.clients.size || 0) - 1,
        timestamp: new Date().toISOString(),
      });
      unsubscribe();
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', {
        error: sanitizeError(error),
        clientCount: wss?.clients.size || 0,
      });
    });
  });

  // Start heartbeat interval (30 seconds)
  heartbeatInterval = setInterval(() => {
    if (!wss) return;

    const now = Date.now();
    const heartbeatTimeoutMs = 60_000; // 60 second timeout

    wss.clients.forEach((ws: WebSocketClient) => {
      // Check if client responded to previous ping
      if (!ws.isAlive) {
        logger.warn('WebSocket heartbeat timeout, terminating client', {
          clientCount: wss?.clients.size || 0,
        });
        return ws.terminate();
      }

      // Mark as not alive and send ping
      ws.isAlive = false;
      try {
        ws.ping();
        logger.debug('WebSocket heartbeat ping sent', {
          clientCount: wss?.clients.size || 0,
        });
      } catch (error) {
        logger.warn('Failed to send WebSocket ping', { error: sanitizeError(error) });
      }
    });

    // Log heartbeat status
    if ((wss?.clients.size || 0) > 0) {
      logger.debug('WebSocket heartbeat cycle completed', {
        activeClients: wss?.clients.size || 0,
        timestamp: new Date().toISOString(),
      });
    }
  }, 30_000); // 30 second heartbeat interval

  logger.info('WebSocket server started', {
    attachedToHttpServer: true,
    heartbeatIntervalMs: 30_000,
  });
}

// ============================================
// SERVER STARTUP
// ============================================

let httpServer: import('http').Server | null = null;

export function startServer(): void {
  const config = getConfig();

  // Initialize data tracker and attach to event bus
  const tracker = getDataTracker();
  attachDataTracker(eventBus);
  logger.info('Data tracker initialized and attached to event bus');

  httpServer = app.listen(config.PORT, () => {
    logger.info('API server started', { port: config.PORT });
  });

  setupWebSocket(httpServer);
}

// Graceful shutdown — drain in-flight requests before exiting
function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  const orchestrator = getOrchestrator();
  orchestrator.shutdown();

  // Stop heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info('WebSocket heartbeat stopped');
  }

  // Close WebSocket server (stop accepting new connections)
  if (wss) {
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close();
  }

  // Close HTTP server (drain in-flight requests with a timeout)
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export { app };
