# System Architecture

This document provides a deep dive into the Agentic Wallet System architecture, explaining the design decisions, layer responsibilities, and data flow patterns.

## Design Principles

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Defense in Depth**: Multiple layers of security controls
3. **Fail-Safe Defaults**: Built-in agents have restrictive policies; BYOA agents have full autonomy
4. **Minimal Attack Surface**: Agents never touch keys
5. **Auditability**: Comprehensive logging and event emission

## Layer Architecture

### 1. Agent Layer (`/src/agent`)

**Responsibility**: Decision making only

The Agent Layer contains the autonomous logic that determines what actions to take. Agents observe their environment through read-only context and emit high-level intents.

```typescript
interface AgentContext {
  walletPublicKey: string;    // Public only
  balance: BalanceInfo;        // Read-only
  tokenBalances: TokenBalance[];
  recentTransactions: string[];
}

interface AgentDecision {
  shouldAct: boolean;
  intent?: Intent;
  reasoning: string;
}
```

**Key Properties**:
- Agents **only** know their `cycleCount` (total cycles) and `actionCount` (cycles where they acted)
- `recordAction(acted: boolean)` updates both counters each cycle
- No cryptographic capabilities
- No direct network access
- Cannot construct transactions
- Receives sanitized, read-only context
- Strategy parameters validated by the Strategy Registry (Zod schemas)
- Recipient addresses validated with `PublicKey` constructor before creating intents

**Built-in Strategy Implementations**:

| Strategy | Class | Purpose |
|----------|-------|---------|
| `accumulator` | `AccumulatorAgent` | Maintain balance via airdrops |
| `distributor` | `DistributorAgent` | Distribute SOL to recipients |
| `balance_guard` | `BalanceGuardAgent` | Emergency-only airdrop when critically low |
| `scheduled_payer` | `ScheduledPayerAgent` | Recurring single-recipient payments |

Custom strategies can be registered at runtime via the Strategy Registry.

**Agent Lifecycle**:
```
IDLE → THINKING → (decision) → EXECUTING → IDLE
                      ↓
                   WAITING
```

### 2. Wallet Layer (`/src/wallet`)

**Responsibility**: Secure key management and transaction signing

The Wallet Layer is the security boundary for all cryptographic operations. Private keys are:
- Generated using Solana's secure Keypair
- Encrypted immediately with AES-256-GCM
- Stored only in encrypted form
- Decrypted momentarily for signing

```typescript
// Public interface (exposed)
interface WalletManager {
  createWallet(): WalletInfo;           // Returns public info only
  getPublicKey(id: string): PublicKey;
  signTransaction(id: string, tx: Transaction): Transaction;
  validateIntent(id: string, intent: Intent): boolean;
}

// Internal (never exposed)
interface InternalWallet {
  encryptedSecretKey: string;  // Never leaves this layer
}
```

**Key Management**:
```
Generate → Encrypt → Store (memory + disk) → (signing request) → Decrypt → Sign → Discard
                                                            ↓
                                                    Key in memory
                                                    for <10ms
```

Wallets and policies are persisted to `data/wallets.json` on every mutation
(create, delete, update-policy) and restored from disk when the
`WalletManager` singleton is first constructed.

### 3. RPC Layer (`/src/rpc`)

**Responsibility**: Solana blockchain interaction

The RPC Layer handles all communication with Solana:
- Connection management
- Transaction building (unsigned)
- **Transaction simulation** before every send (pre-flight error detection, no fee burned)
- Transaction submission
- Retry logic with **exponential backoff** (1s → 2s → 4s → 8s → 16s cap)
- Confirmation tracking with `lastValidBlockHeight`
- **On-chain token decimal lookup** via `getMintDecimals()` (no hardcoded 9)
- **Memo Program integration**: All SOL and SPL token transfers include an on-chain memo via Solana's Memo Program v2 (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`). The `buildMemoInstruction()` and `buildMemoTransaction()` helpers in `transaction-builder.ts` attach human-readable memos to every transfer.
- **SPL Token Program interaction**: Token transfers are built using `@solana/spl-token` and the Token Program via `buildTokenTransfer()` in `transaction-builder.ts`.

```typescript
interface SolanaClient {
  getBalance(pubkey: PublicKey): Promise<BalanceInfo>;
  getTokenBalances(owner: PublicKey): Promise<TokenBalance[]>;
  getMintDecimals(mint: PublicKey): Promise<number>;       // on-chain lookup
  requestAirdrop(pubkey: PublicKey, amount: number): Promise<TransactionResult>;
  simulateTransaction(tx: Transaction): Promise<Result<SimulationResult, Error>>;
  sendTransaction(tx: Transaction): Promise<TransactionResult>;
  getRecentBlockhash(withHeight?: boolean): Promise<...>; // returns lastValidBlockHeight
}
```

