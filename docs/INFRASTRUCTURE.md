# Infrastructure Architecture & Operations

**Last Updated**: May 5, 2026 | **Version**: 1.0.0 | **Status**: Mainnet Production

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Tech Stack](#tech-stack)
3. [Infrastructure Components](#infrastructure-components)
4. [Network Topology](#network-topology)
5. [Data Flow](#data-flow)
6. [Deployment Architecture](#deployment-architecture)
7. [Monitoring & Observability](#monitoring--observability)
8. [Disaster Recovery](#disaster-recovery)

---

## System Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Layer                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Frontend (Next.js 14 + React + Tailwind CSS)            │   │
│  │  • Real-time WebSocket dashboard                         │   │
│  │  • Agent creation & management UI                        │   │
│  │  • Transaction explorer                                  │   │
│  │  • Performance monitoring                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────┬──────────────────────────────────────────────────┘
              │ HTTPS + WSS (TLS 1.3)
┌─────────────▼──────────────────────────────────────────────────┐
│                    API Gateway                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Express.js Server (Mainnet Production)                   │   │
│  │ • Request routing & validation (Zod)                     │   │
│  │ • Rate limiting (30 TX/min per wallet)                   │   │
│  │ • CORS & security headers                                │   │
│  │ • WebSocket connection management                        │   │
│  │ • Admin authentication (X-Admin-Key)                     │   │
│  │ • BYOA agent authentication (Bearer tokens)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────┬──────────────────────────────────────────────────┘
              │ Internal network
┌─────────────▼──────────────────────────────────────────────────┐
│              Business Logic Layer                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Agent Orchestrator (Multi-Tenant)                      │    │
│  │ • Agent factory & lifecycle mgmt                       │    │
│  │ • Strategy registry & validation                       │    │
│  │ • Intent routing & sequencing                          │    │
│  │ • Event-driven state management                        │    │
│  │ • 4 built-in strategies + custom support               │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ BYOA Integration Router                                │    │
│  │ • External agent registration                          │    │
│  │ • Intent validation & dispatch                         │    │
│  │ • Bearer token verification                            │    │
│  │ • 11 autonomous actions                                │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│            Security & Encryption Layer                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Wallet Manager                                         │    │
│  │ ⚠ ONLY layer with access to private keys              │    │
│  │ • AES-256-GCM encryption (scrypt key derivation)       │    │
│  │ • Per-wallet policy enforcement                        │    │
│  │ • Isolated signing operations                          │    │
│  │ • Intent validation gates                              │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│              Blockchain Interaction                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ RPC Layer (@solana/web3.js)                            │    │
│  │ • Transaction builder                                  │    │
│  │ • Pre-flight simulation                                │    │
│  │ • RPC client pooling & health checks                   │    │
│  │ • Rate limit enforcement (1200 calls/min)              │    │
│  │ • Error recovery & retry logic                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                         │                                        │
│           ┌─────────────┴──────────────┐                        │
│           │                            │                        │
│      ┌────▼────────┐          ┌────────▼────┐                 │
│      │ Solana RPC  │          │ Helius API  │                 │
│      │ (Primary)   │          │ (Webhooks)  │                 │
│      └─────────────┘          └─────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│              Persistence Layer                                    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ PostgreSQL (Railway)                                   │    │
│  │ • Agent state & configurations                         │    │
│  │ • Wallet metadata & policy records                     │    │
│  │ • Transaction history & events                         │    │
│  │ • BYOA agent registrations                             │    │
│  │ • Intent audit logs                                    │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Core Runtime

| Component          | Technology      | Version | Purpose                            |
| ------------------ | --------------- | ------- | ---------------------------------- |
| **Backend**        | Node.js + TypeScript | 20+     | Server runtime & business logic    |
| **Web Framework**   | Express.js      | 4.18    | HTTP/WebSocket API server          |
| **Frontend**       | Next.js 14      | 14.1    | React server-side rendering        |
| **Blockchain SDK** | @solana/web3.js | 1.91    | Solana RPC client & utilities      |

### Security & Validation

| Component          | Technology      | Version | Purpose                            |
| ------------------ | --------------- | ------- | ---------------------------------- |
| **Encryption**     | Node.js crypto  | builtin | AES-256-GCM, scrypt key derivation |
| **Data Validation** | Zod            | 3.22    | Runtime schema validation          |
| **Token Auth**     | jose            | 5.10    | JWT verification for BYOA          |
| **Authentication** | Privy           | latest  | OAuth2 user login & session mgmt   |

### Database & Storage

| Component          | Technology      | Version | Purpose                            |
| ------------------ | --------------- | ------- | ---------------------------------- |
| **Primary DB**     | PostgreSQL      | 14+     | Persistent state & audit logs      |
| **Connection Pool**| pg              | 8.20    | Database connection management     |
| **Real-Time Sync** | Helius Webhooks | -       | On-chain transaction indexing      |

### Development & Testing

| Component          | Technology      | Version | Purpose                            |
| ------------------ | --------------- | ------- | ---------------------------------- |
| **Testing**        | Vitest          | 1.2     | Unit, integration, e2e tests       |
| **Linting**        | ESLint          | 8.57    | Code quality & standards           |
| **Formatting**     | Prettier        | 3.8     | Code formatting consistency        |
| **Module Loading** | tsx             | 4.7     | TypeScript module transpilation    |

### Deployment & Infrastructure

| Component          | Technology      | Version | Purpose                            |
| ------------------ | --------------- | ------- | ---------------------------------- |
| **Backend Deploy** | Railway         | latest  | Container orchestration & hosting  |
| **Frontend Deploy**| Vercel          | latest  | Edge-optimized frontend hosting    |
| **CI/CD**          | GitHub Actions  | -       | Automated testing & deployment     |
| **VCS**            | GitHub          | -       | Version control & collaboration    |

---

## Infrastructure Components

### 1. Frontend (Vercel)

**Deployment**: `https://sophia-production-1a83.up.railway.app` (backend)\
**Frontend**: Next.js 14 with React 18.2 + TypeScript

**Responsibilities**:
- Server-side rendering of pages (dashboard, agents, explorer)
- Real-time WebSocket connections to backend
- Agent creation and configuration UI
- Transaction explorer with drill-down
- Performance metrics & monitoring visualization

**Environment Variables**:
```
NEXT_PUBLIC_API_URL=https://sophia-production-1a83.up.railway.app
NEXT_PUBLIC_WS_URL=wss://sophia-production-1a83.up.railway.app
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_PRIVY_APP_ID=<privy-app-id>
PRIVY_APP_ID=<privy-app-id>
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<app-id>/jwks.json
```

**Scaling**: Vercel Edge Functions, automatic CDN distribution

### 2. Backend (Railway)

**Deployment**: Container-based, automated CI/CD\
**Service Name**: `sophia`\
**Network**: Mainnet production

**Responsibilities**:
- REST API endpoint serving all business logic
- WebSocket server for real-time updates
- Request validation & rate limiting
- Agent orchestration & event dispatch
- Wallet encryption & signing isolation
- BYOA integration & intent routing

**Environment Variables** (production):
```
NODE_ENV=production
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
DATABASE_URL=postgres://user:pass@host:5432/db
HELIUS_WEBHOOK_SECRET=<webhook-secret>
KEY_ENCRYPTION_SECRET=<strong-random-256-bit-base64>
ADMIN_API_KEY=<strong-random-256-bit-hex>
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<app-id>/jwks.json
PRIVY_APP_ID=<privy-app-id>
CORS_ORIGINS=https://sophia-production-1a83.up.railway.app
```

**Scaling**: Auto-scaling on CPU/memory, configurable replica count

### 3. Database (Railway PostgreSQL)

**Service**: `Postgres` (Railway managed)\
**Connection**: Internal Railway network\
**Backup**: Railway automatic daily backups

**Schema Highlights**:
- `agents` — Agent configurations & state
- `wallets` — Wallet encryption metadata
- `transactions` — On-chain transaction history
- `intents` — Intent audit logs
- `byoa_agents` — External agent registrations
- `service_policies` — BYOA policy definitions
- `events` — System event stream

**Maintenance**:
- Automated backups (Railway default: 7-day retention)
- Connection pooling via `pg` (default: 10-30 connections)
- Indexes on high-query columns (agent_id, wallet_id, signature)

### 4. RPC Providers

**Primary**: `https://api.mainnet-beta.solana.com` (public Solana RPC)\
**Webhook Integration**: Helius for transaction indexing

**Rate Limits**:
- Global: 1200 RPC calls/minute (system-wide)
- Per-wallet: 30 transactions/minute
- Overflow protection: Requests queued to next 60-second window

**Failover**: Circuit breaker pattern on RPC health checks

### 5. External Services

**Privy (OAuth)**:
- User authentication via email, wallet, or social login
- JWT token verification via JWKS endpoint
- Rate-limited auth callback (`/api/auth/privy-callback`)

**Helius (Webhooks)**:
- Real-time transaction confirmation indexing
- Webhook signature verification
- Automatic retries with exponential backoff

---

## Network Topology

### Request Flow (REST)

```
Browser Request
    │
    ▼
Vercel Edge (TLS 1.3)
    │
    ▼
Next.js Frontend App
    │
    ├─ Page Rendering (SSR)
    │
    ├─ API Route (/api/*)
    │  ├─ Privy callback (/api/auth/privy-callback)
    │  └─ Admin proxy (/api/proxy-admin)
    │     │
    │     ▼ (HTTPS + Admin Key)
    │
    ▼ (Request to Backend)
Railway Container
    │
    ├─ Express Middleware
    │  ├─ CORS validation
    │  ├─ Rate limiting
    │  └─ Request logging
    │
    ├─ Route Handler
    │  ├─ Input validation (Zod)
    │  ├─ Business logic
    │  └─ Database queries
    │
    ▼ (PostgreSQL)
Database
    │
    ▼ (Response)
Frontend
```

### WebSocket Flow (Real-Time)

```
Browser
    │ (WSS upgrade)
    ▼
Vercel Frontend
    │ (WebSocket connection)
    ▼
Railway Backend (WebSocket Server)
    │
    ├─ Heartbeat (30-second ping/pong)
    ├─ Agent events (status changes)
    ├─ Transaction updates
    └─ Performance metrics
    │
    ▼ (Event sourcing from Database)
Database (Event Stream)
```

### Solana On-Chain

```
Railway Backend (RPC Client)
    │ (JSON-RPC over HTTPS)
    ├─ Primary: api.mainnet-beta.solana.com
    ├─ Health check: every 30s
    └─ Circuit breaker: 5 failures → fallback
    │
    ▼
Solana Network (Mainnet)
    │
    ├─ Simulate transactions (pre-flight)
    ├─ Submit transactions
    ├─ Poll for confirmation
    └─ Index via Helius Webhooks
    │
    ▼
Railway Backend (Webhook Receiver)
    │
    ▼ (Transaction indexing)
Database (Transaction History)
```

---

## Data Flow

### Agent Creation Flow

```
User → Dashboard → "Create Agent" Button
    │
    ▼
Frontend Form (5-step wizard)
    │
    ▼
POST /api/agents (via /api/proxy-admin)
    │
    ▼ (X-Admin-Key validation)
Backend: Agent Factory
    │
    ├─ Validate schema (Zod)
    ├─ Encrypt wallet key (AES-256-GCM)
    ├─ Register strategy (check strategy registry)
    ├─ Create wallet in Wallet Manager
    └─ Insert into PostgreSQL
    │
    ▼
Return: { agentId, walletPublicKey, status }
    │
    ▼
Frontend: Update dashboard, WebSocket subscribe to agent events
    │
    ▼
Backend: Emit agent_created event (WebSocket broadcast)
```

### BYOA Intent Submission Flow

```
External Agent → POST /api/byoa/intents
    │ (Bearer token)
    ▼
Backend: Privy Validation
    │
    ├─ Extract Bearer token
    ├─ Verify JWT (jose + JWKS)
    └─ Lookup agent registration in DB
    │
    ▼
Validate Intent (Zod)
    │
    ├─ Intent type in supported list
    ├─ Parameters schema match
    └─ Recipient/amount validation
    │
    ▼
Intent Router: Route to Agent
    │
    ├─ Load agent config
    ├─ Load wallet (encrypted)
    ├─ Run policy engine (daily limits, rates, etc.)
    └─ If OK, queue for execution
    │
    ▼
Wallet Manager: Execute Intent
    │
    ├─ Decrypt private key (using KEY_ENCRYPTION_SECRET)
    ├─ Build transaction
    ├─ Simulate (pre-flight)
    ├─ Sign with Solana keypair
    └─ Submit to network
    │
    ▼
RPC Layer: Poll for Confirmation
    │
    ├─ Monitor transaction signature
    ├─ Helius webhook triggers on confirmation
    └─ Index into transaction history
    │
    ▼
Database: Insert transaction record + event log
    │
    ▼
WebSocket Broadcast: Update frontend (if user connected)
```

### Rate Limiting Cascade

```
Request arrives at Backend
    │
    ▼ Client Rate Limit (30 TX/min per wallet)
    ├─ Check: wallet_id + ":" + current_minute
    ├─ If count >= 30: Reject (429 Too Many Requests)
    └─ If count < 30: Increment counter, continue
    │
    ▼ Global RPC Budget (1200 calls/min)
    ├─ Check: system-wide RPC call counter
    ├─ If >= 1200: Queue request to next minute window
    └─ If < 1200: Increment counter, allow RPC call
    │
    ▼ Per-Endpoint Rate Limit (if applicable)
    ├─ Auth endpoint: 5 attempts/min per IP
    └─ Continue or reject
    │
    ▼ Request proceeds
```

---

## Deployment Architecture

### Backend Deployment (Railway)

1. **GitHub Webhook Trigger** → Push to `main` branch
2. **Railway Detection** → Picks up `railway.json` config
3. **Build Phase**:
   ```bash
   npm ci
   npm run build  # TypeScript compilation
   ```
4. **Runtime Phase**:
   ```bash
   NODE_ENV=production node dist/index.js
   ```
5. **Health Check** → Railway pings `GET /api/health` every 30s
6. **Auto-Restart** → If unhealthy for 5 minutes, restart container

**Scaling Config** (Railway):
- CPU limit: 1 core
- Memory limit: 512 MB
- Auto-scaling: Triggered on CPU > 80% or memory > 90%
- Min replicas: 1
- Max replicas: 3

### Frontend Deployment (Vercel)

1. **GitHub Webhook Trigger** → Push to `main` branch
2. **Vercel Detection** → Reads `vercel.json` and `package.json` build script
3. **Build Phase**:
   ```bash
   npm ci
   cd apps/frontend && npm ci
   npm run build:full  # Backend build + frontend build
   ```
4. **Deployment** → Automatically distributed to Edge network
5. **Environment Sync** → Pulls from Vercel project settings

**Optimization**:
- ISR (Incremental Static Regeneration) on pages
- Image optimization via `next/image`
- Edge middleware for request routing

### Environment Promotion

**Mainnet Readiness Script**:
```bash
npm run mainnet:check      # Validate production config
npm run mainnet:migrate-env # Generate .env.mainnet
```

**Pre-Deployment Validation**:
- ✅ All required env vars set
- ✅ Solana network = mainnet-beta
- ✅ Database connection OK
- ✅ No devnet-only strategies in config
- ✅ HELIUS_WEBHOOK_SECRET configured

---

## Monitoring & Observability

### Health Checks

**Backend Health Endpoint**:
```
GET /api/health
Response: { success: true, data: { status: "healthy" } }
```

**Frontend Health**:
- Vercel built-in uptime monitoring
- CloudFlare CDN health checks

### Logging

**Backend Logs** (Railway console):
- Startup: `Starting Agentic Wallet System`
- Errors: Formatted with context (request ID, stack trace)
- DB: Connection pool events

**Frontend Logs** (Browser DevTools):
- API calls (fetch/axios)
- WebSocket connection events
- React component errors (ErrorBoundary)

### Metrics to Monitor

**System Level**:
- API response time (p50, p95, p99)
- Error rate (500s, 4xx)
- Database query time (slow query log)
- RPC call latency
- WebSocket connection count

**Business Level**:
- Agents active (count)
- Transactions submitted (per hour)
- Transaction success rate
- BYOA intents processed (per day)

**Infrastructure Level** (Railway):
- CPU usage
- Memory usage
- Network I/O
- Container restart count

### Alerting Strategy

**Critical**:
- Backend offline (health endpoint fails)
- Database connection fails
- RPC provider down (circuit breaker triggered)
- Helius webhook failures

**High**:
- Error rate > 5%
- Transaction success rate < 95%
- RPC latency > 5 seconds
- WebSocket disconnections > 10/min

**Medium**:
- Database slow queries
- API response time degradation
- Memory usage > 80%

---

## Disaster Recovery

### Backup Strategy

**Database Backups** (Railway):
- Automatic daily snapshots (7-day retention)
- Manual backup before major changes

**Configuration Backups**:
- GitHub source control (all code & config)
- Vercel environment variables (encrypted)
- Railway environment variables (encrypted)

### Failover Procedures

**Backend Container Failure**:
1. Railway auto-restarts unhealthy container
2. If persistent, scale up (add replica)
3. Manual intervention: Check logs, redeploy

**Database Connection Loss**:
1. Automatic retry with exponential backoff
2. Requests queued to in-memory buffer (max 5 min)
3. Manual: Connect to Railway PostgreSQL console

**RPC Provider Down**:
1. Circuit breaker activates
2. Requests queue to next available minute window
3. Manual: Verify Solana network status, switch RPC if needed

### Recovery Time Objectives (RTO)

| Failure Scenario                | Target RTO | Procedure                          |
| ------------------------------- | ---------- | ---------------------------------- |
| Container restart               | 30 seconds | Auto-restart via Railway health    |
| Database failover               | 5 minutes  | Connect to backup, restore state   |
| RPC provider degradation        | 1 minute   | Circuit breaker routes to backoff  |
| Complete system outage          | 1 hour     | Manual deployment from GitHub      |
| Data loss (database corruption) | 4 hours    | Restore from latest backup snap    |

### Testing Disaster Recovery

**Monthly DR Drills**:
```bash
# 1. Verify backup integrity
railway db backup list

# 2. Test restore procedure (staging only)
# 3. Validate all critical functions post-restore
# 4. Document findings & update runbook
```

---

## Related Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Step-by-step deployment procedures
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-2 operations & troubleshooting
- [MAINNET_READINESS_CHECKLIST.md](./MAINNET_READINESS_CHECKLIST.md) — Pre-launch validation
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) — Encryption & security model
- [API_REFERENCE.md](./API_REFERENCE.md) — REST endpoint documentation
