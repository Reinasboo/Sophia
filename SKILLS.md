# Skills Reference

Machine-readable documentation of Sophia's mainnet capabilities, autonomous agents, BYOA integration, GMGN skill mapping, API surface, and security model.

> **Version**: 2.0.0
> **Network**: Solana Mainnet-Beta
> **Backend**: Express API on port 3001, WebSocket on port 3002
> **Frontend**: Next.js 14 on port 3000, proxied to the API layer

This file is the operating reference for autonomous agents that interact with Sophia. It replaces the old devnet-era assumptions with production mainnet behavior.

---

## Platform Summary

```yaml
platform:
  name: Sophia
  version: '2.0.0'
  network: 'mainnet-beta'
  mode: 'production'
  auth:
    user_session: 'Privy login -> server-issued persistent bearer token'
    built_in_admin: 'X-Admin-Key'
    byoa: 'Bearer token in Authorization header'
  autonomy_goal: 'Allow authenticated agents to interact with Sophia autonomously without private keys'
```

---

## Core Operating Principles

```yaml
principles:
  mainnet_first:
    - 'Treat every action as production traffic'
    - 'Never assume devnet faucets, test RPCs, or temporary wallets'
    - 'All actions must be auditable and reproducible'

  autonomy:
    - 'Authenticated agents may submit intents without manual micro-approval'
    - 'Built-in agents remain policy-bound'
    - 'BYOA agents operate within their registered wallet scope'

  isolation:
    - 'Each built-in wallet is isolated'
    - 'Each BYOA agent is bound to exactly one dedicated wallet'
    - 'Each user session gets one persistent bearer token'

  safety:
    - 'Private keys remain encrypted and server-side only'
    - 'All intent submissions are logged'
    - 'Transactions should be simulated before submission where the flow supports it'
    - 'Mainnet airdrop paths are disabled'
```

---

## Wallet Capabilities

```yaml
wallet:
  encryption: 'AES-256-GCM (KEY_ENCRYPTION_SECRET)'
  persistence: 'JSON-backed state store in data/'
  capabilities:
    create_wallet:
      description: 'Create a new wallet with encrypted private key storage'
      returns: [id, publicKey, createdAt]

    get_balance:
      description: 'Retrieve SOL balance for a wallet'
      parameters: [walletId]
      returns: [sol, lamports]

    get_token_balances:
      description: 'Retrieve SPL token balances with decimals-aware formatting'
      parameters: [walletId]
      returns: [mint, amount, decimals, uiAmount, symbol]

    sign_transaction:
      description: 'Sign a transaction using the wallet layer only'
      access: 'wallet_layer_only'

    transfer_sol:
      description: 'Transfer SOL to another wallet'
      parameters: [from, to, amount]
      notes:
        - 'Built-in agents are policy-checked'
        - 'BYOA agents act under their own registered scope'

    transfer_token:
      description: 'Transfer SPL tokens using on-chain mint decimals'
      parameters: [from, mint, to, amount]
      notes:
        - 'Decimal-aware amount handling'
        - 'Memo logging is attached to transfers where supported'
```

---

## Authentication Model

```yaml
auth:
  privy_user_session:
    purpose: 'Human user login for Sophia dashboard and API access'
    flow:
      - 'User signs in with Privy'
      - 'Frontend exchanges Privy access token with /api/auth/privy-callback'
      - 'Backend issues a persistent server-generated bearer token'
      - 'Frontend stores the bearer token in localStorage.sophia_api_key'
      - 'Future requests reuse the bearer token automatically'
    notes:
      - 'The bearer token is persistent for that user'
      - 'The token is intended for repeated mainnet use'

  admin_auth:
    mechanism: 'X-Admin-Key header'
    env_var: 'ADMIN_API_KEY'
    protected_endpoints:
      - 'POST /api/agents'
      - 'POST /api/agents/:id/start'
      - 'POST /api/agents/:id/stop'
      - 'PATCH /api/agents/:id/config'
      - 'POST /api/byoa/register'
      - 'POST /api/byoa/agents/:id/deactivate'
      - 'POST /api/byoa/agents/:id/activate'

  byoa_auth:
    mechanism: 'Bearer token (Authorization header)'
    protected_endpoints:
      - 'POST /api/byoa/intents'
      - 'POST /api/byoa/verify/challenge-response'
    behavior:
      - 'Tokens are stored hashed on registration'
      - 'Tokens scope access to one dedicated wallet'
      - 'Agents must be active to execute intents'
      - 'External agents are isolated from built-in strategy policy rules'
```