**Transaction Flow**:
```
Build Transaction → Sign (Wallet Layer) → Simulate → Submit → Confirm
       ↓                    ↓                  ↓          ↓
  RPC Layer            Wallet Layer       RPC Layer   RPC Layer
                                          (pre-flight,
                                           no fee burned)
```

### 4. Orchestration Layer (`/src/orchestrator`)

**Responsibility**: Coordination and lifecycle management

The Orchestrator binds agents to wallets and manages the execution loop:

```typescript
async function runAgentCycle(agentId: string) {
  // 1. Build read-only context
  const context = await buildAgentContext(agent);
  
  // 2. Let agent think
  const decision = await agent.think(context);
  
  // 3. Validate intent against policy
  if (decision.shouldAct && decision.intent) {
    const valid = walletManager.validateIntent(
      agent.walletId,
      decision.intent,
      context.balance.sol
    );
    
    // 3. Execute if valid
    if (valid) {
      await executeIntent(agent, decision.intent);
    }
  }
  
  // 5. Record cycle/action counters (cycleCount, actionCount)
  agent.recordAction(decision.shouldAct);
  
  // 6. Record intent to global history (IntentRouter)
  recordIntentHistory(agent, decision);
  
  // 7. Emit events for frontend
  eventBus.emit(actionEvent);
}
```

**Multi-Agent Support**:
```
Orchestrator
    ├── Agent 1 (Accumulator)      ──► Wallet 1  (cycle: 30s)
    ├── Agent 2 (Distributor)      ──► Wallet 2  (cycle: 15s)
    ├── Agent 3 (Balance Guard)    ──► Wallet 3  (cycle: 60s)
    ├── Agent 4 (Scheduled Payer)  ──► Wallet 4  (cycle: 30s)
    └── Agent N (Custom)           ──► Wallet N  (cycle: configurable)
```

Each agent has independent **Execution Settings** (cycle interval, max actions
per day, enabled/disabled) that can be updated at runtime via
`PATCH /api/agents/:id/config`.

**Persistence**:

Agent state is persisted to `data/agents.json` after every mutation
(create, start, stop, config update). Each record captures a `wasRunning`
flag indicating whether the agent was active at shutdown. On startup,
`restoreFromStore()` recreates agents with their original IDs and timestamps,
then auto-starts those that were previously running.

**Intent History Recording**:

All intent executions — from both built-in agents and BYOA agents — are recorded
via the IntentRouter's public `recordIntent()` method. The Orchestrator calls
this after every cycle so that built-in agent activity appears alongside BYOA
activity in the global intent history. The combined history is available via
`GET /api/intents`.

### 5. Frontend Layer (`/apps/frontend`)

**Responsibility**: Observation and visualization only

The Frontend is the operator's dashboard — primarily observational, with
controlled management actions that never expose key material:

```
Frontend Capabilities:
✓ View agent status, balances, transactions, activity feed
✓ Browse available strategies (Strategy Browser page)
✓ Create agents via multi-step wizard (5 steps: name → strategy → params → execution → review)
✓ Edit agent configuration (strategy params, execution settings, pause/resume)
✓ View connected external agents (BYOA)
✓ Register new external agents (BYOA Registration page)
✓ View global intent history
✗ Access private keys
✗ Sign transactions
✗ Override policy engine
```

**Pages**:

| Route | Purpose |
|-------|---------|
| `/` | Dashboard overview with stats |
| `/agents` | Fleet list with create button |
| `/agents/:id` | Agent detail + settings panel |
| `/strategies` | Strategy browser (marketplace feel) |
| `/connected-agents` | BYOA agent list |
| `/connected-agents/:id` | BYOA agent detail + management |
| `/byoa-register` | Register a new external agent |
| `/intent-history` | Global intent history |
| `/transactions` | Transaction list |

**Data Flow**:
```
Backend → REST API → Frontend (polling)
       → WebSocket → Frontend (real-time)
```

### 6. Integration Layer (`/src/integration`) — BYOA

**Responsibility**: External agent registration, wallet binding, intent routing

The Integration Layer enables Bring-Your-Own-Agent (BYOA) — allowing external
developers to connect their own AI agents without touching private keys.

