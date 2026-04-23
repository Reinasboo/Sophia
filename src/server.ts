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
import { getWalletManager } from './wallet/index.js';
import { getSolanaClient } from './rpc/index.js';
import { getConfig, getExplorerUrl } from './utils/config.js';
import { createLogger } from './utils/logger.js';
import { secureCompare } from './utils/encryption.js';
import { ApiResponse, SystemEvent, AgentConfig } from './utils/types.js';
import {
  getAgentRegistry,
  getWalletBinder,
  getIntentRouter,
  ExternalIntent,
  SupportedIntentType,
} from './integration/index.js';
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
const corsOrigins = config.CORS_ORIGINS
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
  : [`http://localhost:${config.PORT}`, `http://localhost:3000`, 'http://127.0.0.1:3000'];

if (corsOrigins.length === 0) {
  logger.warn('No valid CORS origins configured. Using secure defaults.');
}

app.use(
  cors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH'],
  })
);

// L-3 FIX: Explicitly handle OPTIONS preflight so browsers get correct CORS headers.
app.options('*', cors({ origin: corsOrigins, methods: ['GET', 'POST', 'PATCH'] }));

// H-3 FIX: Only trust the immediate upstream reverse proxy (first hop).
// This prevents X-Forwarded-For spoofing for rate-limit bypass.
// Set TRUST_PROXY=0 to disable (e.g. when running without a proxy).
app.set('trust proxy', process.env['TRUST_PROXY'] !== '0' ? TRUST_PROXY_HOP_COUNT : false);

// Limit request body size to prevent DoS
app.use(express.json({ limit: REQUEST_BODY_SIZE_LIMIT }));

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
// ADMIN AUTH MIDDLEWARE
// ============================================

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
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const walletManager = getWalletManager();
    const client = getSolanaClient();

    // Parse pagination parameters
    const limit = Math.min(
      Math.max(parseInt(String(req.query['limit'] ?? '50'), 10) || 50, 1),
      500 // Max 500 per request
    );
    const offset = Math.max(parseInt(String(req.query['offset'] ?? '0'), 10) || 0, 0);

    const allAgents = orchestrator.getAllAgents();
    const total = allAgents.length;

    // Apply pagination to the original list
    const paginatedAgents = allAgents.slice(offset, offset + limit);

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
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
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
    const result = await orchestrator.createAgent(validation.data as AgentConfig);

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
  requireAdminAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const registry = getStrategyRegistry();
    const strategies = registry.getAllDTOs();

    sendSuccess(res, strategies);
  })
);

