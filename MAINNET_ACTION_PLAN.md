# 🚀 Mainnet Action Plan: 11 Strategies

**Target**: Production-ready mainnet deployment with all 11 strategies fully functional.

**Estimated Timeline**: 3-4 weeks

**Current Blockers**: 3 (mock staking adapters), 1 (price oracle)

---

## Priority 1: CRITICAL - Fix by Week 1

### Task 1.1: Replace Mock Staking Adapters (Marinade)

**File**: `src/defi/staking-adapters.ts` (lines 40-125)

**Current State** (Broken):

```typescript
export class MarinadAdapter implements StakingAdapter {
  async stake(params: { payer: PublicKey; amount: number }) {
    logger.info('Marinade stake', { amount: params.amount });
    const tx = new Transaction();  // ← Empty!
    return success(tx);
  }

  async unstake(...) { const tx = new Transaction(); return success(tx); }

  async deposit(...) { const tx = new Transaction(); return success(tx); }
}
```

**Required Implementation**:

```typescript
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export class MarinadAdapter implements StakingAdapter {
  private readonly MARINADE_STATE = new PublicKey('MarBmsSgKXdrQVo3DFKv5KKynQCzkDkd5MS5zWLVKWp');
  private readonly MSOL_MINT = new PublicKey('mSoLzYCxHdgqyuwrZgaqMMUQbW39Rk47TCWRaufqgr');
  private readonly MARINADE_PROGRAM = new PublicKey('MarBmsSgKXdrQVo3DFKv5KKynQCzkDkd5MS5zWLVKWp');

  async stake(params: {
    payer: PublicKey;
    validatorVoteAddress?: string;
    amount: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      const tx = new Transaction();

      // 1. Derive Marinade reserve account
      const [marinadeReserve] = PublicKey.findProgramAddressSync(
        [Buffer.from('liq:sol:reserve')],
        this.MARINADE_PROGRAM
      );

      // 2. Create mSOL token account for payer
      const msolTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        this.MSOL_MINT,
        params.payer
      );

      // 3. Build deposit instruction
      // Pseudocode - actual implementation uses Marinade IDL
      const depositInstruction = await this.buildMarinaDeposit({
        payer: params.payer,
        msolTokenAccount,
        amount: params.amount,
        marinadeReserve,
      });

      tx.add(depositInstruction);
      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async unstake(params: {
    payer: PublicKey;
    msolAmount: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      // Order unstake with Marinade (returns ticket to redeem later or immediately burn)
      // Returns unstake ticket; claim happens in separate transaction
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
```

**Why This Matters**:

- `yield_harvesting` strategy **cannot work** without this
- Currently returns empty transactions (silent failure in production)
- Users believe rewards are harvesting when nothing happens on-chain

**Acceptance Criteria**:

- [ ] Deposit instruction actually calls Marinade program
- [ ] mSOL token account is created if needed
- [ ] Transaction is non-empty (>= 1 instruction)
- [ ] Integration test passes on testnet

**Dependencies**:

- Requires `@marinade.finance/marinade-ts-sdk` or manual IDL parsing
- Requires real SPL Token integration

---

### Task 1.2: Replace Mock Staking Adapters (Lido)

**File**: `src/defi/staking-adapters.ts` (lines 150-250)

**Current State** (Broken):

```typescript
export class LidoAdapter implements StakingAdapter {
  async getValidators() {
    // Returns hardcoded validator list
    const validators: StakingReward[] = [{ ... hardcoded APR ... }];
    return success(validators);
  }

  async stake(...) {
    return success(0.078);  // ← Hardcoded APY!
  }
}
```

**Required Implementation**:

- Query Lido's on-chain program state for real validator APRs
- Build delegation instructions using actual stake pool accounts
- Similar structure to Marinade but different program address

**Implementation Guide**:

```typescript
export class LidoAdapter implements StakingAdapter {
  private readonly LIDO_PROGRAM = new PublicKey('LidoStakedSol...');

  async getValidators(): Promise<Result<StakingReward[], Error>> {
    // Fetch from Lido's state account
    // Parse validator list with real APRs
  }

  async stake(params): Promise<Result<Transaction, Error>> {
    // Build delegate instruction using real stake pool accounts
    // Similar to Marinade but Lido-specific
  }
}
```

**Acceptance Criteria**:

- [ ] Fetches real validator APRs from Lido state
- [ ] Returns non-empty transaction
- [ ] Testnet integration passes
- [ ] APY matches on-chain state (not hardcoded)

---

### Task 1.3: Replace Mock Staking Adapters (Jito)

**File**: `src/defi/staking-adapters.ts` (lines 280-330)

**Current State** (Broken):

```typescript
export class JitoAdapter implements StakingAdapter {
  async stake(...) {
    return success(0.095);  // ← Hardcoded 9.5% APY!
  }
}
```

**Required Implementation**:

- Query Jito's MEV restaking pool for real APY
- Handle JitoSOL wrapping and delegation
- Jito-specific stake pool accounts

**Acceptance Criteria**:

- [ ] Real APY from Jito pool (not hardcoded)
- [ ] Builds valid stake pool delegation instruction
- [ ] Testnet integration passes

---

### Task 1.4: Implement Production Price Oracle (Pyth)

**File**: `src/defi/registry.ts` (replace lines 30-52)

**Current State** (Broken):

```typescript
class MockPriceOracle implements PriceOracle {
  async getMint(mint: string) {
    const prices: Record<string, number> = {
      So11111111111111111111111111111111111111112: 140, // ← Hardcoded!
      EPjFWdd5Au57zLLs2btkQSo3jzSgv91stKL59z8p6vW: 1.0, // ← Hardcoded!
    };
    return { ok: true, value: { price, lastUpdated: new Date(), source: 'mock' } };
  }
}

// Then used:
this.oracle = new MockPriceOracle(); // ← All prices are fake
```

**Required Implementation** (Pyth Network):

```typescript
import { PythSolanaReceiver, getPythProgramKeyForCluster } from '@pythnetwork/solana-sdk';

class PythPriceOracle implements PriceOracle {
  private pythClient: PythSolanaReceiver;
  private connection: Connection;

  constructor(connection: Connection, cluster: Cluster) {
    this.connection = connection;
    this.pythClient = new PythSolanaReceiver({
      connection,
      cluster: cluster === 'mainnet-beta' ? 'mainnet' : cluster,
    });
  }

  async getMint(mint: string): Promise<{
    ok: boolean;
    value?: { price: number; lastUpdated: Date; source: string };
    error?: Error;
  }> {
    try {
      const priceData = this.pythClient.getPriceDataByProductId(mint);

      if (!priceData) {
        return {
          ok: false,
          error: new Error(`No Pyth price for ${mint}`),
        };
      }

      return {
        ok: true,
        value: {
          price: priceData.getPriceUnchecked().price,
          lastUpdated: new Date(priceData.getPriceUnchecked().publishTime * 1000),
          source: 'pyth',
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async getPriceHistory(...) {
    // Pyth doesn't provide history on-chain; fallback to off-chain API
    // or use historical indexer if available
  }
}
```

**Then Use in Registry**:

```typescript
export class DeFiRegistryImpl implements DeFiRegistry {
  constructor(connection: Connection, cluster: Cluster = 'mainnet-beta') {
    // Replace this:
    // this.oracle = new MockPriceOracle();

    // With this:
    this.oracle = new PythPriceOracle(connection, cluster);
  }
}
```

**Why Pyth**:

- ✅ Solana-native oracle (100+ tokens supported)
- ✅ Updated every 400ms on-chain
- ✅ No external API dependency
- ✅ Decentralized price feed
- ❌ Costs lamports per read (minimal)

**Alternative: Use GMGN API** (already a project skill)

```typescript
// Can also integrate gmgn-market skill:
class GmgnPriceOracle implements PriceOracle {
  async getMint(mint: string) {
    // Call gmgn-market skill to get K-line data
    // Extract current price
    // More expensive (API rate limits) but works for MVP
  }
}
```

