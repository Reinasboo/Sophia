# Skills Reference

Machine-readable documentation of wallet capabilities, agent actions, API surface, security model, and BYOA integration.

> **Version**: 1.0.0  
> **Network**: Solana Devnet  
> **Backend**: Express on port 3001 (API) + WebSocket on port 3002  
> **Frontend**: Next.js 14 on port 3000 (proxies `/api/*` → backend)

---

## Wallet Capabilities

```yaml
wallet:
  version: "1.0.0"
  network: "devnet"
  encryption: "AES-256-GCM (KEY_ENCRYPTION_SECRET env var)"
  
  capabilities:
    create_wallet:
      description: "Create a new wallet with encrypted key storage"
      returns:
        - id: "string"
        - publicKey: "string"
        - createdAt: "datetime"
      
    get_balance:
      description: "Retrieve SOL balance for a wallet"
      parameters:
        - name: "walletId"
          type: "string"
          required: true
      returns:
        - sol: "number"
        - lamports: "bigint"
    
    get_token_balances:
      description: "Retrieve SPL token balances (decimal-aware)"
      parameters:
        - name: "walletId"
          type: "string"
          required: true
      returns:
        - array:
            - mint: "string"
            - amount: "bigint"
            - decimals: "number"
            - uiAmount: "number"
    
    sign_transaction:
      description: "Sign a transaction (internal use only)"
      access: "wallet_layer_only"
      parameters:
        - name: "walletId"
          type: "string"
        - name: "transaction"
          type: "Transaction"
    
    request_airdrop:
      description: "Request SOL airdrop from devnet faucet"
      parameters:
        - name: "publicKey"
          type: "PublicKey"
        - name: "amount"
          type: "number"
          constraints:
            max: 2.0
            unit: "SOL"
    
    transfer_sol:
      description: "Transfer SOL to another wallet"
      parameters:
        - name: "from"
          type: "walletId"
        - name: "to"
          type: "PublicKey"
        - name: "amount"
          type: "number"
      notes:
        - "Built-in agents go through policy validation"
        - "BYOA agents have full autonomy — no policy checks"
    
    transfer_token:
      description: "Transfer SPL tokens (decimal-aware amount handling)"
      parameters:
        - name: "from"
          type: "walletId"
        - name: "mint"
          type: "PublicKey"
        - name: "to"
          type: "PublicKey"
        - name: "amount"
          type: "number"
      notes:
        - "Automatically fetches mint decimals on-chain"
        - "Converts UI amount to raw token units"
```

---

## Security Model

```yaml
security:
  version: "1.0.0"

  admin_auth:
    mechanism: "X-Admin-Key header"
    env_var: "ADMIN_API_KEY"
    protected_endpoints:
      - "POST   /api/agents"
      - "POST   /api/agents/:id/start"
      - "POST   /api/agents/:id/stop"
      - "PATCH  /api/agents/:id/config"
      - "POST   /api/byoa/register"
      - "POST   /api/byoa/agents/:id/deactivate"
      - "POST   /api/byoa/agents/:id/activate"
    behavior:
      - "Returns 401 Unauthorized if header missing or invalid"
      - "Timing-safe comparison to prevent timing attacks"

  byoa_auth:
    mechanism: "Bearer token (Authorization header)"
    protected_endpoints:
      - "POST /api/byoa/intents"
    behavior:
      - "Token generated at registration (SHA-256, 64 hex chars)"
      - "Token validated against registered agent record"
      - "Agent must be active to execute intents"

  cors:
    env_var: "CORS_ORIGIN"
    default: "http://localhost:3000"
    behavior: "Configurable via environment variable"

  websocket:
    origin_validation: true
    env_var: "WS_ALLOWED_ORIGINS"
    default: "http://localhost:3000,http://localhost:3001"

  rate_limiting:
    implementation: "In-memory RateLimiter with automatic cleanup"
    applied_to: "Agent cycle actions, daily limits"

  error_handling:
    sanitization: true
    behavior:
      - "Internal error details stripped from API responses"
      - "Only safe error messages exposed to clients"
      - "Full details logged server-side"

  input_validation:
    library: "zod"
    behavior:
      - "All request bodies validated via Zod schemas"
      - "Prototype pollution prevention on JSON payloads"
      - "Strategy params validated by strategy registry"

  encryption:
    algorithm: "AES-256-GCM"
    key_source: "KEY_ENCRYPTION_SECRET environment variable"
    scope: "Wallet private keys at rest"

  autonomous_intents:
    design: "BYOA agents are AI / LLM agents with full autonomy"
    guardrails:
      - "Fully logged to intent history for auditability"
      - "Operator assumes full responsibility"
      - "No program allowlist — agents may interact with any Solana program"
      - "No policy validation on BYOA transfer/airdrop intents"
```