app.get(
  '/api/strategies/:name',
  requireAdminAuth,
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
// TRANSACTION ENDPOINTS
// ============================================

app.get(
  '/api/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const orchestrator = getOrchestrator();
    const allTransactions = orchestrator.getAllTransactions();

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
    const transactions = allTransactions.slice(start, start + limit);

    sendSuccess(res, {
      transactions,
      total: allTransactions.length,
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
      z.enum(['REQUEST_AIRDROP', 'TRANSFER_SOL', 'TRANSFER_TOKEN', 'QUERY_BALANCE', 'AUTONOMOUS'])
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

/**
 * Register an external agent and receive a wallet + control token.
 * The control token is returned ONCE; the caller must store it securely.
 */
app.post(
  '/api/byoa/register',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
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
    const registry = getAgentRegistry();
    const binder = getWalletBinder();

    // 1. Register agent
    const regResult = registry.register({
      agentName: data.agentName,
      agentType: data.agentType,
      agentEndpoint: data.agentEndpoint,
      supportedIntents: data.supportedIntents as SupportedIntentType[],
      metadata: data.metadata,
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

    // 2. Create and bind a wallet
    const bindResult = binder.bindNewWallet(agentId);
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

/**
 * Generate a challenge for agent endpoint verification.
 * Required for challenge-response verification method.
 * Agent must POST the challenge back signed.
 */
app.post(
  '/api/byoa/verify/challenge-generate',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { agentId } = req.body;
    if (!agentId || typeof agentId !== 'string') {
      sendError(res, 'agentId is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODE.VALIDATION_FAILED);
      return;
    }

    const registry = getAgentRegistry();

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
 * List all connected external agents (for frontend observation).
 */
app.get(
  '/api/byoa/agents',
  asyncHandler(async (_req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const client = getSolanaClient();
    const walletManager = getWalletManager();

    const agents = registry.getAllAgents();

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
 */
app.get(
  '/api/byoa/agents/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const router = getIntentRouter();
    const client = getSolanaClient();
    const walletManager = getWalletManager();

    const agentResult = registry.getAgent(req.params['id'] ?? '');
    if (!agentResult.ok) {
      sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
      return;
    }

    const agent = agentResult.value;
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
 */
app.get(
  '/api/byoa/agents/:id/intents',
  asyncHandler(async (req: Request, res: Response) => {
    const router = getIntentRouter();
    const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);
    const intents = router.getIntentHistory(req.params['id'] ?? '', limit);

    sendSuccess(res, intents);
  })
);

/**
 * Deactivate an external agent.
 * Admin action â€” no bearer token required (dashboard use).
 */
app.post(
  '/api/byoa/agents/:id/deactivate',
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const result = registry.deactivateAgent(req.params['id'] ?? '');

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
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const result = registry.activateAgent(req.params['id'] ?? '');

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
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const result = registry.revokeAgent(req.params['id'] ?? '');

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
  requireAdminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const registry = getAgentRegistry();
    const agentId = req.params['id'] ?? '';

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
 * Includes intents from both BYOA external agents and built-in orchestrated agents.
 */
app.get(
  '/api/byoa/intents',
  asyncHandler(async (req: Request, res: Response) => {
    const router = getIntentRouter();
    const limit = Math.min(parseInt(req.query['limit'] as string) || 100, 500);
    const intents = router.getIntentHistory(undefined, limit);

    sendSuccess(res, intents);
  })
);

/**
 * Global intent history endpoint â€” returns ALL intents (built-in + BYOA).
 * The frontend intent-history page uses this.
 */
app.get(
  '/api/intents',
  asyncHandler(async (req: Request, res: Response) => {
    const router = getIntentRouter();
    const limit = Math.min(parseInt(req.query['limit'] as string) || 200, 1000);
    const intents = router.getIntentHistory(undefined, limit);

    sendSuccess(res, intents);
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

function setupWebSocket(port: number): void {
  wss = new WebSocketServer({
    port,
    // H-2: Validate origin for WebSocket connections
    verifyClient: (info: {
      origin?: string;
      req: { headers: Record<string, string | string[] | undefined> };
    }) => {
      const origin = info.origin ?? info.req.headers['origin'] ?? '';
      // Allow connections with no origin (e.g. CLI tools, server-to-server)
      if (!origin) return true;
      // Allow configured CORS origins
      if (corsOrigins.some((allowed: string) => origin === allowed)) return true;
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

    // Send initial connection message
    ws.send(
      JSON.stringify({
        type: 'connection_established',
        timestamp: new Date().toISOString(),
        data: { clientCount: wss?.clients.size || 0 },
      })
    );

    // Send initial state
    const orchestrator = getOrchestrator();
    const agents = orchestrator.getAllAgents();
    ws.send(
      JSON.stringify({
        type: 'initial_state',
        data: { agents },
      })
    );

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
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch (error) {
        logger.warn('Failed to parse WebSocket message', { error: sanitizeError(error) });
      }
    });

    // Subscribe to events
    const unsubscribe = eventBus.subscribe((event: SystemEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
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

  logger.info('WebSocket server started', { port, heartbeatIntervalMs: 30_000 });
}

// ============================================
// SERVER STARTUP
// ============================================

let httpServer: import('http').Server | null = null;

export function startServer(): void {
  const config = getConfig();

  httpServer = app.listen(config.PORT, () => {
    logger.info('API server started', { port: config.PORT });
  });

  setupWebSocket(config.WS_PORT);
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