```
External Agent                              Platform
     │                                         │
     │  POST /api/byoa/register                │
     │  { agentName, type, intents }           │
     │────────────────────────────────────────►│
     │                                         │ Creates wallet
     │  { agentId, controlToken, walletPubkey }│ Binds agent → wallet
     │◄────────────────────────────────────────│
     │                                         │
     │  POST /api/byoa/intents                 │
     │  Bearer <token>                         │
     │  { type: "TRANSFER_SOL", params: {...} }│
     │────────────────────────────────────────►│
     │                                         │ Auth token
     │                                         │ Validate intent
     │                                         │ Sign & execute via wallet layer
     │  { status: "executed", result: {...} }  │
     │◄────────────────────────────────────────│
```

**Components**:

| File | Purpose |
|------|---------|
| `agentRegistry.ts` | Registration, auth tokens, agent lifecycle |
| `walletBinder.ts` | 1:1 wallet creation and binding |
| `intentRouter.ts` | Intent validation, rate limiting, execution dispatch, intent history |
| `agentAdapter.ts` | Communication with local/remote agents |

**Key Properties**:
- External agents never receive private keys
- Built-in agent intents are validated against the policy engine
- BYOA agents have **full autonomy** — no policy restrictions, no program allowlists
- Rate limiting prevents abuse (30 intents/min per agent)
- Control tokens are stored as SHA-256 hashes
- 1 agent = 1 wallet (enforced at the binder level)
- Intent history is centralized — the IntentRouter's `recordIntent()` method accepts records from both BYOA submissions and Orchestrator-forwarded built-in agent activity
- Agent records and wallet bindings are persisted to `data/byoa-agents.json` and `data/byoa-binder.json`; restored on startup

## Strategy Registry (`/src/agent/strategy-registry.ts`)

The Strategy Registry is the single source of truth for all agent strategies.
It holds Zod-based parameter schemas, human-readable field descriptors, and
metadata used by both backend validation and frontend UI rendering.

```typescript
interface StrategyDefinition {
  name: string;                    // e.g. 'accumulator'
  label: string;                   // e.g. 'Accumulator'
  description: string;
  supportedIntents: string[];      // e.g. ['airdrop', 'check_balance']
  paramSchema: ZodObject<any>;     // Zod schema for validation
  defaultParams: Record<string, unknown>;
  fields: StrategyFieldDescriptor[];
  builtIn: boolean;
  icon: string;                    // Lucide icon name
  category: 'income' | 'distribution' | 'trading' | 'utility' | 'custom';
}
```

**Key Properties**:
- Strategies self-register via `registry.register(definition)`
- The `AgentFactory` validates params through the registry before creating agents
- The orchestrator's `updateAgentConfig()` re-validates params through the registry
- The `GET /api/strategies` endpoint serialises `StrategyDefinitionDTO[]` for the frontend
- `AgentStrategy` is now a plain `string` (not a union), enabling runtime extensibility

**Serialisation for the Frontend**:

Zod schemas cannot be sent over the wire, so field descriptors are derived:

```typescript
interface StrategyFieldDescriptor {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'string[]';
  default?: unknown;
  description?: string;
}
```

## dApp / Protocol Interactions

The system interacts with three deployed Solana programs, demonstrating real dApp/protocol interaction beyond basic account operations:

| Program | ID | Usage |
|---------|----|-------|
| **SystemProgram** | `11111111111111111111111111111111` | Native SOL transfers (`transfer_sol` intents) |
| **Token Program (SPL)** | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | SPL token transfers (`transfer_token` intents) via `@solana/spl-token` |
| **Memo Program v2** | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | On-chain memos attached to every SOL and SPL token transfer |

All three programs are invoked through the RPC Layer's `transaction-builder.ts`, which constructs multi-instruction transactions (e.g., a token transfer + memo instruction in a single atomic transaction). The Wallet Layer signs the composed transaction, and the RPC Layer submits it.

## Intent System

Intents are the bridge between agents (decision makers) and wallets (executors):

```typescript
type Intent = 
  | { type: 'airdrop'; amount: number }
  | { type: 'transfer_sol'; recipient: string; amount: number }
  | { type: 'transfer_token'; mint: string; recipient: string; amount: number }
  | { type: 'check_balance' }
  | { type: 'autonomous'; action: 'airdrop' | 'transfer_sol' | 'transfer_token' | 'query_balance'; params: Record<string, unknown> };
```

**Intent Types**:

| Intent | Description | Policy Validated |
|--------|-------------|------------------|
| `airdrop` | Request devnet SOL | Yes |
| `transfer_sol` | Send SOL | Yes |
| `transfer_token` | Send SPL tokens | Yes |
| `check_balance` | Query balance | N/A |
| `autonomous` | Unrestricted agent action | **No** — bypasses policy engine |

The `autonomous` intent type allows agents to execute any supported action
without policy constraints (no max-amount, no daily-limit, no min-balance
checks). This is designed for advanced use cases where the agent operator
accepts full responsibility. The wallet-manager returns an immediate
`success(true)` for autonomous intents. All autonomous actions are still
fully logged to the intent history for auditability.

