# API Reference

**Version**: 1.0.0 | **Last Updated**: May 5, 2026 | **Base URL**: `https://sophia-production-1a83.up.railway.app`

Complete REST API documentation with request/response examples and error handling.

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Response Format](#response-format)
4. [Error Handling](#error-handling)
5. [Endpoints](#endpoints)
6. [WebSocket API](#websocket-api)

---

## Authentication

### Admin Authentication (Server-Side)

**Header**: `X-Admin-Key`

Used for administrative operations that mutate server state. The key is a 256-bit hex string (64 characters).

```bash
curl -X POST https://sophia-production-1a83.up.railway.app/api/agents \
  -H "X-Admin-Key: <your-admin-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Agent"}'
```

**Where to set**:
- Railway environment variable: `ADMIN_API_KEY`
- Backend validates all mutations against this key
- Rotate quarterly for security

### BYOA (Bring Your Own Agent) Authentication

**Header**: `Authorization: Bearer <jwt-token>`

Used by external agents to submit intents. The token is a JWT signed by Privy.

```bash
curl -X POST https://sophia-production-1a83.up.railway.app/api/byoa/intents \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"intentType": "transfer", "amount": 1000000}'
```

**Token structure**:
- Issued by: Privy OAuth provider
- Signature: RS256 (RSA)
- JWKS URL: `https://auth.privy.io/api/v1/apps/<app-id>/jwks.json`
- Claims: `sub` (user ID), `iat` (issued at), `exp` (expiration)
- Expiration: 24 hours

### User Authentication (Frontend)

**Header**: `Cookie: privy_session=<session-cookie>`

Automatically handled by Privy SDK on frontend. Backend validates via callback endpoint.

```typescript
// frontend/pages/api/auth/privy-callback.ts
// Receives Privy OAuth token, verifies JWT, creates session
```

---

## Rate Limiting

### Client Rate Limit (Per Wallet)

**Limit**: 30 transactions per minute

**Response when exceeded**:
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "success": false,
  "error": "rate_limit_exceeded",
  "data": {
    "retryAfter": 45,
    "limit": 30,
    "window": "60s"
  }
}
```

**Calculation**:
- Wallet ID + Current minute = Rate limit bucket
- Counter incremented on each request
- Counter reset every 60 seconds
- If count >= 30: Reject request

### Global RPC Rate Limit (System-Wide)

**Limit**: 1200 RPC calls per minute

**Behavior when exceeded**:
- Requests are queued
- Queued requests execute in next 60-second window
- Response returns immediately with `queued: true`

```json
{
  "success": true,
  "data": {
    "status": "queued",
    "estimatedExecutionTime": "45s"
  }
}
```

### Rate Limit Headers

Included in all responses:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 28
X-RateLimit-Reset: 1714968045
```

---

## Response Format

### Success Response

All successful responses follow this format:

```json
{
  "success": true,
  "data": {
    "agentId": "agent_123",
    "walletAddress": "123...456",
    "status": "active"
  },
  "timestamp": "2026-05-05T10:30:00Z"
}
```

### Error Response

All errors follow this format:

```json
{
  "success": false,
  "error": "validation_error",
  "message": "Invalid agent configuration",
  "details": {
    "field": "name",
    "reason": "must be 1-50 characters"
  },
  "timestamp": "2026-05-05T10:30:00Z"
}
```

### Pagination Response

For list endpoints:

```json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Agent 1" },
    { "id": "2", "name": "Agent 2" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Error Handling

### Error Codes

| Code                    | HTTP | Meaning                                   |
| ----------------------- | ---- | ----------------------------------------- |
| `validation_error`      | 400  | Request body validation failed            |
| `unauthorized`          | 401  | Missing or invalid auth token             |
| `forbidden`             | 403  | Auth token valid but lacks permission     |
| `not_found`             | 404  | Resource does not exist                   |
| `rate_limit_exceeded`   | 429  | Rate limit exceeded                       |
| `internal_server_error` | 500  | Unexpected server error                   |
| `service_unavailable`   | 503  | Server overloaded or maintenance mode     |

### Retry Logic

**Client implementation**:

```typescript
async function makeRequest(url: string, options: any, maxRetries: number = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 60;
        console.log(`Rate limited. Retrying in ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      
      if (!response.ok && response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Server error. Retrying in ${backoff}ms...`);
          await sleep(backoff);
          continue;
        }
      }
      
      return response.json();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
```

---

## Endpoints

### Health Check

**Endpoint**: `GET /api/health`

**Authentication**: None

**Description**: System health status. Used for monitoring and load balancer health checks.

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "rpc": "connected",
    "database": "connected",
    "timestamp": "2026-05-05T10:30:00Z"
  }
}
```

---

### Agents

#### Create Agent

**Endpoint**: `POST /api/agents`

**Authentication**: `X-Admin-Key`

**Request Body**:
```json
{
  "name": "Treasury Agent",
  "description": "Manages treasury operations",
  "walletAddress": "EPjFWaobqkDDP7w....",
  "encryptedPrivateKey": "base64-encoded-aes-256-gcm-encrypted-key",
  "strategy": "scheduled-payer",
  "configuration": {
    "recipients": [
      { "address": "ABC...123", "amount": 1000000 }
    ],
    "interval": "daily"
  },
  "policies": {
    "dailyLimit": 10000000,
    "maxTransactionSize": 1000000,
    "allowedOperations": ["transfer", "swap"]
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "agentId": "agent_e8f5b9a2",
    "walletAddress": "EPjFWaobqkDDP7w...",
    "status": "active",
    "createdAt": "2026-05-05T10:30:00Z",
    "strategy": "scheduled-payer",
    "nextExecutionTime": "2026-05-06T10:30:00Z"
  }
}
```

**Errors**:
- `400 Bad Request` — Invalid configuration
- `403 Forbidden` — Invalid admin key
- `409 Conflict` — Wallet address already registered

---

#### Get Agent

**Endpoint**: `GET /api/agents/:agentId`

**Authentication**: `X-Admin-Key`

**Response**:
```json
{
  "success": true,
  "data": {
    "agentId": "agent_e8f5b9a2",
    "name": "Treasury Agent",
    "walletAddress": "EPjFWaobqkDDP7w...",
    "status": "active",
    "strategy": "scheduled-payer",
    "balance": 50000000,
    "totalTransactions": 125,
    "lastExecutionTime": "2026-05-05T10:00:00Z",
    "configuration": { ... },
    "policies": { ... },
    "createdAt": "2026-05-01T08:00:00Z"
  }
}
```

---

#### List Agents

**Endpoint**: `GET /api/agents`

**Authentication**: `X-Admin-Key`

**Query Parameters**:
- `page` (default: 1)
- `pageSize` (default: 20, max: 100)
- `status` (filter: active | paused | inactive)
- `strategy` (filter by strategy type)

**Response**:
```json
{
  "success": true,
  "data": [
    { "agentId": "agent_1", "name": "...", "status": "active" },
    { "agentId": "agent_2", "name": "...", "status": "paused" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

#### Update Agent

**Endpoint**: `PATCH /api/agents/:agentId`

**Authentication**: `X-Admin-Key`

**Request Body** (all fields optional):
```json
{
  "name": "Updated Agent Name",
  "configuration": { ... },
  "policies": { ... },
  "status": "paused"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "agentId": "agent_e8f5b9a2",
    "name": "Updated Agent Name",
    "updatedAt": "2026-05-05T10:30:00Z"
  }
}
```

---

#### Delete Agent

**Endpoint**: `DELETE /api/agents/:agentId`

**Authentication**: `X-Admin-Key`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "agentId": "agent_e8f5b9a2",
    "status": "deleted",
    "deletedAt": "2026-05-05T10:30:00Z"
  }
}
```

---

### Transactions

#### Submit Transaction

**Endpoint**: `POST /api/transactions`

**Authentication**: `X-Admin-Key`

**Request Body**:
```json
{
  "agentId": "agent_e8f5b9a2",
  "intentType": "transfer",
  "parameters": {
    "recipient": "ABC...123",
    "amount": 1000000,
    "memo": "Salary payment"
  }
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_5f8e3c1a",
    "signature": "3vZ5...8kL9",
    "status": "submitted",
    "agentId": "agent_e8f5b9a2",
    "estimatedConfirmationTime": "10-30 seconds",
    "submittedAt": "2026-05-05T10:30:00Z"
  }
}
```

**Errors**:
- `400 Bad Request` — Invalid parameters
- `403 Forbidden` — Agent policy violation
- `429 Too Many Requests` — Rate limit exceeded

---

#### Get Transaction

**Endpoint**: `GET /api/transactions/:transactionId`

**Authentication**: `X-Admin-Key`

**Response**:
```json
{
  "success": true,
  "data": {
    "transactionId": "txn_5f8e3c1a",
    "signature": "3vZ5...8kL9",
    "status": "confirmed",
    "agentId": "agent_e8f5b9a2",
    "intentType": "transfer",
    "parameters": { ... },
    "slot": 285621234,
    "blockTime": 1714968000,
    "fee": 5000,
    "confirmationStatus": "finalized",
    "submittedAt": "2026-05-05T10:30:00Z",
    "confirmedAt": "2026-05-05T10:30:15Z"
  }
}
```

---

#### List Transactions

**Endpoint**: `GET /api/transactions`

**Authentication**: `X-Admin-Key`

**Query Parameters**:
- `page` (default: 1)
- `pageSize` (default: 50, max: 500)
- `agentId` (filter)
- `status` (filter: submitted | confirmed | failed)
- `since` (RFC3339 timestamp)
- `until` (RFC3339 timestamp)

**Response**:
```json
{
  "success": true,
  "data": [
    { "transactionId": "txn_1", "signature": "...", "status": "confirmed" },
    { "transactionId": "txn_2", "signature": "...", "status": "confirmed" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 2345,
    "totalPages": 47
  }
}
```

---

### BYOA (Bring Your Own Agent)

#### Register BYOA Agent

**Endpoint**: `POST /api/byoa/register`

**Authentication**: `Authorization: Bearer <jwt>`

**Request Body**:
```json
{
  "agentName": "External AI Agent",
  "agentDescription": "Custom decision-making agent",
  "supportedIntents": ["transfer", "swap"],
  "webhookUrl": "https://external-service.com/webhook"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "byoaAgentId": "byoa_8f3e5c2a",
    "status": "active",
    "apiKey": "sk_live_...",  // Use in future requests
    "supportedIntents": ["transfer", "swap"],
    "registeredAt": "2026-05-05T10:30:00Z"
  }
}
```

---

#### Submit Intent (BYOA)

**Endpoint**: `POST /api/byoa/intents`

**Authentication**: `Authorization: Bearer <jwt>`

**Request Body**:
```json
{
  "intentType": "transfer",
  "parameters": {
    "recipient": "ABC...123",
    "amount": 1000000,
    "memo": "External agent transfer"
  }
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "intentId": "intent_3a7f5e1c",
    "intentType": "transfer",
    "status": "queued",
    "estimatedExecutionTime": "30-60 seconds",
    "queuedAt": "2026-05-05T10:30:00Z"
  }
}
```

---

#### Get Intent Status

**Endpoint**: `GET /api/byoa/intents/:intentId`

**Authentication**: `Authorization: Bearer <jwt>`

**Response**:
```json
{
  "success": true,
  "data": {
    "intentId": "intent_3a7f5e1c",
    "intentType": "transfer",
    "status": "executed",
    "transactionSignature": "3vZ5...8kL9",
    "parameters": { ... },
    "result": {
      "success": true,
      "slot": 285621234
    },
    "queuedAt": "2026-05-05T10:30:00Z",
    "executedAt": "2026-05-05T10:30:45Z"
  }
}
```

---

## WebSocket API

### Connection

**Endpoint**: `wss://sophia-production-1a83.up.railway.app`

**Connection Headers**:
```
Authorization: Bearer <privy-jwt>
X-Client-ID: <unique-client-identifier>
```

### Message Format

**Server → Client**:
```json
{
  "type": "agent_update",
  "data": {
    "agentId": "agent_e8f5b9a2",
    "status": "active",
    "balance": 50000000,
    "lastExecutionTime": "2026-05-05T10:30:00Z"
  },
  "timestamp": "2026-05-05T10:30:00Z"
}
```

### Message Types

#### Agent Status Update

Emitted when agent status changes:

```json
{
  "type": "agent_status_update",
  "data": {
    "agentId": "agent_e8f5b9a2",
    "status": "active",
    "nextExecutionTime": "2026-05-06T10:30:00Z"
  }
}
```

#### Transaction Confirmation

Emitted when transaction is confirmed on-chain:

```json
{
  "type": "transaction_confirmed",
  "data": {
    "transactionId": "txn_5f8e3c1a",
    "signature": "3vZ5...8kL9",
    "slot": 285621234,
    "fee": 5000
  }
}
```

#### Metrics Update

Emitted every 10 seconds with performance metrics:

```json
{
  "type": "metrics_update",
  "data": {
    "activeAgents": 12,
    "transactionsLast24h": 1245,
    "averageConfirmationTime": 8.5,
    "uptime": "99.98%"
  }
}
```

### Error Messages

```json
{
  "type": "error",
  "code": "auth_failed",
  "message": "Invalid authorization token",
  "timestamp": "2026-05-05T10:30:00Z"
}
```

### Heartbeat

Client sends heartbeat every 30 seconds:

```json
{
  "type": "ping"
}
```

Server responds:

```json
{
  "type": "pong",
  "timestamp": "2026-05-05T10:30:00Z"
}
```

---

## Code Examples

### cURL

```bash
# Create agent
curl -X POST https://sophia-production-1a83.up.railway.app/api/agents \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agent",
    "walletAddress": "...",
    "encryptedPrivateKey": "...",
    "strategy": "scheduled-payer"
  }'

# Get agent
curl https://sophia-production-1a83.up.railway.app/api/agents/agent_123 \
  -H "X-Admin-Key: your-admin-key"

# List transactions
curl "https://sophia-production-1a83.up.railway.app/api/transactions?page=1&pageSize=50" \
  -H "X-Admin-Key: your-admin-key"
```

### TypeScript/JavaScript

```typescript
import axios from 'axios';

const API_BASE_URL = 'https://sophia-production-1a83.up.railway.app';
const ADMIN_KEY = process.env.ADMIN_API_KEY;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Admin-Key': ADMIN_KEY,
    'Content-Type': 'application/json',
  },
});

// Get agent
const agent = await apiClient.get(`/api/agents/agent_123`);

// Create agent
const newAgent = await apiClient.post('/api/agents', {
  name: 'My Agent',
  // ... other fields
});

// WebSocket connection
const ws = new WebSocket('wss://sophia-production-1a83.up.railway.app', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
  },
});

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Message:', message);
};
```

### Python

```python
import requests
import json

API_BASE_URL = "https://sophia-production-1a83.up.railway.app"
ADMIN_KEY = os.getenv("ADMIN_API_KEY")

headers = {
    "X-Admin-Key": ADMIN_KEY,
    "Content-Type": "application/json",
}

# Create agent
response = requests.post(
    f"{API_BASE_URL}/api/agents",
    headers=headers,
    json={
        "name": "My Agent",
        # ... other fields
    }
)

agent = response.json()
print(f"Created agent: {agent['data']['agentId']}")

# Get transactions
response = requests.get(
    f"{API_BASE_URL}/api/transactions?page=1&pageSize=50",
    headers=headers
)

transactions = response.json()
print(f"Total transactions: {transactions['pagination']['total']}")
```

---

## Related Documentation

- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) — System architecture
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) — Authentication & encryption
- [BYOA_INTEGRATION_GUIDE.md](../docs/BYOA_INTEGRATION_GUIDE.md) — BYOA integration details