**Acceptance Criteria**:

- [ ] Prices are fetched from Pyth (not hardcoded)
- [ ] Prices update within 1 minute
- [ ] Fallback to secondary source if Pyth unavailable
- [ ] Integration test on testnet passes

---

### Task 1.5: Remove All Mock Signatures from DeFi Registry

**File**: `src/defi/registry.ts` (lines 245, 297, 338, 379, 416, 452, 487, 528, 564, 601, 628)

**Current State** (Broken - 11 places):

```typescript
case 'stake': {
  logger.info('Staking intent received (mock handler)');
  return {
    ok: true,
    value: { signature: 'mock-sig-' + Date.now() }  // ← Fake!
  };
}
case 'unstake': { ... same pattern ... }
case 'liquid_stake': { ... same pattern ... }
case 'provide_liquidity': { ... same pattern ... }
// ... 7 more
```

**Required Implementation**:

For each case, actually build and send the transaction:

```typescript
case 'stake': {
  const protocol = params.stakingProtocol || 'marinade';
  const adapter = this.staking.get(protocol);

  if (!adapter) {
    return { ok: false, error: new Error(`Unknown staking protocol: ${protocol}`) };
  }

  try {
    // 1. Build transaction using adapter
    const txResult = await adapter.stake({
      payer: params.payer,
      amount: params.amount,
      validatorVoteAddress: params.validatorVoteAddress,
    });

    if (!txResult.ok) return txResult;
    const tx = txResult.value;

    // 2. Sign transaction
    const signedTx = await this.signTransaction(tx, params.payer);

    // 3. Send to network
    const signature = await this.connection.sendTransaction(signedTx, []);

    // 4. Wait for confirmation
    const confirmation = await this.connection.confirmTransaction(signature);

    if (!confirmation.value.err) {
      return {
        ok: true,
        value: {
          signature,
          executionLog: [`Staked ${params.amount} lamports via ${protocol}`],
        },
      };
    } else {
      return {
        ok: false,
        error: new Error(`Transaction failed: ${confirmation.value.err}`),
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
```

**Repeat for all intent types**:

- [ ] stake
- [ ] unstake
- [ ] liquid_stake
- [ ] provide_liquidity
- [ ] remove_liquidity
- [ ] deposit_lending
- [ ] withdraw_lending
- [ ] borrow_lending
- [ ] repay_lending
- [ ] farm_deposit
- [ ] farm_harvest

**Acceptance Criteria**:

- [ ] All 11 intent handlers build real transactions
- [ ] No 'mock-sig-' signatures in production
- [ ] Add validation: `if (sig.startsWith('mock-')) throw error`
- [ ] Testnet integration tests pass for each intent type

---

## Priority 2: HIGH - Fix by Week 2

### Task 2.1: Remove Dev-Mode Fallbacks from DEX Adapters

**File**: `src/defi/dex-adapters.ts` (Jupiter, lines 31-88)

**Current Issue**:

```typescript
async routeSwap(params) {
  if (isProduction()) {
    // Real Jupiter API
  } else {
    // DEV FALLBACK - fake output
    const outputAmount = Math.floor(params.amount * 0.95);
    return success(quote);  // Always 5% output!
  }
}
```

**Fix**:

```typescript
async routeSwap(params) {
  if (!isProduction()) {
    logger.warn('Running in development mode; consider setting NODE_ENV=production');
  }

  try {
    // Always try real API first
    const response = await fetch(...);

    if (!response.ok) {
      // Don't fallback to fake quote; return error
      logger.error('Jupiter API failed', { status: response.status });
      throw new Error(`Jupiter API: ${response.statusText}`);
    }

    return success(quote);
  } catch (err) {
    logger.error('Jupiter routing failed', { error: err.message });

    // Optional: Try fallback to Raydium before giving up
    try {
      return await raydiumAdapter.routeSwap(params);
    } catch (fallbackErr) {
      logger.error('All DEX adapters failed', { primary: err, fallback: fallbackErr });
      return failure(fallbackErr);
    }
  }
}
```