---

## Security Model

```yaml
security:
  version: '2.0.0'

  mainnet_constraints:
    - 'REQUEST_AIRDROP is disabled in production flows'
    - 'No devnet assumptions in production docs or logs'
    - 'Mainnet RPC, webhook, and database settings must be production-grade'

  input_validation:
    library: 'zod'
    behavior:
      - 'All request bodies validated via schema'
      - 'Strategy params validated before agent creation'
      - 'BYOA agent endpoints are SSRF-checked'

  encryption:
    algorithm: 'AES-256-GCM'
    scope: 'Wallet private keys at rest'

  auditability:
    - 'Intent history is retained for both built-in and BYOA agents'
    - 'Transactions include memo-based audit trails where possible'
    - 'Agent registration and wallet binding are logged server-side'

  autonomous_intents:
    built_in_scope: 'Policy checked'
    byoa_scope: 'Fully autonomous within registered wallet scope'
    notes:
      - 'BYOA agents are the primary autonomous execution surface'
      - 'Operator remains responsible for the registered agent behavior'
```

---

## Agent Actions

```yaml
agent_actions:
  request_airdrop:
    production: false
    notes:
      - 'Devnet-only behavior; blocked in production'

  transfer_sol:
    description: 'Move SOL between wallets'
    policy_checks:
      - 'max_transfer_amount'
      - 'daily_transfer_limit'
      - 'min_balance_maintained'
      - 'recipient_allowlist'
      - 'recipient_blocklist'

  transfer_token:
    description: 'Move SPL tokens between wallets'
    policy_checks:
      - 'mint validation'
      - 'recipient validation'
      - 'amount validation'

  check_balance:
    description: 'Refresh wallet balance and token state'

  autonomous:
    description: 'Unrestricted agent action inside the BYOA scope'
    policy_checks: []
    notes:
      - 'Use this only for registered external agents'
      - 'Every action is logged'
      - 'Any supported Solana program may be invoked by the agent workflow'
```

---

## Mainnet Rules

```yaml
mainnet_rules:
  disabled_in_production:
    - 'REQUEST_AIRDROP'
    - 'Devnet RPC endpoints'
    - 'Any documentation or UI text implying faucet-based funding'

  required_in_production:
    - 'SOLANA_NETWORK=mainnet-beta'
    - 'Production RPC URL'
    - 'Production database'
    - 'Privy auth configured'
    - 'Admin auth configured'

  recommended:
    - 'Rate limit logging and alerting'
    - 'Production smoke checks after deploy'
    - 'Mainnet-specific rollback plan'
```

---

## Strategies

All strategy definitions below are registered in the backend strategy registry and surfaced to the frontend. Each strategy includes GMGN skills that support research, monitoring, and execution for that strategy family.