**Intent Validation** (standard intents):
1. Policy check (max amounts, daily limits)
2. Balance sufficiency
3. Recipient validation
4. Rate limiting

## Persistence Layer (`/src/utils/store.ts`)

The Persistence Layer provides zero-dependency, file-based JSON persistence so
that all critical system state survives server restarts.

```typescript
saveState<T>(key: string, data: T): void   // writes data/<key>.json
loadState<T>(key: string): T | null        // reads + parses, null on missing/corrupt
```

**Key Properties**:
- Synchronous reads/writes (startup is blocking, mutations are rare)
- Errors are logged but never thrown (fail-open for reads, fail-safe for writes)
- `data/` directory is auto-created and gitignored

**Persisted Files**:

| File | Layer | Written after |
|------|-------|---------------|
| `data/wallets.json` | WalletManager | create/delete wallet, update policy |
| `data/agents.json` | Orchestrator | create/start/stop agent, update config |
| `data/byoa-agents.json` | AgentRegistry | register, bind, activate/deactivate/revoke, rotate token |
| `data/byoa-binder.json` | WalletBinder | bind new wallet |
| `data/transactions.json` | Orchestrator | airdrop, transfer, token transfer |

**Startup Restore Order**:
1. `WalletManager` constructor → loads wallets + policies
2. `AgentRegistry` constructor → loads BYOA records, rebuilds `tokenIndex`
3. `WalletBinder` constructor → loads wallet→agent map
4. `main()` calls `getOrchestrator().restoreFromStore()` → recreates agents, auto-starts those with `wasRunning: true`

## Fee Constants

Pre-decision balance checks use centralized constants from `src/utils/config.ts`
rather than scattered magic numbers:

```typescript
ESTIMATED_SOL_TRANSFER_FEE   = 0.00001  // SOL — single-signature headroom
ESTIMATED_TOKEN_TRANSFER_FEE = 0.01     // SOL — ATA creation + priority headroom
```

Actual on-chain fees are verified before submission via `simulateTransaction()`.

## Data Flow Diagram

```
┌──────────────┐
│    Agent     │
│   thinks()   │
└──────┬───────┘
       │ Intent
       ▼
┌──────────────┐
│   Policy     │
│  Validator   │
└──────┬───────┘
       │ Validated Intent
       ▼
┌──────────────┐     ┌──────────────┐
│   Wallet     │────►│     RPC      │
│  signTx()    │     │  buildTx()   │
└──────────────┘     └──────┬───────┘
                            │ Signed Tx
                            ▼
                     ┌──────────────┐
                     │   Solana     │
                     │   Devnet     │
                     └──────┬───────┘
                            │ Confirmation
                            ▼
┌──────────────┐     ┌──────────────┐
│   Frontend   │◄────│    Event     │
│ (observer)   │     │     Bus      │
└──────────────┘     └──────────────┘
```

## Event System

Events flow through a central EventBus for real-time updates:

```typescript
type SystemEvent = 
  | AgentCreatedEvent
  | AgentStatusChangedEvent
  | AgentActionEvent
  | TransactionEvent
  | BalanceChangedEvent
  | SystemErrorEvent;
```

Events are:
- Stored in memory (last 1000)
- Broadcast via WebSocket
- Available via REST API

## Configuration

The system is configured via environment variables with validation:

```typescript
const ConfigSchema = z.object({
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_NETWORK: z.enum(['devnet', 'testnet']),  // mainnet blocked
  KEY_ENCRYPTION_SECRET: z.string().min(16),
  MAX_AGENTS: z.number().positive(),
  AGENT_LOOP_INTERVAL_MS: z.number().positive(),
});
```

## Scaling Considerations

**Current Design**:
- Single-process, file-based persistence (`data/*.json`)
- Suitable for development and small deployments
- All state survives restarts (wallets, agents, BYOA registrations)

**Production Path**:
1. ~~Add persistent storage~~ ✔ (file-based JSON persistence implemented)
2. ~~Implement agent state persistence~~ ✔ (agents restore with original IDs, auto-start)
3. Migrate to encrypted database (e.g., SQLite + SQLCipher or PostgreSQL) for concurrent access
4. Add horizontal scaling with message queues
5. Implement distributed locking
6. Add monitoring and alerting

## Error Handling

Each layer handles errors appropriately:

```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

- **Agent Layer**: Errors → agent status = 'error'
- **Wallet Layer**: Errors → transaction fails, no retry
- **RPC Layer**: Errors → retry with backoff
- **Frontend**: Errors → display, allow retry
