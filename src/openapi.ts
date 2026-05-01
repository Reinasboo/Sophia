/**
 * OpenAPI 3.0 Specification for Sophia Agentic Wallet API
 *
 * This generates the OpenAPI/Swagger documentation for all REST endpoints.
 */

export const openAPISpec = {
  openapi: '3.0.0',
  info: {
    title: 'Sophia Agentic Wallet API',
    description: 'RESTful API for autonomous Solana wallet orchestration and intent routing',
    version: '1.0.0',
    contact: {
      name: 'Support',
      url: 'https://github.com/sophia-labs/agentic-wallet',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
    {
      url: 'https://api.sophia.dev',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      adminAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Admin-Auth',
        description: 'Admin API Key for mutations',
      },
      bearerToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Bearer token for BYOA agent authentication',
      },
    },
    schemas: {
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'agent-123' },
          name: { type: 'string', example: 'Balance Guard' },
          status: {
            type: 'string',
            enum: ['idle', 'thinking', 'executing', 'waiting', 'error', 'stopped', 'paused'],
          },
          walletPublicKey: {
            type: 'string',
            example: '8WxCw9ULRkr4QHLtvyeHR7Q6yDwEF8qM8S5JpHJX7xRs',
          },
          strategy: { type: 'string', example: 'balance-guard' },
          config: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          lastCycleAt: { type: 'string', format: 'date-time' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          signature: { type: 'string', example: 'abc123...' },
          agentId: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'failed'] },
          timestamp: { type: 'integer' },
          type: { type: 'string', example: 'transfer' },
          from: { type: 'string' },
          to: { type: 'string' },
          amount: { type: 'number' },
          gasSpent: { type: 'number' },
        },
      },
      BalanceInfo: {
        type: 'object',
        properties: {
          sol: { type: 'number', example: 1.5 },
          lamports: { type: 'string', example: '1500000000' },
        },
      },
      TokenBalance: {
        type: 'object',
        properties: {
          mint: { type: 'string' },
          amount: { type: 'string' },
          decimals: { type: 'integer' },
          uiAmount: { type: 'number' },
        },
      },
      Intent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          agentId: { type: 'string' },
          type: { type: 'string', example: 'REQUEST_AIRDROP' },
          payload: { type: 'object' },
          status: { type: 'string', enum: ['pending', 'executed', 'failed'] },
          result: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      RateLimitStats: {
        type: 'object',
        properties: {
          rpc: {
            type: 'object',
            properties: {
              used: { type: 'integer' },
              limit: { type: 'integer' },
              utilization: { type: 'string', example: '45.2%' },
              blocked: { type: 'integer' },
            },
          },
          wallets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                used: { type: 'integer' },
                max: { type: 'integer' },
                utilization: { type: 'string' },
                blocked: { type: 'integer' },
              },
            },
          },
        },
      },
      CacheStats: {
        type: 'object',
        properties: {
          cache: {
            type: 'object',
            properties: {
              sizes: {
                type: 'object',
                properties: {
                  balances: { type: 'integer' },
                  transactions: { type: 'integer' },
                  metadata: { type: 'integer' },
                  total: { type: 'integer' },
                },
              },
              hitRate: { type: 'string', example: '78.5%' },
              totalEntries: { type: 'integer' },
              estimatedRpcSavings: { type: 'string', example: '78% reduction' },
            },
          },
          stats: { type: 'object' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        summary: 'Health check endpoint',
        responses: {
          '200': {
            description: 'System is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/stats': {
      get: {
        tags: ['System'],
        summary: 'Get system statistics',
        responses: {
          '200': {
            description: 'System statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalAgents: { type: 'integer' },
                    activeAgents: { type: 'integer' },
                    totalTransactions: { type: 'integer' },
                    successRate: { type: 'number' },
                    systemUptime: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List all agents',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of agents',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    agents: { type: 'array', items: { $ref: '#/components/schemas/Agent' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Agents'],
        summary: 'Create a new agent',
        security: [{ adminAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  strategy: { type: 'string' },
                  config: { type: 'object' },
                },
                required: ['name', 'strategy'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Agent created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } },
          },
          '400': { description: 'Invalid input' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/agents/{id}': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent details',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Agent details',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Agent' } } },
          },
          '404': { description: 'Agent not found' },
        },
      },
      delete: {
        tags: ['Agents'],
        summary: 'Delete an agent',
        security: [{ adminAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Agent deleted' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/pause': {
      post: {
        tags: ['Agents'],
        summary: 'Pause an agent',
        security: [{ adminAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Agent paused' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/agents/{id}/resume': {
      post: {
        tags: ['Agents'],
        summary: 'Resume a paused agent',
        security: [{ adminAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Agent resumed' },
          '404': { description: 'Agent not found' },
        },
      },
    },
    '/api/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List transactions',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'agentId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'List of transactions',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Transaction' },
                },
              },
            },
          },
        },
      },
    },
    '/api/transactions/{signature}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction details',
        parameters: [{ name: 'signature', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Transaction details',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Transaction' } },
            },
          },
          '404': { description: 'Transaction not found' },
        },
      },
    },
    '/api/intents': {
      get: {
        tags: ['Intents'],
        summary: 'Get intent history',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } }],
        responses: {
          '200': {
            description: 'Intent history',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Intent' },
                },
              },
            },
          },
        },
      },
    },
    '/api/monitoring/rate-limits': {
      get: {
        tags: ['Monitoring'],
        summary: 'Get rate limit status',
        responses: {
          '200': {
            description: 'Rate limit stats',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RateLimitStats' } },
            },
          },
        },
      },
    },
    '/api/monitoring/cache': {
      get: {
        tags: ['Monitoring'],
        summary: 'Get cache performance metrics',
        responses: {
          '200': {
            description: 'Cache statistics',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CacheStats' } },
            },
          },
        },
      },
    },
    '/api/wallets/{address}/balance': {
      get: {
        tags: ['Wallets'],
        summary: 'Get wallet balance',
        parameters: [{ name: 'address', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Wallet balance',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/BalanceInfo' } },
            },
          },
        },
      },
    },
    '/api/wallets/{address}/tokens': {
      get: {
        tags: ['Wallets'],
        summary: 'Get wallet token balances',
        parameters: [{ name: 'address', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Token balances',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TokenBalance' },
                },
              },
            },
          },
        },
      },
    },
    '/api/byoa/intents': {
      post: {
        tags: ['BYOA'],
        summary: 'Submit intent as external agent',
        security: [{ bearerToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  type: { type: 'string', example: 'TRANSFER_SOL' },
                  payload: { type: 'object' },
                },
                required: ['type', 'payload'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Intent accepted' },
          '400': { description: 'Invalid intent' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/byoa/service-policies': {
      get: {
        tags: ['BYOA Service Policies'],
        summary: 'List tenant-scoped service policies',
        security: [{ bearerToken: [] }],
        responses: {
          '200': {
            description: 'List of service policies',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      serviceId: { type: 'string' },
                      capPerTransaction: { type: 'number' },
                      dailyBudgetAmount: { type: 'number' },
                      cooldownSeconds: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['BYOA Service Policies'],
        summary: 'Create a new service policy',
        security: [{ bearerToken: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  serviceId: { type: 'string' },
                  capPerTransaction: { type: 'number' },
                  dailyBudgetAmount: { type: 'number' },
                  cooldownSeconds: { type: 'integer', default: 0 },
                },
                required: ['serviceId', 'capPerTransaction', 'dailyBudgetAmount'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Service policy created' },
          '400': { description: 'Invalid policy' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/byoa/service-policies/{serviceId}': {
      get: {
        tags: ['BYOA Service Policies'],
        summary: 'Get service policy by ID',
        security: [{ bearerToken: [] }],
        parameters: [
          {
            name: 'serviceId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Service policy details' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Service policy not found' },
        },
      },
      patch: {
        tags: ['BYOA Service Policies'],
        summary: 'Update service policy',
        security: [{ bearerToken: [] }],
        parameters: [
          {
            name: 'serviceId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  capPerTransaction: { type: 'number' },
                  dailyBudgetAmount: { type: 'number' },
                  cooldownSeconds: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Service policy updated' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Service policy not found' },
        },
      },
    },
    '/api/byoa/service-policies/{serviceId}/x402-descriptor': {
      post: {
        tags: ['BYOA Service Policies'],
        summary: 'Generate x402 payment descriptor',
        security: [{ bearerToken: [] }],
        parameters: [
          {
            name: 'serviceId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  paymentAddress: { type: 'string', description: 'Service Solana account' },
                  amount: { type: 'number', description: 'Amount in lamports' },
                  durationSeconds: { type: 'integer', default: 300 },
                },
                required: ['paymentAddress', 'amount'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'x402 payment descriptor generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    serviceId: { type: 'string' },
                    policy: { type: 'object' },
                    descriptor: { type: 'object' },
                    encodedHeader: { type: 'string', description: 'Base64-encoded x402 header' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Service policy not found' },
        },
      },
    },
  },
};
