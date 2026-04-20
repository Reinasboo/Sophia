# v1.0.0 — Sophia: Autonomous Wallet System for Solana

**First stable release** of the Agentic Wallet System—a production-grade autonomous AI agent wallet platform for Solana Devnet.

---

## Highlights

### Autonomous Agent Platform

- **4 built-in agent strategies**: Accumulator, Distributor, Balance Guard, Trader — each with Zod-validated, runtime-configurable parameters
- **Strategy Registry**: extensible registry with marketplace-style browser UI
- **Multi-agent orchestrator**: run up to 20 concurrent agents, each with its own encrypted wallet
- **Dynamic configuration**: update agent params and execution settings at runtime without restart

### Bring Your Own Agent (BYOA)

- Register external AI agents via REST API and grant them intent-based wallet access
- **5 intent types**: `REQUEST_AIRDROP`, `TRANSFER_SOL`, `TRANSFER_TOKEN`, `QUERY_BALANCE`, `AUTONOMOUS`
- Bearer-token authentication per external agent
- Full intent history logging for audit

### Full DeFi Autonomous Capabilities

- `AUTONOMOUS` intent type enables unrestricted on-chain interaction with safety guardrails
- **8 autonomous actions**: `airdrop`, `transfer_sol`, `transfer_token`, `query_balance`, `execute_instructions`, `raw_transaction`, `swap`, `create_token`
- Interact with **14+ known Solana programs**: Token Program, Memo v2, Jupiter, PumpSwap, Raydium, Orca Whirlpool, Pump.fun, Bonk.fun, Metaplex, Marinade, and more
- Arbitrary instruction submission for any deployed program

### Security (Audited)

- **AES-256-GCM** encrypted key storage with scrypt key derivation
- **Admin API key** (`X-Admin-Key`) required for all mutation endpoints
- **Autonomous intent safety guardrails**: rate limits, transfer caps, minimum balance reserve
- Prototype pollution prevention on all `z.record()` schemas
- Error response sanitization (no stack traces leaked)
- WebSocket origin validation
- Configurable CORS origins
- Raw transaction program inspection/logging before signing
- Token transfer decimal awareness (not hardcoded)
- Full security audit with 26 findings identified and fixed

### Real-time Dashboard

- Next.js 14 + React + Tailwind CSS frontend
- 11 routes: dashboard, agents, agent detail, transactions, connected agents, strategies, intent history
- 5-step agent creation wizard with dynamic parameter forms
- WebSocket live updates for agent activities and transactions
- Activity feed, stats cards, transaction explorer links

---

## Architecture

| Layer             | Technology                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| **Frontend**      | Next.js 14, React 18, Tailwind CSS, WebSocket                           |
| **API Server**    | Express.js, Zod validation, REST + WebSocket                            |
| **Agent Runtime** | TypeScript class hierarchy, strategy pattern, event-driven orchestrator |
| **Wallet Layer**  | AES-256-GCM encryption, policy engine, intent validation                |
| **Blockchain**    | Solana Devnet via @solana/web3.js v1.91.0, @solana/spl-token            |

## Quick Start

```bash
git clone https://github.com/Reinasboo/Agentic-wallet.git
cd Agentic-wallet
npm install
cd apps/frontend && npm install && cd ../..
cp .env.example .env  # or use the provided .env
npm run dev
```

Dashboard at `http://localhost:3000` · API at `http://localhost:3001` · WebSocket at `ws://localhost:3002`

## Key Commits

| Commit    | Description                                                    |
| --------- | -------------------------------------------------------------- |
| `d29e50f` | Complete system with Claude-inspired UI redesign               |
| `91e1393` | First security audit: CORS, auth, timing leak, memory bounds   |
| `e8f3a27` | AUTONOMOUS intent, intent history logging                      |
| `fe47c51` | Full documentation update for all features                     |
| `d9288b6` | Transaction logging fixes, config sync, full DeFi capabilities |
| `0ee55d0` | Comprehensive security audit: 26 findings fixed                |

## Environment Variables

| Variable                | Default                         | Description                          |
| ----------------------- | ------------------------------- | ------------------------------------ |
| `SOLANA_RPC_URL`        | `https://api.devnet.solana.com` | Solana RPC endpoint                  |
| `SOLANA_NETWORK`        | `devnet`                        | Network (devnet only for safety)     |
| `PORT`                  | `3001`                          | API server port                      |
| `WS_PORT`               | `3002`                          | WebSocket port                       |
| `KEY_ENCRYPTION_SECRET` | —                               | AES encryption secret (min 16 chars) |
| `ADMIN_API_KEY`         | —                               | Admin key for mutation endpoints     |
| `CORS_ORIGINS`          | localhost                       | Comma-separated allowed origins      |
| `MAX_AGENTS`            | `20`                            | Maximum concurrent agents            |
| `LOG_LEVEL`             | `info`                          | Logging level                        |

## License

See repository for license details.