```yaml
strategies:
  dca:
    category: 'trading'
    description: 'Fixed-size recurring buys'
    gmgnSkills: ['gmgn-token', 'gmgn-portfolio', 'gmgn-swap']

  grid_trading:
    category: 'trading'
    description: 'Buy support and sell resistance in sideways markets'
    gmgnSkills: ['gmgn-market', 'gmgn-token', 'gmgn-swap']

  momentum_trading:
    category: 'trading'
    description: 'Ride strong trends with entries and exits'
    gmgnSkills: ['gmgn-market', 'gmgn-token', 'gmgn-track', 'gmgn-swap']

  arbitrage:
    category: 'trading'
    description: 'Exploit spread differences across venues'
    gmgnSkills: ['gmgn-market', 'gmgn-token', 'gmgn-swap']

  stop_loss_guard:
    category: 'utility'
    description: 'Protect positions with automated exits'
    gmgnSkills: ['gmgn-token', 'gmgn-swap', 'gmgn-cooking']

  yield_harvesting:
    category: 'income'
    description: 'Claim and compound yield-bearing positions'
    gmgnSkills: ['gmgn-portfolio', 'gmgn-token', 'gmgn-swap']

  portfolio_rebalancer:
    category: 'trading'
    description: 'Maintain target allocations'
    gmgnSkills: ['gmgn-portfolio', 'gmgn-token', 'gmgn-swap']

  airdrop_farmer:
    category: 'income'
    description: 'Track and claim eligible airdrops'
    gmgnSkills: ['gmgn-market', 'gmgn-track', 'gmgn-portfolio']

  scalping_trading:
    category: 'trading'
    description: 'Fast micro-move capture with strict exits'
    gmgnSkills: ['gmgn-market', 'gmgn-track', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking']

  breakout_trading:
    category: 'trading'
    description: 'Trade confirmed breakouts with fixed exits'
    gmgnSkills: ['gmgn-market', 'gmgn-track', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking']

  mean_reversion_trading:
    category: 'trading'
    description: 'Buy oversold dips and exit on recovery'
    gmgnSkills: ['gmgn-market', 'gmgn-token', 'gmgn-swap', 'gmgn-cooking']
```

---

## GMGN Skill Map

```yaml
gmgn:
  gmgn-token:
    purpose: 'Token info, security, pool, holders, traders'
    use_when:
      - 'A token must be assessed before trading'
      - 'A strategy needs security or holder concentration checks'

  gmgn-market:
    purpose: 'K-line, trending tokens, new launches, signal feeds'
    use_when:
      - 'A strategy needs trend discovery or launchpad monitoring'
      - 'The agent needs to identify new opportunities'

  gmgn-portfolio:
    purpose: 'Wallet holdings, activity, statistics, created tokens'
    use_when:
      - 'An agent needs to reason about portfolio exposure'
      - 'A wallet or dev wallet should be analyzed'

  gmgn-track:
    purpose: 'KOL, smart money, and follow-wallet activity'
    use_when:
      - 'A strategy follows smart wallets or KOL behavior'
      - 'The agent needs signal confirmation from influential wallets'

  gmgn-swap:
    purpose: 'Swap execution and order management'
    use_when:
      - 'The agent needs to actually trade or set exits'
      - 'A strategy executes entries, exits, or stop-losses'

  gmgn-cooking:
    purpose: 'Bundled buy + take-profit/stop-loss workflows'
    use_when:
      - 'A strategy needs structured exit automation'
      - 'The agent is launching a position with built-in risk controls'
```

---

## BYOA Infrastructure

```yaml
byoa:
  version: '2.0.0'
  description: 'External agents register, receive a dedicated wallet, and submit intents autonomously'
  lifecycle:
    register:
      endpoint: 'POST /api/byoa/register'
      auth: 'X-Admin-Key'
      result:
        agentId: 'string (UUID)'
        controlToken: 'string (shown once)'
        walletId: 'string'
        walletPublicKey: 'string'
    submit_intent:
      endpoint: 'POST /api/byoa/intents'
      auth: 'Bearer <control token>'
      behavior:
        - 'Agent submits high-level intent only'
        - 'Intent is audited and routed to Sophia orchestration'
        - 'No raw private key access'
    list_agents:
      endpoint: 'GET /api/byoa/agents'
      auth: 'none'
    get_agent:
      endpoint: 'GET /api/byoa/agents/:id'
      auth: 'none'
    intent_history:
      endpoint: 'GET /api/byoa/agents/:id/intents'
      auth: 'none'
    deactivate:
      endpoint: 'POST /api/byoa/agents/:id/deactivate'
      auth: 'X-Admin-Key'
    activate:
      endpoint: 'POST /api/byoa/agents/:id/activate'
      auth: 'X-Admin-Key'

  agent_isolation:
    - 'Each agent receives one wallet'
    - 'Each agent has a hashed control token'
    - 'Agent records are tenant-scoped'
    - 'Intent history is retained for audit and recovery'

  gmgn_alignment:
    - 'A BYOA agent exposes a gmgnSkills bundle derived from its supported intents'
    - 'GMGN skill tags help operators understand what external capabilities the agent implies'
```