**Acceptance Criteria**:

- [ ] No silent fallbacks to fake quotes
- [ ] Errors are logged and returned, not hidden
- [ ] Circuit breaker tries secondary DEX on failure
- [ ] Testnet integration test passes

---

### Task 2.2: Implement PostgreSQL-Only State Persistence

**File**: `src/utils/store.ts`

**Current State** (Risky):

```typescript
export async function saveState(key: string, data: Record<string, unknown>) {
  const path = join(process.cwd(), 'data', `${key}.json`);
  const json = JSON.stringify(data, null, 2);
  writeFileSync(path, json, 'utf-8'); // ← File-backed, not durable
}
```

**Required**:

```typescript
import { Pool } from 'pg';

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function saveState(key: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }

  try {
    // Production: Use PostgreSQL
    const json = JSON.stringify(data);
    await dbPool.query(
      'INSERT INTO system_state (key, value, updated_at) VALUES ($1, $2, NOW()) ' +
        'ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [key, json]
    );
  } catch (err) {
    logger.error('Failed to save state to PostgreSQL', { key, error: err.message });

    if (process.env.NODE_ENV === 'production') {
      throw err; // Fail in production
    } else {
      // Fallback to file in development
      const path = join(process.cwd(), 'data', `${key}.json`);
      writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
    }
  }
}
```

**Also Needed**:

Create migration to initialize `system_state` table:

```sql
-- migrations/001_create_system_state.sql
CREATE TABLE IF NOT EXISTS system_state (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_state_key ON system_state(key);

-- Enable WAL (write-ahead logging) for durability
ALTER SYSTEM SET wal_level = replica;
```

**Acceptance Criteria**:

- [ ] Agent state saved to PostgreSQL in production
- [ ] File fallback only in development
- [ ] WAL enabled for durability
- [ ] State recovery test passes after crash simulation
- [ ] Backup procedure documented

---

### Task 2.3: Add RPC Failover Validation

**File**: `src/utils/config.ts` (add after line 135)

**Current Gap**:

- Config validates network is mainnet ✅
- Config checks RPC URL doesn't contain 'devnet' ✅
- **Missing**: Validates that SOLANA_RPC_URLS is actually used

**Required**:

```typescript
if (process.env['NODE_ENV'] === 'production') {
  const primaryRpc = result.data.SOLANA_RPC_URL;
  const rpcList = result.data.SOLANA_RPC_URLS?.split(',').map((u) => u.trim());

  if (!rpcList || rpcList.length === 0) {
    console.warn('WARNING: SOLANA_RPC_URLS is not configured. No failover available.');
  } else if (rpcList[0] !== primaryRpc) {
    throw new Error(
      'CRITICAL: SOLANA_RPC_URLS[0] must match SOLANA_RPC_URL for deterministic routing.'
    );
  } else if (rpcList.length < 2) {
    console.warn(
      'WARNING: Only 1 RPC endpoint configured. Add fallback endpoints to SOLANA_RPC_URLS.'
    );
  } else {
    console.log(`✓ RPC failover configured with ${rpcList.length} endpoints`);
  }
}
```

**Acceptance Criteria**:

- [ ] Validates SOLANA_RPC_URLS is non-empty in production
- [ ] Validates primary RPC matches SOLANA_RPC_URL
- [ ] Warns if only 1 endpoint (no failover)
- [ ] Test passes with 3+ endpoints configured

---

### Task 2.4: Add Production Transaction Validation

**File**: `src/integration/intentRouter.ts` (add before signing, line ~200)

**Current Gap**:

- Empty transactions can be built and signed
- No check for zero-instruction transactions

**Required**:

```typescript
async function validateTransaction(
  tx: Transaction | VersionedTransaction
): Promise<Result<void, Error>> {
  const instructions = 'message' in tx ? tx.message.instructions : tx.instructions;

  if (!instructions || instructions.length === 0) {
    const error = new Error(
      'CRITICAL: Transaction has zero instructions. This is likely a mock/stub implementation.'
    );
    logger.error(error.message, { tx });

    if (process.env.NODE_ENV === 'production') {
      return failure(error);
    }

    // In development, warn but allow (for testing)
    logger.warn('Allowing zero-instruction transaction in development mode');
    return success(undefined);
  }

  return success(undefined);
}

// Use before signing:
async function executeIntent(intent: Intent): Promise<Result<string, Error>> {
  // ... build tx ...

  const validation = await validateTransaction(tx);
  if (!validation.ok) return validation; // Stop if zero instructions

  // ... sign and send ...
}
```

**Acceptance Criteria**:

- [ ] Fails if transaction has zero instructions
- [ ] In production mode: throws error
- [ ] In development: logs warning but allows
- [ ] Test passes with valid multi-instruction transaction

---

## Priority 3: MEDIUM - Fix by Week 3

### Task 3.1: Add Testnet Integration Tests

**File**: `tests/integration-solana-testnet.test.ts` (NEW FILE)

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Connection } from '@solana/web3.js';
import { createAgent } from '../src/agent/index.js';

describe('Strategies on Solana Testnet', () => {
  let connection: Connection;

  beforeAll(() => {
    // Use testnet RPC
    connection = new Connection('https://api.testnet.solana.com', 'confirmed');

    // Override config for testnet
    process.env.SOLANA_RPC_URL = 'https://api.testnet.solana.com';
    process.env.SOLANA_NETWORK = 'testnet';
  });

  it('scalping_trading agent can execute swap intent', async () => {
    const agent = createAgent({
      config: {
        name: 'test-scalping',
        strategy: 'scalping_trading',
        strategyParams: {
          baseToken: 'USDC',
          targetToken: 'SOL',
          maxSlippage: 0.2,
        },
      },
      walletId: 'test-wallet',
      walletPublicKey: 'test-pubkey-12345...',
    });

    expect(agent.ok).toBe(true);

    // Verify agent emits swap intent
    const context = {
      walletPublicKey: 'test-pubkey',
      balance: { sol: 1, lamports: 1_000_000_000n },
      tokenBalances: [],
      recentTransactions: [],
    };

    const decision = await agent.value.think(context);
    expect(decision.shouldAct).toBe(true);
    expect(decision.intent?.action).toBe('swap');
  });

  it('all 11 strategies can be created without errors', () => {
    const strategies = [
      'scalping_trading',
      'breakout_trading',
      'mean_reversion_trading',
      'dca',
      'grid_trading',
      'momentum_trading',
      'arbitrage',
      'stop_loss_guard',
      'yield_harvesting',
      'portfolio_rebalancer',
      'airdrop_farmer',
    ];

    for (const strategy of strategies) {
      const result = createAgent({
        config: {
          name: `test-${strategy}`,
          strategy,
          strategyParams: {},
        },
        walletId: 'test-wallet',
        walletPublicKey: 'test-pubkey',
      });

      expect(result.ok).toBe(true, `${strategy} should be creatable`);
    }
  });

  // Add more tests...
});
```

**Acceptance Criteria**:

- [ ] Tests pass on Solana testnet
- [ ] All 11 strategies tested
- [ ] Verifies agent decision logic works
- [ ] Verifies intent structure is correct

---

### Task 3.2: Add Monitoring & Alerting

**File**: `src/utils/metrics.ts` (NEW FILE)

```typescript
// Prometheus metrics for strategy performance
import { Counter, Gauge, Histogram } from 'prom-client';

export const strategyExecutionCount = new Counter({
  name: 'strategy_executions_total',
  help: 'Total number of strategy executions',
  labelNames: ['strategy', 'outcome'],
});

export const strategyProfitLoss = new Gauge({
  name: 'strategy_pnl_usd',
  help: 'Realized P&L per strategy in USD',
  labelNames: ['strategy'],
});

export const transactionDuration = new Histogram({
  name: 'transaction_duration_ms',
  help: 'Transaction execution time in milliseconds',
  labelNames: ['intent_type'],
  buckets: [100, 500, 1000, 5000, 10000],
});