---

## Agent Actions

```yaml
agent:
  version: "1.0.0"
  
  intents:
    airdrop:
      description: "Request SOL airdrop"
      parameters:
        - name: "amount"
          type: "number"
          constraints:
            min: 0.1
            max: 2.0
            unit: "SOL"
      policy_checks:
        - "daily_airdrop_limit"
    
    transfer_sol:
      description: "Transfer SOL to recipient"
      parameters:
        - name: "recipient"
          type: "string"
          format: "base58"
        - name: "amount"
          type: "number"
          constraints:
            min: 0.0
            max_policy: "maxTransferAmount"
            unit: "SOL"
      policy_checks:
        - "max_transfer_amount"
        - "daily_transfer_limit"
        - "min_balance_maintained"
        - "recipient_allowlist"
        - "recipient_blocklist"
    
    transfer_token:
      description: "Transfer SPL tokens"
      parameters:
        - name: "mint"
          type: "string"
          format: "base58"
        - name: "recipient"
          type: "string"
          format: "base58"
        - name: "amount"
          type: "number"
    
    check_balance:
      description: "Request balance update"
      parameters: []

    autonomous:
      description: "Unrestricted agent action — full autonomy, no policy checks"
      parameters:
        - name: "action"
          type: "string"
          enum: ["airdrop", "transfer_sol", "transfer_token", "query_balance", "execute_instructions", "raw_transaction", "swap", "create_token"]
          description: "The underlying action to execute"
        - name: "params"
          type: "object"
          description: "Action-specific parameters (same as the target action)"
      policy_checks: []  # No policy validation — autonomous
      notes:
        - "BYOA agents are AI / LLM agents with full autonomy"
        - "Can interact with ANY Solana program (no allowlist)"
        - "Fully logged to intent history for auditability"
        - "Operator assumes full responsibility"
```

---

## dApp / Protocol Interaction Skills

```yaml
protocol_interactions:
  spl_token_transfers:
    description: "Agents can transfer SPL tokens between wallets via the Token Program"
    program: "Token Program (SPL)"
    program_id: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    intent_type: "transfer_token"
    parameters:
      - name: "mint"
        type: "string"
        format: "base58"
        description: "SPL token mint address"
      - name: "recipient"
        type: "string"
        format: "base58"
        description: "Destination wallet address"
      - name: "amount"
        type: "number"
        description: "Token amount (UI units, auto-converted with on-chain decimal lookup)"
    flow:
      - "Agent creates transfer_token intent"
      - "Orchestrator validates via policy engine"
      - "TransactionBuilder fetches mint decimals on-chain"
      - "TransactionBuilder.buildTokenTransfer() constructs instruction"
      - "Memo instruction appended for on-chain audit"
      - "Wallet layer signs; RPC layer submits"
    available_to:
      - "Built-in agents (via createTransferTokenIntent())"
      - "BYOA agents (via TRANSFER_TOKEN intent)"

  onchain_memo_logging:
    description: "Agents attach verifiable on-chain memos to transactions via Memo Program v2"
    program: "Memo Program v2"
    program_id: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    behavior:
      - "All SOL transfers include a memo instruction"
      - "All SPL token transfers include a memo instruction"
      - "Memos are atomic with the transfer (same transaction)"
      - "Provides on-chain audit trail for agent activity"
    implementation:
      - "buildMemoInstruction(memo) in transaction-builder.ts"
      - "buildMemoTransaction(payer, memo) in transaction-builder.ts"
```

---

## BYOA (Bring Your Own Agent) System