---

## API Surface

```yaml
api:
  base_url: 'https://<production-api-host>'
  websocket: 'wss://<production-ws-host>'
  frontend_proxy: 'Next.js /api/* proxy -> backend'

  endpoints:
    root:
      method: 'GET'
      path: '/'
      auth: 'none'

    health:
      method: 'GET'
      path: '/api/health'
      auth: 'none'

    stats:
      method: 'GET'
      path: '/api/stats'
      auth: 'none'

    list_agents:
      method: 'GET'
      path: '/api/agents'
      auth: 'none'

    get_agent:
      method: 'GET'
      path: '/api/agents/:id'
      auth: 'none'

    create_agent:
      method: 'POST'
      path: '/api/agents'
      auth: 'X-Admin-Key'

    update_agent_config:
      method: 'PATCH'
      path: '/api/agents/:id/config'
      auth: 'X-Admin-Key'

    start_agent:
      method: 'POST'
      path: '/api/agents/:id/start'
      auth: 'X-Admin-Key'

    stop_agent:
      method: 'POST'
      path: '/api/agents/:id/stop'
      auth: 'X-Admin-Key'

    list_transactions:
      method: 'GET'
      path: '/api/transactions'
      auth: 'none'

    list_events:
      method: 'GET'
      path: '/api/events'
      auth: 'none'

    global_intent_history:
      method: 'GET'
      path: '/api/intents'
      auth: 'none'
      description: 'Combined intent history from built-in and BYOA agents'

    strategies:
      method: 'GET'
      path: '/api/strategies'
      auth: 'none'

    strategy_detail:
      method: 'GET'
      path: '/api/strategies/:name'
      auth: 'none'

    byoa_register:
      method: 'POST'
      path: '/api/byoa/register'
      auth: 'X-Admin-Key'

    byoa_submit_intent:
      method: 'POST'
      path: '/api/byoa/intents'
      auth: 'Bearer <control token>'

    byoa_agents:
      method: 'GET'
      path: '/api/byoa/agents'
      auth: 'none'
```

---

## WebSocket Events

```yaml
websocket_events:
  initial_state:
    payload:
      agents: 'Agent[]'
      stats: 'SystemStats'

  broadcasts:
    agent_created:
      fields: [agent]
    agent_status_changed:
      fields: [agentId, previousStatus, newStatus]
    agent_action:
      fields: [agentId, action, details]
    transaction:
      fields: [transaction]
    balance_changed:
      fields: [walletId, previousBalance, newBalance]
    system_error:
      fields: [error, context]
```

---

## Frontend Pages

```yaml
frontend:
  framework: 'Next.js 14 (Pages Router)'
  port: 3000
  pages:
    dashboard: '/'
    agents_list: '/agents'
    agent_detail: '/agents/:id'
    transactions: '/transactions'
    connected_agents: '/connected-agents'
    connected_agent_detail: '/connected-agents/:id'
    strategies: '/strategies'
    intent_history: '/intent-history'
    byoa_register: '/byoa-register'
```

---

## Type Contracts

