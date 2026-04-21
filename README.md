<div align="center">

# Sophia

### Enterprise-Grade Autonomous Wallet Orchestration for Solana

**Intent-driven · Security-first · BYOA-ready**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/Reinasboo/Sophia/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Reinasboo/Sophia/actions/workflows/ci.yml)
[![Security Scan](https://github.com/Reinasboo/Sophia/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Reinasboo/Sophia/actions/workflows/security.yml)
[![Last Commit](https://img.shields.io/github/last-commit/Reinasboo/Sophia)](https://github.com/Reinasboo/Sophia/commits/main)
[![Open Issues](https://img.shields.io/github/issues/Reinasboo/Sophia)](https://github.com/Reinasboo/Sophia/issues)
[![GitHub Stars](https://img.shields.io/github/stars/Reinasboo/Sophia?style=social)](https://github.com/Reinasboo/Sophia/stargazers)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-Devnet-blueviolet?logo=solana&logoColor=white)](https://solana.com)
[![Status](https://img.shields.io/badge/Status-Production%20Ready%20(P1)-brightgreen)](PRODUCTION_ROADMAP.md)

</div>

---

## Status: Production Ready ✨

**P0 Complete** — All production-blocking items delivered (pre-flight simulation, rate limiting, E2E tests, runbook)

**P1 Complete** — First-month production features deployed:
- ✅ **WebSocket Heartbeat** — 30-second bidirectional ping/pong with auto-reconnection
- ✅ **Agent Context Caching** — 30-50% RPC reduction via intelligent TTL-based caching
- ✅ **Performance Dashboard** — Real-time metrics visualization and per-agent analytics
- ✅ **Transaction Explorer** — Drill-down debugging with simulation results and gas breakdown
- ✅ **OpenAPI 3.0 Documentation** — Swagger-compatible specification at `/api/openapi.json`
- ✅ **BYOA Integration Guide** — Step-by-step integration with Python and Node.js examples

**Next:** P2 (Multi-wallet agents, scheduling, load tests) — See [PRODUCTION_ROADMAP.md](PRODUCTION_ROADMAP.md)

---

## Overview

Agentic Wallet is a security-first orchestration framework that enables autonomous AI agents to operate Solana wallets through a validated, intent-based execution model. It provides **wallet isolation**, **encrypted key management**, **auditable operations**, and a **Bring Your Own Agent (BYOA)** integration layer — all governed by enterprise-grade contribution standards, CI/CD, and security policies.

Whether you're building autonomous treasury bots, fleet-scale DeFi operators, or integrating external AI systems with on-chain capabilities, Agentic Wallet provides the secure infrastructure to do it without giving agents direct access to private keys.

---

## Table of Contents

- [Status](#status-production-ready-)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Monitoring & Operations](#monitoring--operations)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)
- [Maintainers](#maintainers)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend Dashboard                        │
│              (Next.js 14 · React · Tailwind CSS)             │
│         Real-time WebSocket · Agent Wizard · Explorer         │
└──────────────────────┬───────────────────────────────────────┘
                       │  REST + WebSocket
┌──────────────────────▼───────────────────────────────────────┐
│                      API Server (Express)                     │
│         Zod Validation · Admin Auth · CORS · Rate Limits      │
└──────┬───────────────────────────────────────┬───────────────┘
       │                                       │
┌──────▼──────────┐                   ┌────────▼───────────────┐
│  Agent Runtime   │                   │  BYOA Integration      │
│  (Orchestrator)  │                   │  (Intent Router)       │
│                  │                   │                        │
│  4 Built-in      │                   │  External agents auth  │
│  Strategies      │                   │  via bearer tokens     │
│  + Custom via    │                   │  5 intent types        │
│  Strategy        │                   │  11 autonomous actions │
│  Registry        │                   │  Full program autonomy │
└──────┬───────────┘                   └────────┬──────────────┘
       │           Intent Validation            │
       └──────────────────┬─────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                    Wallet Manager                             │
│        AES-256-GCM Encryption · Policy Engine · Signing      │
│        ⚠ ONLY layer with access to private keys              │
└─────────────────────────┬────────────────────────────────────┘
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                    RPC Layer (@solana/web3.js)                │
│       Transaction Builder · Simulation · Devnet Submission    │
└──────────────────────────────────────────────────────────────┘
```

> For deep architectural detail, see [ARCHITECTURE.md](ARCHITECTURE.md) and [DEEP_DIVE.md](DEEP_DIVE.md).

---

## Key Features

### Agent Platform

- **4 built-in strategies** — Accumulator, Distributor, Balance Guard, Scheduled Payer
- **Strategy Registry** — register and validate custom strategies at runtime (Zod schemas)
- **Multi-agent orchestrator** — run up to 20 concurrent agents, each with isolated wallets
- **Dynamic reconfiguration** — pause/resume agents, update parameters without downtime

### Bring Your Own Agent (BYOA)

- Register external AI agents via REST API with bearer-token authentication
- **5 intent types** — `REQUEST_AIRDROP`, `TRANSFER_SOL`, `TRANSFER_TOKEN`, `QUERY_BALANCE`, `AUTONOMOUS`
- **11 named autonomous actions** — airdrop, transfer SOL/tokens, swap, create token, stake, buy NFT, interact with any program, execute arbitrary instructions, raw transactions
- **Fully autonomous** — no program allowlists, no transfer caps, no recipient filtering; agents can interact with **any valid Solana program** including Jupiter, Raydium, Orca, Pump.fun, Bonk.fun, Marinade, Jito, Magic Eden, Tensor, Metaplex, Marginfi, Kamino, and any custom deployed program
- Unknown action names are automatically routed to instruction execution — the agent is never blocked
- Full intent history logging for audit and compliance
- **See [BYOA Integration Guide](docs/BYOA_INTEGRATION_GUIDE.md)** for code examples (Python + Node.js)

### Production-Ready Infrastructure (P1)

- **WebSocket Heartbeat** — 30-second bidirectional ping/pong with automatic reconnection and dead connection detection
- **Agent Context Caching** — 30-50% RPC reduction via balance (7.5s TTL), token (30s TTL), and transaction caching (30s TTL)
- **Performance Monitoring Dashboard** — real-time metrics, per-agent analytics, cache hit rate, RPC utilization
- **Transaction Explorer** — drill-down transaction details, simulation results, gas breakdown, Solana Explorer links
- **OpenAPI 3.0 Specification** — at `GET /api/openapi.json` for Swagger integration and IDE autocompletion
- **Rate Limiting Status** — endpoints for monitoring per-wallet TPS quotas and global RPC budget utilization

### Security

- **AES-256-GCM** encrypted key storage with scrypt key derivation
- Agents **never** access private keys — signing is isolated to the wallet layer
- Admin API key (`X-Admin-Key`) required for all mutation endpoints
- Per-wallet rate limits (30 TX/min), global RPC budget (1200 calls/min) with overflow protection
- Prototype pollution prevention, error sanitization, WebSocket origin validation
- 26-finding security audit completed and resolved
- **See [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md)** for deployment checklist and troubleshooting

### Real-Time Dashboard

- Next.js 14 frontend with **15 routes** — dashboard, agents, transactions, strategies, intent history, monitoring, explorer
- 5-step agent creation wizard with dynamic parameter forms
- **Live WebSocket updates** with 30-second heartbeat for agent activity and transactions
- **Performance metrics** page with real-time cache and rate-limit status
- **Transaction explorer** for detailed debugging and inspection
- Solana Explorer integration for transaction verification

---

## Tech Stack

| Layer             | Technology                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| **Frontend**      | Next.js 14, React 18, Tailwind CSS, **WebSocket + Heartbeat**, Chart.js   |
| **API Server**    | Express.js, Zod validation, REST + WebSocket, **OpenAPI 3.0**             |
| **Agent Runtime** | TypeScript, strategy pattern, event-driven orchestrator                   |
| **Wallet Layer**  | AES-256-GCM encryption, scrypt KDF, policy engine                         |
| **Blockchain**    | Solana Devnet via `@solana/web3.js` 1.91, `@solana/spl-token`, preflight  |
| **Caching**       | **Agent Context Cache** (balance, token, transaction TTLs)                |
| **Monitoring**    | Rate limiter with per-wallet quotas, cache performance metrics             |
| **Testing**       | Vitest (50+ tests: agent logic, wallet ops, E2E critical path, policies)  |
| **Linting**       | ESLint v9 (flat config), Prettier 3.x                                     |
| **CI/CD**         | GitHub Actions (lint, format, test, build, audit, security, auto-release) |

---

## Quick Start

```bash
git clone https://github.com/Reinasboo/Agentic-wallet.git
cd Agentic-wallet
npm install
cd apps/frontend && npm install && cd ../..
cp .env.example .env   # then edit with your values
npm run dev
```

| Service    | URL                     |
| ---------- | ----------------------- |
| Dashboard  | `http://localhost:3000` |
| API Server | `http://localhost:3001` |
| WebSocket  | `ws://localhost:3002`   |

---

## Installation

### Prerequisites

| Requirement | Version                 |
| ----------- | ----------------------- |
| Node.js     | ≥ 18.0 (20 recommended) |
| npm         | ≥ 9.0                   |
| Git         | latest                  |

### Step-by-Step

```bash
# Clone the repository
git clone https://github.com/Reinasboo/Agentic-wallet.git
cd Agentic-wallet

# Install backend dependencies
npm install

# Install frontend dependencies
cd apps/frontend
npm install
cd ../..

# Configure environment
cp .env.example .env
# Edit .env with your values — see Environment Variables below
```

### Build

```bash
npm run build
```

---

## Usage

### Run Development Server

```bash
# Start both backend and frontend concurrently
npm run dev

# Or run individually
npm run dev:backend
npm run dev:frontend
```

| Service         | URL                      | Purpose                                 |
| --------------- | ------------------------ | --------------------------------------- |
| Dashboard       | `http://localhost:3000`  | Web UI with agent wizard and monitoring |
| API Server      | `http://localhost:3001`  | REST + WebSocket endpoints              |
| WebSocket       | `ws://localhost:3002`    | Real-time agent updates (heartbeat)     |

### Monitor System Health

```bash
# Health check
curl http://localhost:3001/api/health

# System statistics
curl http://localhost:3001/api/stats

# Rate limiting status (per-wallet quotas + RPC budget)
curl http://localhost:3001/api/monitoring/rate-limits

# Cache performance metrics (hit rate, RPC savings)
curl http://localhost:3001/api/monitoring/cache

# API specification
curl http://localhost:3001/api/openapi.json
```

### Register a BYOA Agent

```bash
curl -X POST http://localhost:3001/api/byoa/register \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{
    "agentName": "ops-bot-01",
    "agentType": "remote",
    "agentEndpoint": "http://localhost:8080/agent",
    "supportedIntents": ["TRANSFER_SOL", "TRANSFER_TOKEN", "REQUEST_AIRDROP", "QUERY_BALANCE", "AUTONOMOUS"]
  }'
```

### Submit an Intent (BYOA)

```bash
curl -X POST http://localhost:3001/api/byoa/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <control-token>" \
  -d '{
    "intent": "TRANSFER_SOL",
    "params": {
      "recipient": "<recipient-public-key>",
      "amount": 0.1
    }
  }'
```

**See [BYOA Integration Guide](docs/BYOA_INTEGRATION_GUIDE.md)** for Python/Node.js client examples and complete API reference.

---

## Monitoring & Operations

### Performance Dashboard
Access at `http://localhost:3000/monitoring` for real-time insights:
- **Total transactions, success rate, active agents**
- **Cache hit rate** — visible RPC savings from caching layer
- **Per-agent metrics** — success %, gas spent, cycle time
- **RPC utilization** — global budget status and per-wallet quotas

### Transaction Explorer
Access at `http://localhost:3000/explorer/transactions` to debug:
- **Browse and filter** transactions by status (confirmed/failed/pending)
- **Drill into details** — full instruction logs, simulation results, gas breakdown
- **Link to Solana Explorer** for devnet transaction verification

### API Documentation
- **Interactive** at `http://localhost:3001/api/openapi.json`
- **Full reference** with cURL examples in [BYOA Integration Guide](docs/BYOA_INTEGRATION_GUIDE.md)
- **Endpoints** support OpenAPI/Swagger consumers and IDE integrations

### Operational Runbook
**[OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md)** covers:
- Pre-deployment checklist
- Environment setup and configuration
- Monitoring key metrics (CPU, memory, RPC budget, transaction success rate)
- Troubleshooting guide for 8 common issues
- Incident response procedures
- Scaling strategies (vertical and horizontal)

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                 | Description                                             | Default                         |
| ------------------------ | ------------------------------------------------------- | ------------------------------- |
| `SOLANA_RPC_URL`         | Solana RPC endpoint                                     | `https://api.devnet.solana.com` |
| `SOLANA_NETWORK`         | Network identifier                                      | `devnet`                        |
| `PORT`                   | API server port                                         | `3001`                          |
| `WS_PORT`                | WebSocket server port                                   | `3002`                          |
| `KEY_ENCRYPTION_SECRET`  | **Required.** Encryption secret for wallet key material | —                               |
| `ADMIN_API_KEY`          | **Required.** Admin API key for mutation endpoints      | —                               |
| `MAX_AGENTS`             | Maximum concurrent agents                               | `20`                            |
| `AGENT_LOOP_INTERVAL_MS` | Agent scheduler loop interval (ms)                      | `30000`                         |

> **Security:** Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Security

Agentic Wallet implements defense-in-depth security:

- **Key isolation** — private keys are encrypted at rest (AES-256-GCM) and never leave the wallet layer
- **Agent sandboxing** — agents receive read-only context; no cryptographic capabilities
- **BYOA token hashing** — control tokens are hashed in persistent storage
- **Input validation** — all API inputs validated with Zod schemas; prototype pollution mitigated
- **Audit trail** — every intent, decision, and transaction is logged
- **CI security gates** — CodeQL, TruffleHog secret scanning, dependency review on every PR

For vulnerability reporting, responsible disclosure expectations, and security architecture details, see [SECURITY.md](SECURITY.md).

---

## Testing

```bash
# Run full test suite
npm test -- --run

# Run in watch mode
npm test

# Lint and format check
npm run lint
npm run format:check
```

Tests cover agent decision logic, wallet management, encryption, data store operations, and agent factory creation.

---

## Project Structure

```
├── .github/              # Workflows, templates, dependabot, CODEOWNERS, copilot-instructions
├── apps/
│   └── frontend/         # Next.js 14 dashboard (15 routes including monitoring & explorer)
├── src/
│   ├── agent/            # Agent runtime — strategies, registry, orchestrator interface
│   ├── integration/      # BYOA adapter, registry, intent router, wallet binder
│   ├── orchestrator/     # Event-driven agent lifecycle orchestrator with pause/resume
│   ├── rpc/              # Solana RPC client + caching, transaction builder, preflight simulation
│   ├── types/            # Shared TypeScript type definitions (internal, tenant, shared)
│   ├── utils/            # Config, encryption, logging, store, types, rate limiter, cache
│   └── wallet/           # Wallet manager — key encryption, signing, policy
├── tests/                # Vitest suites (E2E critical path, policy engine, 50+ tests)
├── docs/                 # BYOA Integration Guide with code examples
├── data/                 # Runtime data (gitignored in production)
├── scripts/              # Utility scripts (e.g., DeFi demo)
├── ARCHITECTURE.md       # System design deep dive
├── DEEP_DIVE.md          # Design philosophy and rationale
├── OPERATOR_RUNBOOK.md   # Production deployment, monitoring, troubleshooting ✨ **NEW**
├── PRODUCTION_ROADMAP.md # Strategic prioritization and implementation roadmap ✨ **NEW**
├── SECURITY.md           # Vulnerability disclosure policy
├── CONTRIBUTING.md       # Contribution standards
├── CHANGELOG.md          # Release history (Keep a Changelog)
├── SKILLS.md             # Machine-readable capability reference
└── openapi.ts            # OpenAPI 3.0 specification ✨ **NEW**
```

**Key P1 Production-Ready Additions:**
- `apps/frontend/pages/monitoring/index.tsx` — Performance dashboard with real-time metrics
- `apps/frontend/pages/explorer/transactions.tsx` — Transaction drill-down and debugging
- `src/utils/agent-context-cache.ts` — Intelligent balance/token/transaction caching (30-50% RPC savings)
- `src/openapi.ts` — OpenAPI 3.0 specification for API documentation
- `docs/BYOA_INTEGRATION_GUIDE.md` — Complete integration guide with Python/Node.js examples
- `OPERATOR_RUNBOOK.md` — Comprehensive ops manual for production deployment
- `PRODUCTION_ROADMAP.md` — Strategic roadmap with P0/P1/P2 prioritization

---

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

**Key standards:**

- [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
- Branch naming: `feat/`, `fix/`, `docs/`, `test/`, `ci/`, `chore/`, `security/`
- All PRs require passing CI checks and CODEOWNERS approval
- Only `@Reinasboo` can merge into `main` — see [GOVERNANCE.md](.github/GOVERNANCE.md)
- See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

## Maintainers

| Role                 | Contact                                                           |
| -------------------- | ----------------------------------------------------------------- |
| **Lead Maintainer**  | [@Reinasboo](https://github.com/Reinasboo)                        |
| **Security Contact** | [security@agentic-wallet.dev](mailto:security@agentic-wallet.dev) |

---

<div align="center">

**[Documentation](ARCHITECTURE.md)** · **[Security](SECURITY.md)** · **[Contributing](CONTRIBUTING.md)** · **[Changelog](CHANGELOG.md)**

</div>