```yaml
byoa:
  version: "1.0.0"
  description: "External agents connect via REST API with bearer-token authentication"

  design_philosophy: "BYOA agents are AI / LLM agents. They have full autonomy over the wallets assigned to them — no policy restrictions, no program allowlists."

  supported_intents:
    - REQUEST_AIRDROP
    - TRANSFER_SOL
    - TRANSFER_TOKEN
    - QUERY_BALANCE
    - AUTONOMOUS

  lifecycle:
    register:
      endpoint: "POST /api/byoa/register"
      auth: "X-Admin-Key"
      body:
        name: "string (required)"
        type: "'local' | 'remote'"
        description: "string?"
        supportedIntents: "SupportedIntentType[]?"
      returns:
        agentId: "string (UUID)"
        token: "string (64-char hex, shown once)"
        walletPublicKey: "string (base58)"
    
    submit_intent:
      endpoint: "POST /api/byoa/intents"
      auth: "Bearer <token>"
      body:
        agentId: "string (required)"
        type: "SupportedIntentType (required)"
        params: "object? (action-specific)"
      returns:
        intentId: "string"
        status: "'executed' | 'rejected'"
        result: "object?"
        error: "string?"
    
    deactivate:
      endpoint: "POST /api/byoa/agents/:id/deactivate"
      auth: "X-Admin-Key"
    
    activate:
      endpoint: "POST /api/byoa/agents/:id/activate"
      auth: "X-Admin-Key"
    
    list:
      endpoint: "GET /api/byoa/agents"
      auth: "none"
    
    detail:
      endpoint: "GET /api/byoa/agents/:id"
      auth: "none"
    
    intent_history:
      endpoint: "GET /api/byoa/agents/:id/intents"
      auth: "none"
      query:
        limit: "number? (default 50)"
```

---

## Agent Strategies

```yaml
strategies:
  accumulator:
    category: "income"
    description: "Maintains target balance through airdrops"
    parameters:
      targetBalance:
        type: "number"
        default: 2.0
        unit: "SOL"
      minBalance:
        type: "number"
        default: 0.5
        unit: "SOL"
      airdropAmount:
        type: "number"
        default: 1.0
        unit: "SOL"
      maxAirdropsPerDay:
        type: "number"
        default: 5
    behavior:
      - "Check balance against minBalance"
      - "If below, request airdrop"
      - "Respect daily airdrop limit"
  
  distributor:
    category: "distribution"
    description: "Distributes SOL to recipients"
    parameters:
      recipients:
        type: "string[]"
        default: []
      amountPerTransfer:
        type: "number"
        default: 0.01
        unit: "SOL"
      minBalanceToDistribute:
        type: "number"
        default: 0.1
        unit: "SOL"
      maxTransfersPerDay:
        type: "number"
        default: 10
      distributionProbability:
        type: "number"
        default: 0.5
        range: [0, 1]
    behavior:
      - "Check if balance > minBalanceToDistribute"
      - "Select next recipient"
      - "Transfer amountPerTransfer"
      - "Cycle through recipients"

  balance_guard:
    category: "utility"
    description: "Emergency-only airdrop when balance is critically low"
    parameters:
      criticalBalance:
        type: "number"
        default: 0.05
        unit: "SOL"
      airdropAmount:
        type: "number"
        default: 1.0
        unit: "SOL"
      maxAirdropsPerDay:
        type: "number"
        default: 3
    behavior:
      - "Check balance against criticalBalance"
      - "If below, request airdrop"
      - "Respect daily airdrop limit"
      - "Otherwise remain idle"

  scheduled_payer:
    category: "distribution"
    description: "Recurring single-recipient SOL payments"
    parameters:
      recipient:
        type: "string"
        format: "base58"
      amount:
        type: "number"
        default: 0.01
        unit: "SOL"
      maxPaymentsPerDay:
        type: "number"
        default: 5
      minBalanceToSend:
        type: "number"
        default: 0.05
        unit: "SOL"
    behavior:
      - "Check if balance > minBalanceToSend + amount"
      - "Transfer amount to recipient"
      - "Respect daily payment limit"
```

---

## Policy Constraints

> **Note:** Policy constraints apply to **built-in agents only**.
> BYOA agents are AI / LLM agents with **full autonomy** — no policy validation, no transfer limits, no program allowlists.

```yaml
policy:
  scope: "Built-in agents only — BYOA agents are unrestricted"
  defaults:
    maxTransferAmount:
      value: 1.0
      unit: "SOL"
      description: "Maximum SOL per transfer (built-in agents)"
    
    maxDailyTransfers:
      value: 100
      description: "Maximum transfers per wallet per day (built-in agents)"
    
    requireMinBalance:
      value: 0.01
      unit: "SOL"
      description: "Minimum balance to maintain for fees"
    
    allowedRecipients:
      value: null
      description: "Optional whitelist of allowed recipients (built-in agents)"
    
    blockedRecipients:
      value: null
      description: "Optional blacklist of blocked recipients (built-in agents)"
```

---

## API Schema (22 Endpoints)

