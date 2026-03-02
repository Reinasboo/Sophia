# Agentic Wallet System for Solana

A production-grade autonomous AI agent wallet system for Solana Devnet. This system enables AI agents to programmatically manage wallets, sign transactions, and execute on-chain operations without human intervention.

![Architecture](docs/architecture-diagram.png)

## Features

- **Autonomous Agents**: Self-operating agents with rule-based decision making
- **Strategy Registry**: Extensible, Zod-validated strategy system with 4 built-in strategies
- **Dynamic Configuration**: Update agent strategy params and execution settings at runtime
- **Transaction Simulation**: Pre-flight simulation before every send to catch errors without paying fees
- **Autonomous Safety**: Program allowlist for `execute_instructions` (12 vetted DeFi programs)
- **API Rate Limiting**: Per-IP sliding window (120 req/min) on all endpoints
- **Pagination**: `/api/transactions` supports `page` and `limit` query params
- **Graceful Shutdown**: HTTP drain with 10-second timeout, clean WebSocket close
- **Secure Wallet Management**: AES-256-GCM encrypted key storage, scrypt KDF (N=32768), zero key after sign
- **Multi-Agent Support**: Run multiple independent agents simultaneously
- **Policy Engine**: Configurable constraints on agent actions
- **Bring Your Own Agent (BYOA)**: Register external AI agents and give them intent-based wallet access
- **Autonomous Intent**: Unrestricted `AUTONOMOUS` intent type for advanced agents — bypasses policy engine, fully logged
- **Real-time Dashboard**: Beautiful, Figma-quality frontend for monitoring and management
- **Strategy Browser**: Marketplace-style page for browsing available strategies
- **Multi-step Agent Wizard**: 5-step creation flow with dynamic parameter forms
- **WebSocket Events**: Live updates on agent activities
- **dApp / Protocol Interaction**: Interacts with deployed Solana programs — Token Program (SPL) for token transfers, Memo Program v2 for on-chain memos — beyond basic SystemProgram usage
- **Devnet Ready**: Safe testing on Solana Devnet

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Solana CLI (optional, for manual testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/agentic-wallet-system.git
cd agentic-wallet-system

# Install backend dependencies
npm install

# Install frontend dependencies
cd apps/frontend
npm install
cd ../..

# Copy environment configuration
cp .env.example .env
```

### Running the System

```bash
# Start both backend and frontend
npm run dev
```

This will start:
- **Backend API**: http://localhost:3001
- **WebSocket Server**: ws://localhost:3002
- **Frontend**: http://localhost:3000

### Creating Your First Agent

1. Open the dashboard at http://localhost:3000
2. Click "Create Agent"
3. **Step 1** — Name your agent
4. **Step 2** — Select a strategy:
   - **Accumulator**: Automatically requests airdrops to maintain balance
   - **Distributor**: Sends SOL to configured recipients
   - **Balance Guard**: Emergency airdrop when balance is critically low
   - **Scheduled Payer**: Recurring payments to a single recipient
5. **Step 3** — Configure strategy parameters (dynamic form, pre-filled with defaults)
6. **Step 4** — Set execution settings (cycle interval, max actions/day, auto-start)
7. **Step 5** — Review and create
8. Watch your agent operate autonomously!

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
│  (Next.js + React + Tailwind - READ ONLY observation)       │
└─────────────────────────────────────────────────────────────┘
                              │ REST API / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Orchestration Layer                       │
│  (Binds agents to wallets, manages lifecycle, emits events) │
└─────────────────────────────────────────────────────────────┘
          │                    │                     │
          ▼                    ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│   Agent Layer    │ │  Integration     │ │      Wallet Layer        │
│  (Decision maker │ │  Layer (BYOA)    │ │  (Key management,        │
│   emits intents) │ │  External agents │ │   transaction signing)   │
└──────────────────┘ │  register here   │ └──────────────────────────┘
                     │  and submit      │            │
                     │  intents via API │            ▼
                     └──────────────────┘ ┌──────────────────────────┐
                                          │        RPC Layer         │
                                          │  (Solana connection,     │
                                          │   transaction submission)│
                                          └──────────────────────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────────┐
                                          │      Solana Devnet       │
                                          └──────────────────────────┘
```

## Project Structure

```
/apps
  /frontend              # Next.js frontend application
    /pages               # Page components (11 routes)
    /components          # Reusable UI components (15+)
    /lib                 # API client, hooks, utilities, types
    /styles              # Global styles and Tailwind config

/src
  /agent                 # Agent implementations + Strategy Registry
  /wallet                # Secure wallet management
  /rpc                   # Solana RPC interactions
  /orchestrator          # Agent lifecycle management
  /integration           # BYOA integration layer
  /utils                 # Shared utilities and types

/docs                    # Documentation
README.md
ARCHITECTURE.md          # Detailed system architecture
SECURITY.md              # Security model and threat analysis
SKILLS.md                # Machine-readable capabilities
DEEP_DIVE.md             # Design philosophy and rationale
```

## API Endpoints

### Health
- `GET /api/health` - Check system health

### Stats
- `GET /api/stats` - Get system statistics

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create new agent
- `POST /api/agents/:id/start` - Start agent
- `POST /api/agents/:id/stop` - Stop agent
- `PATCH /api/agents/:id/config` - Update agent configuration (strategy params, execution settings)

### Strategies
- `GET /api/strategies` - List all registered strategies (with field descriptors)
- `GET /api/strategies/:name` - Get a single strategy definition

### Transactions
- `GET /api/transactions` - List transactions (supports `?page=1&limit=20`)

### Intent History
- `GET /api/intents` - Global intent history (built-in + BYOA combined)

### Events
- `GET /api/events` - Get recent events

### BYOA (Bring Your Own Agent)
- `POST /api/byoa/register` - Register external agent, receive wallet + control token
- `POST /api/byoa/intents` - Submit intent (requires Bearer token)
- `GET /api/byoa/agents` - List all connected external agents
- `GET /api/byoa/agents/:id` - Get external agent details
- `GET /api/byoa/agents/:id/intents` - Get intent history for an agent
- `POST /api/byoa/agents/:id/activate` - Activate external agent
- `POST /api/byoa/agents/:id/deactivate` - Deactivate external agent
- `POST /api/byoa/agents/:id/revoke` - Revoke external agent (permanent)
- `POST /api/byoa/agents/:id/rotate-token` - Issue a new control token (agent reconnects to same wallet)
- `GET /api/byoa/intents` - Get all BYOA intent history

## Agent Strategies

Strategies are managed by the **Strategy Registry** — a central system that stores
Zod-validated parameter schemas and human-readable field descriptors. The registry
powers both backend validation and frontend UI rendering.

Browse strategies visually at `/strategies` in the dashboard.

### Accumulator
Maintains a target SOL balance by requesting airdrops when below threshold.

```typescript
{
  targetBalance: 2.0,      // SOL
  minBalance: 0.5,         // SOL
  airdropAmount: 1.0,      // SOL per request
  maxAirdropsPerDay: 5
}
```

### Distributor
Distributes SOL to a list of configured recipients.

```typescript
{
  recipients: ['addr1...', 'addr2...'],
  amountPerTransfer: 0.01,     // SOL
  minBalanceToDistribute: 0.1, // SOL
  maxTransfersPerDay: 10
}
```

### Balance Guard
Emergency-only airdrop agent — acts only when balance drops critically low.

```typescript
{
  criticalBalance: 0.05,   // SOL — trigger threshold
  airdropAmount: 1.0,      // SOL per airdrop
  maxAirdropsPerDay: 3
}
```

### Scheduled Payer
Single-recipient recurring payment agent.

```typescript
{
  recipient: 'addr...',       // Destination public key
  amount: 0.01,               // SOL per payment
  maxPaymentsPerDay: 5,
  minBalanceToSend: 0.05      // SOL — minimum to keep
}
```

### Custom Strategies

Register your own strategy at runtime via the Strategy Registry.
See [DEEP_DIVE.md](DEEP_DIVE.md#custom-strategies) for a complete example.

## Bring Your Own Agent (BYOA)

The BYOA integration allows external developers to connect their own AI agents
(LLMs, bots, trading systems) to the platform without handling private keys or
signing transactions.

### How It Works

1. **Register** your agent via `POST /api/byoa/register`
2. **Receive** a wallet address and a one-time control token
3. **Submit intents** via `POST /api/byoa/intents` (Bearer token auth)
4. **Observe** execution in the dashboard under "Connected Agents"

### Example Integration

```bash
# 1. Register
curl -X POST http://localhost:3001/api/byoa/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "trading-bot-01",
    "agentType": "remote",
    "agentEndpoint": "http://localhost:8080/agent",
    "supportedIntents": ["TRANSFER_SOL", "TRANSFER_TOKEN", "REQUEST_AIRDROP", "QUERY_BALANCE", "AUTONOMOUS"]
  }'

# Response contains: agentId, controlToken, walletPublicKey

# 2. Submit an intent
curl -X POST http://localhost:3001/api/byoa/intents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <controlToken>" \
  -d '{
    "type": "REQUEST_AIRDROP",
    "params": { "amount": 1 }
  }'

# 3. Query balance
curl -X POST http://localhost:3001/api/byoa/intents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <controlToken>" \
  -d '{
    "type": "QUERY_BALANCE",
    "params": {}
  }'
```

### Supported Intent Types

| Intent | Description | Parameters | Policy Validated |
|--------|-------------|------------|------------------|
| `REQUEST_AIRDROP` | Request devnet SOL | `amount` (0-2 SOL) | Yes |
| `TRANSFER_SOL` | Transfer SOL | `recipient`, `amount` | Yes |
| `TRANSFER_TOKEN` | Transfer SPL tokens | `mint`, `recipient`, `amount` | Yes |
| `QUERY_BALANCE` | Check wallet balance | (none) | N/A |
| `AUTONOMOUS` | Unrestricted action | `action`, `params` | **No** |

The `AUTONOMOUS` intent type's `execute_instructions` action is restricted to a
**program allowlist** of 12 known DeFi and system programs (System, Token, Jupiter,
Raydium, Orca, Pump.fun, PumpSwap, Bonk.fun, etc.) to prevent abuse.

The `AUTONOMOUS` intent allows agents to execute any action without policy
constraints. The `action` field specifies the underlying operation (`airdrop`,
`transfer_sol`, `transfer_token`, `query_balance`) and `params` carries the
action-specific parameters. All autonomous executions are fully logged.

### Security Guarantees

- External agents **never** receive private keys
- All actions go through the **policy engine**
- Intents are **rate-limited** (30/min per agent)
- Agents can only act on **their own** bound wallet
- Control tokens are **hashed** at rest (SHA-256)
- Lost token? An admin can **rotate** the token via `POST /api/byoa/agents/:id/rotate-token` — the agent reconnects to the **same wallet** with a new token, no funds lost

## Security

- Private keys are encrypted with AES-256-GCM
- Keys are only decrypted momentarily for signing
- Agents have NO access to private keys
- Frontend is read-only (no key exposure)
- Policy engine validates all intents
- See [SECURITY.md](SECURITY.md) for full threat model

## Configuration

Environment variables (`.env`):

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
PORT=3001
WS_PORT=3002
KEY_ENCRYPTION_SECRET=your-secret-here   # min 16 chars, use 32+ random hex in prod
ADMIN_API_KEY=your-admin-key              # required for agent creation/mutation
MAX_AGENTS=10
AGENT_LOOP_INTERVAL_MS=5000
```

## Testing on Devnet

1. Create an Accumulator agent
2. Watch it automatically request airdrops
3. Create a Distributor agent
4. Add the Accumulator's wallet as a recipient
5. Observe autonomous transfers between agents

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

Built with:
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