```typescript
type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error' | 'stopped' | 'paused';

type AgentStrategy = string;
// Built-in strategies currently include accumulator, distributor, balance_guard,
// scheduled_payer, plus any runtime-registered strategy definitions.

type ExternalAgentStatus = 'registered' | 'active' | 'inactive' | 'revoked';

type SupportedIntentType =
  | 'REQUEST_AIRDROP'
  | 'TRANSFER_SOL'
  | 'TRANSFER_TOKEN'
  | 'QUERY_BALANCE'
  | 'AUTONOMOUS'
  | 'SERVICE_PAYMENT'
  | 'swap'
  | 'stake'
  | 'unstake'
  | 'liquid_stake'
  | 'provide_liquidity'
  | 'remove_liquidity'
  | 'deposit_lending'
  | 'withdraw_lending'
  | 'borrow_lending'
  | 'repay_lending'
  | 'farm_deposit'
  | 'farm_harvest'
  | 'wrap_token'
  | 'unwrap_token'
  | 'composite_strategy';
```

---

## Persistence

```yaml
persistence:
  engine: 'JSON file store (data/ directory)'
  files:
    wallets.json: 'Encrypted wallet key material and metadata'
    agents.json: 'Built-in agent state and configuration'
    byoa-agents.json: 'BYOA agent records and hashed tokens'
    byoa-binder.json: 'Wallet-to-agent binding map'
    transactions.json: 'Transaction history and events'
    bearer_tokens.json: 'Persistent user bearer tokens for mainnet login sessions'
  behavior:
    - 'Automatic save on state change'
    - 'Automatic restore on server restart'
    - 'State is tenant-aware where applicable'
```

---

## Observability and Testing

```yaml
observability:
  health_endpoint: '/api/health'
  stats_endpoint: '/api/stats'
  intent_history: '/api/intents'
  logs: 'Structured server-side logs'

testing:
  framework: 'vitest'
  core_checks:
    - 'token verification'
    - 'wallet encryption'
    - 'strategy registry DTOs'
    - 'BYOA registration and lifecycle'
    - 'mainnet blocking of devnet-only actions'
```

---

## Deployment Notes

```yaml
deployment:
  production_requirements:
    - 'SOLANA_NETWORK=mainnet-beta'
    - 'Production RPC provider'
    - 'Production database'
    - 'Privy auth configured'
    - 'ADMIN_API_KEY configured'
    - 'GMGN environment configured if skill-backed analytics are enabled'
  smoke_checks:
    - 'Health endpoint responds'
    - 'A logged-in user receives a persistent bearer token'
    - 'A BYOA agent can register, bind a wallet, and submit an intent'
    - 'Strategy registry includes GMGN skill tags'
```

---

## Operational Guidance for Autonomous Agents

```yaml
autonomous_agent_guidance:
  use_when:
    - 'The user wants Sophia to act continuously or through an external agent'
    - 'The workflow is mainnet-safe and logged'
    - 'The agent has a registered wallet and valid bearer token'

  must_do:
    - 'Check the agent scope before executing'
    - 'Prefer strategy-aware flows over raw transaction execution'
    - 'Use GMGN token / market / portfolio / track / swap / cooking skill mappings when reasoning about trading and discovery'
    - 'Treat all mainnet actions as irreversible'

  must_not_do:
    - 'Assume devnet faucets or test wallets exist'
    - 'Bypass auth or policy checks for built-in agents'
    - 'Leak private keys or control tokens'
```

---

## Quick Reference

```yaml
quick_reference:
  mainnet_login:
    flow: 'Privy login -> server-issued bearer token -> persistent reuse'

  built_in_agents:
    flow: 'Strategy registry -> policy engine -> wallet manager -> RPC submit'

  byoa_agents:
    flow: 'Register -> bind wallet -> bearer control token -> submit intents'

  gmgn_skills:
    token: 'Security, holders, pool, traders'
    market: 'Trending, trenches, signal feed'
    portfolio: 'Holdings, activity, stats, created tokens'
    track: 'KOL, smart money, follow-wallet flows'
    swap: 'Swaps, limit orders, exits'
    cooking: 'Bundled entry + take-profit/stop-loss execution'
```