```yaml
api:
  base_url: "http://localhost:3001"
  websocket: "ws://localhost:3002"
  frontend_proxy: "http://localhost:3000 → backend via Next.js rewrites"

  # ── Core ──────────────────────────────────────
  endpoints:
    root:
      method: "GET"
      path: "/"
      auth: "none"
      response:
        name: "string"
        version: "string"
        status: "string"
        endpoints: "string[]"

    health:
      method: "GET"
      path: "/api/health"
      auth: "none"
      response:
        success: "boolean"
        data:
          status: "'healthy'"
    
    stats:
      method: "GET"
      path: "/api/stats"
      auth: "none"
      response:
        totalAgents: "number"
        activeAgents: "number"
        totalSolManaged: "number"
        totalTransactions: "number"
        networkStatus: "string"
        network: "string"
        uptime: "number"

  # ── Agent Management (admin-protected) ────────
    list_agents:
      method: "GET"
      path: "/api/agents"
      auth: "none"
      response: "Agent[]"
    
    get_agent:
      method: "GET"
      path: "/api/agents/:id"
      auth: "none"
      response:
        agent: "Agent"
        balance: "number"
        tokenBalances: "TokenBalance[]"
        transactions: "Transaction[]"
        events: "SystemEvent[]"
    
    create_agent:
      method: "POST"
      path: "/api/agents"
      auth: "X-Admin-Key"
      body:
        name: "string"
        strategy: "string"  # any registered strategy name
        strategyParams: "object?"  # validated by strategy registry
        executionSettings:
          cycleIntervalMs: "number?"  # default 30000, min 5000, max 3600000
          maxActionsPerDay: "number?"  # default 100, min 1, max 10000
          enabled: "boolean?"          # default true
      response: "Agent"
    
    update_agent_config:
      method: "PATCH"
      path: "/api/agents/:id/config"
      auth: "X-Admin-Key"
      body:
        strategyParams: "object?"
        executionSettings:
          cycleIntervalMs: "number?"
          maxActionsPerDay: "number?"
          enabled: "boolean?"
      response: "Agent"
    
    start_agent:
      method: "POST"
      path: "/api/agents/:id/start"
      auth: "X-Admin-Key"
    
    stop_agent:
      method: "POST"
      path: "/api/agents/:id/stop"
      auth: "X-Admin-Key"

  # ── Observability ─────────────────────────────
    list_transactions:
      method: "GET"
      path: "/api/transactions"
      auth: "none"
      response: "Transaction[]"
    
    list_events:
      method: "GET"
      path: "/api/events"
      auth: "none"
      query:
        count: "number? (default 50)"
      response: "SystemEvent[]"
    
    global_intent_history:
      method: "GET"
      path: "/api/intents"
      auth: "none"
      query:
        limit: "number? (default 50)"
      description: "Combined intent history from built-in + BYOA agents"
      response: "IntentHistoryRecord[]"

    explorer_url:
      method: "GET"
      path: "/api/explorer/:signature"
      auth: "none"
      response:
        url: "string (Solana Explorer URL with cluster=devnet)"

  # ── Strategies ────────────────────────────────
    list_strategies:
      method: "GET"
      path: "/api/strategies"
      auth: "none"
      response: "StrategyDefinitionDTO[]"
    
    get_strategy:
      method: "GET"
      path: "/api/strategies/:name"
      auth: "none"
      response: "StrategyDefinitionDTO"

  # ── BYOA (Bring Your Own Agent) ──────────────
    byoa_register:
      method: "POST"
      path: "/api/byoa/register"
      auth: "X-Admin-Key"
      body:
        name: "string"
        type: "'local' | 'remote'"
        description: "string?"
        supportedIntents: "SupportedIntentType[]?"
      response:
        agentId: "string"
        token: "string (64-char hex, shown once)"
        walletPublicKey: "string"

    byoa_submit_intent:
      method: "POST"
      path: "/api/byoa/intents"
      auth: "Bearer <token>"
      body:
        agentId: "string"
        type: "SupportedIntentType"
        params: "object?"
      response:
        intentId: "string"
        status: "'executed' | 'rejected'"
        result: "object?"

    byoa_list_agents:
      method: "GET"
      path: "/api/byoa/agents"
      auth: "none"
      response: "ExternalAgent[]"

    byoa_get_agent:
      method: "GET"
      path: "/api/byoa/agents/:id"
      auth: "none"
      response: "ExternalAgentDetail"

    byoa_agent_intents:
      method: "GET"
      path: "/api/byoa/agents/:id/intents"
      auth: "none"
      query:
        limit: "number? (default 50)"
      response: "IntentHistoryRecord[]"

    byoa_deactivate:
      method: "POST"
      path: "/api/byoa/agents/:id/deactivate"
      auth: "X-Admin-Key"

    byoa_activate:
      method: "POST"
      path: "/api/byoa/agents/:id/activate"
      auth: "X-Admin-Key"
```

---

## WebSocket Events