export const rpcLatency = new Histogram({
  name: 'rpc_latency_ms',
  help: 'RPC call latency in milliseconds',
  labelNames: ['endpoint', 'method'],
  buckets: [50, 100, 500, 1000, 5000],
});

export const errorRate = new Counter({
  name: 'errors_total',
  help: 'Total errors by type',
  labelNames: ['error_type', 'component'],
});
```

**Acceptance Criteria**:

- [ ] Metrics collected for all strategies
- [ ] Prometheus endpoint `/metrics` works
- [ ] Grafana dashboard can visualize metrics

---

### Task 3.3: Add Feature Flags for Risky Strategies

**File**: `src/utils/feature-flags.ts` (NEW FILE)

```typescript
export interface FeatureFlags {
  enableArbitrageStrategy: boolean;
  enableAirdropFarmerStrategy: boolean;
  enableYieldHarvestingStrategy: boolean;
  maxConcurrentStrategies: number;
}

export const DEFAULT_FLAGS: FeatureFlags = {
  enableArbitrageStrategy: false, // High risk, disabled by default
  enableAirdropFarmerStrategy: false, // Experimental
  enableYieldHarvestingStrategy: false, // Requires production staking adapters
  maxConcurrentStrategies: 5, // Start low, increase after testing
};

export function getFeatureFlags(): FeatureFlags {
  return {
    enableArbitrageStrategy: process.env.ENABLE_ARBITRAGE === 'true',
    enableAirdropFarmerStrategy: process.env.ENABLE_AIRDROP_FARMER === 'true',
    enableYieldHarvestingStrategy: process.env.ENABLE_YIELD_HARVESTING === 'true',
    maxConcurrentStrategies: parseInt(process.env.MAX_CONCURRENT_STRATEGIES || '5'),
  };
}
```

**Then use in factory**:

```typescript
export function createAgent(options: CreateAgentOptions): Result<BaseAgent, Error> {
  const flags = getFeatureFlags();

  if (options.config.strategy === 'arbitrage' && !flags.enableArbitrageStrategy) {
    return failure(new Error('Arbitrage strategy is disabled'));
  }

  // ... continue ...
}
```

**Acceptance Criteria**:

- [ ] Risky strategies disabled by default
- [ ] Can be enabled via environment variables
- [ ] Agent factory respects flags
- [ ] Test verifies disabled strategy is rejected

---

## Deployment Timeline

### Week 1 (Critical Fixes)

- [ ] Tasks 1.1-1.5: Staking adapters + price oracle + remove mock signatures
- Expected: 3/11 blocked strategies → ready ✅

### Week 2 (High Priority)

- [ ] Tasks 2.1-2.4: Dev fallbacks + state persistence + RPC validation + tx validation
- Expected: Production hardening

### Week 3 (Medium Priority)

- [ ] Tasks 3.1-3.3: Integration tests + monitoring + feature flags
- Expected: Observability + safety guards

### Week 4 (Testing & Launch Prep)

- [ ] Full load test (20 concurrent agents)
- [ ] Mainnet dry-run on testnet
- [ ] Security review
- [ ] Incident response drills
- [ ] Launch readiness review

---

## Success Criteria for Mainnet Launch

- [ ] ✅ All 11 strategies use real protocol implementations (no stubs)
- [ ] ✅ All prices come from production oracle (not hardcoded)
- [ ] ✅ All state persisted to PostgreSQL (not files)
- [ ] ✅ RPC failover tested and working
- [ ] ✅ Integration tests pass on testnet
- [ ] ✅ Metrics + alerting configured
- [ ] ✅ Feature flags protect risky strategies
- [ ] ✅ Load testing passed (20 agents, 1000+ txs/min)
- [ ] ✅ Security audit complete
- [ ] ✅ Incident response plan documented

---

**Document Version**: 1.0.0 | **Last Updated**: May 18, 2026 | **Author**: Engineering | **Status**: Actionable