```yaml
websocket:
  url: "ws://localhost:3002"
  origin_validation: true

  on_connect:
    message_type: "initial_state"
    payload:
      agents: "Agent[]"
      stats: "SystemStats"

  broadcast_events:
    agent_created:
      fields:
        agent: "AgentInfo"
    
    agent_status_changed:
      fields:
        agentId: "string"
        previousStatus: "AgentStatus"
        newStatus: "AgentStatus"
    
    agent_action:
      fields:
        agentId: "string"
        action: "string"
        details: "object?"
    
    transaction:
      fields:
        transaction: "TransactionRecord"
    
    balance_changed:
      fields:
        walletId: "string"
        previousBalance: "number"
        newBalance: "number"
    
    system_error:
      fields:
        error: "string"
        context: "object?"
```

---

## Frontend Pages

```yaml
frontend:
  framework: "Next.js 14 (Pages Router)"
  port: 3000
  proxy: "/api/* → http://localhost:3001/api/*"

  pages:
    dashboard:
      path: "/"
      description: "System overview with stats, agent list, activity feed"
    agents_list:
      path: "/agents"
      description: "All built-in agents with status and controls"
    agent_detail:
      path: "/agents/:id"
      description: "Agent detail with balance, transactions, events, config"
    transactions:
      path: "/transactions"
      description: "Global transaction log"
    connected_agents:
      path: "/connected-agents"
      description: "BYOA agent list"
    connected_agent_detail:
      path: "/connected-agents/:id"
      description: "BYOA agent detail with intent history"
    strategies:
      path: "/strategies"
      description: "Available strategies with field definitions"
    intent_history:
      path: "/intent-history"
      description: "Global intent history (built-in + BYOA)"
    byoa_register:
      path: "/byoa-register"
      description: "BYOA agent registration form"
```

---

## Type Definitions

```typescript
type AgentStatus = 
  | 'idle'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'error'
  | 'stopped';

type AgentStrategy = string;
  // Built-in: 'accumulator' | 'distributor' | 'balance_guard' | 'scheduled_payer'
  // Custom strategies registered via Strategy Registry are also valid

type TransactionStatus = 
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'finalized'
  | 'failed';

type TransactionType = 
  | 'airdrop'
  | 'transfer_sol'
  | 'transfer_spl'
  | 'create_token_account';

type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS';

type ExternalAgentStatus =
  | 'registered'
  | 'active'
  | 'inactive'
  | 'revoked';
```

---

## Persistence

```yaml
persistence:
  engine: "JSON file store (data/ directory)"
  files:
    wallets.json: "Encrypted wallet key material and metadata"
    agents.json: "Built-in agent state and configuration"
    byoa-agents.json: "BYOA agent records and hashed tokens"
    transactions.json: "Full transaction history with Date revival"
  behavior:
    - "Automatic save on every state change"
    - "Automatic restore on server restart"
    - "data/ is gitignored"
```

---

## Test Suite

```yaml
testing:
  framework: "vitest ^1.2.0"
  command: "npm test"
  files:
    encryption.test.ts: "AES-256-GCM round-trip, tamper detection, secureCompare, generateSecureId (10 tests)"
    wallet-manager.test.ts: "Wallet creation, signing, deletion, policy validation (10 tests)"
    agent-factory.test.ts: "Strategy creation, param validation, registry DTOs (10 tests)"
    agent-decisions.test.ts: "Autonomous decision-making for all 4 strategies (6 tests)"
    store-and-registry.test.ts: "BYOA registration, auth, token rotation, lifecycle (8 tests)"
    store.test.ts: "File-based persistence round-trip (2 tests)"
  total: 46
```

---

## Environment Variables

```yaml
env:
  SOLANA_RPC_URL:
    default: "https://api.devnet.solana.com"
    description: "Solana RPC endpoint"
  KEY_ENCRYPTION_SECRET:
    required: true
    description: "AES-256-GCM key for wallet encryption"
  ADMIN_API_KEY:
    required: true
    description: "Admin authentication key for protected endpoints"
  CORS_ORIGIN:
    default: "http://localhost:3000"
    description: "Allowed CORS origin"
  WS_ALLOWED_ORIGINS:
    default: "http://localhost:3000,http://localhost:3001"
    description: "Comma-separated allowed WebSocket origins"
  PORT:
    default: 3001
    description: "API server port"
  WS_PORT:
    default: 3002
    description: "WebSocket server port"
  NEXT_PUBLIC_API_URL:
    default: "http://localhost:3001"
    description: "Frontend API base URL (optional, uses proxy by default)"
```
