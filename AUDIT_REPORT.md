# Comprehensive Codebase Audit Report

**Date**: April 18, 2026  
**Project**: Agentic Wallet System (Sophia)  
**Scope**: Full TypeScript codebase audit for security, code quality, and production readiness  
**Status**: ⚠️ **Multiple issues identified** - Ready for fixes

---

## Executive Summary

The Agentic Wallet system has a **solid architectural foundation** with intent-based separation of concerns, proper encryption, and good security thinking. However, there are **12 critical and high-priority issues** across error handling, type safety, validation, and transaction building that need to be addressed before production deployment.

### Key Findings
- ✅ **Good**: Security-first design, separation of agent/wallet layers, encryption practices
- ⚠️ **Needs Work**: Error handling gaps, missing validation in edge cases, type safety issues
- 🔴 **Critical**: Transaction builder race conditions, blockchain call failures not handled properly

### Severity Breakdown
- 🔴 **Critical**: 3 issues (security/crash risk)
- 🟠 **High**: 5 issues (data integrity/UX)
- 🟡 **Medium**: 4 issues (maintainability/robustness)

---

## 1. CRITICAL ISSUES

### 1.1 🔴 Transaction Builder: Missing Error Handling for getRecentBlockhash()

**Location**: [src/rpc/transaction-builder.ts](src/rpc/transaction-builder.ts#L78-L120)  
**Severity**: CRITICAL  
**Risk**: Silent transaction failures, duplicate transactions on retry

**Problem**:
```typescript
export async function buildSolTransfer(
  from: PublicKey,
  to: PublicKey,
  amount: number,
  memo?: string
): Promise<Result<Transaction, Error>> {
  try {
    const client = getSolanaClient();
    const blockhashResult = await client.getRecentBlockhash();

    if (!blockhashResult.ok) {
      return failure(blockhashResult.error);  // ✅ Handled here...
    }

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);
    const transaction = new Transaction({
      recentBlockhash: blockhashResult.value,  // But uses .value without null check
      feePayer: from,
    });
    // ... rest of code
```

The `blockhashResult.value` could be undefined if the RPC call returns a falsy value or type mismatch. The code checks `.ok` but the type system doesn't enforce that `.value` exists when `.ok === true`.

**Fix**:
```typescript
const blockhashResult = await client.getRecentBlockhash();
if (!blockhashResult.ok) {
  return failure(blockhashResult.error);
}

const blockhash = blockhashResult.value;
if (!blockhash) {
  return failure(new Error('Failed to fetch recent blockhash: returned empty'));
}

const transaction = new Transaction({
  recentBlockhash: blockhash,
  feePayer: from,
});
```

**Affects**: 
- [buildSolTransfer](src/rpc/transaction-builder.ts#L78)
- [buildTokenTransfer](src/rpc/transaction-builder.ts#L151)
- [buildMemoTransaction](src/rpc/transaction-builder.ts#L50)
- [estimateFee](src/rpc/transaction-builder.ts#L233)

---

### 1.2 🔴 Wallet Manager: Race Condition in Daily Reset

**Location**: [src/wallet/wallet-manager.ts](src/wallet/wallet-manager.ts#L37-L60)  
**Severity**: CRITICAL  
**Risk**: Daily transfer limits not properly reset, allowing abuse

**Problem**:
```typescript
private scheduleDailyReset(): void {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    this.dailyTransfers.clear();  // Clears ALL transfers at once
    logger.info('Daily transfer counters reset');
    this.scheduleDailyReset();
  }, msUntilMidnight);
}
```

**Issues**:
1. `clear()` happens atomically but transfer operations could race against the reset
2. If the server crashes before `setTimeout` callback fires, it never reschedules
3. Multiple `WalletManager` instances (if instantiated multiple times) each spawn their own reset timers
4. No recovery of transfer counts from disk after restart

**Fix**:
```typescript
private dailyResetTimer: NodeJS.Timeout | null = null;

private scheduleDailyReset(): void {
  // Cancel any existing timer
  if (this.dailyResetTimer) {
    clearTimeout(this.dailyResetTimer);
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();

  this.dailyResetTimer = setTimeout(() => {
    this.dailyTransfers.clear();
    logger.info('Daily transfer counters reset');
    this.saveToStore();  // Persist the reset state
    this.scheduleDailyReset();
  }, msUntilMidnight);
}

// Add cleanup on shutdown
destroy(): void {
  if (this.dailyResetTimer) {
    clearTimeout(this.dailyResetTimer);
  }
}
```

---

### 1.3 🔴 Intent Router: Missing Transaction Signature Validation

**Location**: [src/integration/intentRouter.ts](src/integration/intentRouter.ts#L250-L350)  
**Severity**: CRITICAL  
**Risk**: Transactions could be submitted without all required signers

**Problem**:
```typescript
private async executeTransferSol(
  walletId: string,
  agentId: string,
  params: Record<string, unknown>,
  intentId: string
): Promise<Record<string, unknown>> {
  // ... builds transaction via buildSolTransfer()
  // ... signs with wallet
  
  // BUT: No validation that transaction was actually signed
  const signResult = this.walletManager.signTransaction(walletId, transaction);
  if (!signResult.ok) {
    throw new Error(`Signing failed: ${signResult.error.message}`);
  }

  const signedTx = signResult.value;
  
  // Directly sends without checking if all required signers are present
  return await this.submitTransaction(signedTx);
}
```

The code doesn't verify:
1. Transaction was actually signed (check `signatures` array)
2. All required signers are present
3. Signature is valid before submission

**Fix**:
```typescript
const signResult = this.walletManager.signTransaction(walletId, transaction);
if (!signResult.ok) {
  throw new Error(`Signing failed: ${signResult.error.message}`);
}

const signedTx = signResult.value;

// Validate signature
if (signedTx instanceof Transaction) {
  if (!signedTx.signatures || signedTx.signatures.length === 0) {
    throw new Error('Transaction was not signed');
  }
  const feePayer = signedTx.feePayer;
  if (!feePayer) {
    throw new Error('Transaction missing fee payer');
  }
  const payerSigned = signedTx.signatures.some(sig => sig.publicKey.equals(feePayer));
  if (!payerSigned) {
    throw new Error('Fee payer did not sign the transaction');
  }
}

return await this.submitTransaction(signedTx);
```

---

## 2. HIGH PRIORITY ISSUES

### 2.1 🟠 Distributed Agent: Invalid Recipient Address Not Caught

**Location**: [src/agent/distributor-agent.ts](src/agent/distributor-agent.ts#L85-L95)  
**Severity**: HIGH  
**Risk**: Transaction failures, debugging difficulty

**Problem**:
```typescript
async think(context: AgentContext): Promise<AgentDecision> {
  // ...
  
  const recipient = this.params.recipients[this.currentRecipientIndex];
  if (!recipient) {
    return {
      shouldAct: false,
      reasoning: 'No valid recipient at current index',
    };
  }

  // Don't send to self
  if (recipient === this.walletPublicKey) {
    this.currentRecipientIndex = (this.currentRecipientIndex + 1) % this.params.recipients.length;
    return {
      shouldAct: false,
      reasoning: 'Skipping self as recipient',
    };
  }

  // ⚠️ recipient is NEVER validated as a valid Solana PublicKey
  return {
    shouldAct: true,
    intent: this.createTransferSolIntent(recipient, this.params.amountPerTransfer),
    reasoning: `Distributing ${this.params.amountPerTransfer} SOL to recipient ${recipientIndex}`,
  };
}
```

The `recipient` is never validated as a proper Solana address. This should happen:
1. When recipients are added (`addRecipient()`)
2. When parameters are loaded from storage
3. Before creating the intent

**Fix**:
```typescript
import { PublicKey } from '@solana/web3.js';

addRecipient(address: string): void {
  try {
    // Validate it's a valid Solana address
    new PublicKey(address);
  } catch (error) {
    throw new Error(`Invalid Solana address: ${address}`);
  }
  
  if (!this.params.recipients.includes(address)) {
    this.params = {
      ...this.params,
      recipients: [...this.params.recipients, address],
    };
  }
}

async think(context: AgentContext): Promise<AgentDecision> {
  // ... existing code ...
  
  const recipient = this.params.recipients[this.currentRecipientIndex];
  if (!recipient) {
    return { shouldAct: false, reasoning: 'No valid recipient at current index' };
  }
  
  // Validate recipient address
  try {
    new PublicKey(recipient);
  } catch (error) {
    logger.error('Recipient address is invalid, skipping', { recipient });
    this.currentRecipientIndex = (this.currentRecipientIndex + 1) % this.params.recipients.length;
    return { shouldAct: false, reasoning: `Invalid recipient address: ${recipient}` };
  }
  
  // ... rest of code
}
```

---

### 2.2 🟠 Orchestrator: Missing Error Handling in Agent Cycle

**Location**: [src/orchestrator/orchestrator.ts](src/orchestrator/orchestrator.ts#L180-L230)  
**Severity**: HIGH  
**Risk**: Agent crashes silently, stops executing, not observable

**Problem**:
```typescript
private async executeAgentCycle(agentId: string): Promise<void> {
  const managed = this.agents.get(agentId);
  if (!managed || managed.cycleInProgress) return;

  managed.cycleInProgress = true;

  try {
    const agent = managed.agent;
    const walletResult = this.walletManager.getWallet(agent.walletId);
    if (!walletResult.ok) {
      logger.error('Wallet not found for agent cycle', { agentId, error: String(walletResult.error) });
      // ⚠️ But doesn't clear cycleInProgress - now stuck forever!
      return;
    }

    const wallet = walletResult.value;
    // ... continues to build context, call think(), etc.
    
    // No try-catch around agent.think() or intent execution
  } catch (error) {
    logger.error('Agent cycle failed', { agentId, error: String(error) });
  } finally {
    managed.cycleInProgress = false;  // This gets reset even on errors above
  }
}
```

**Issues**:
1. Early returns don't reset `cycleInProgress` flag
2. No error boundaries around `agent.think()` call
3. No error handling for intent execution failures
4. No retry logic for transient failures

**Fix**:
```typescript
private async executeAgentCycle(agentId: string): Promise<void> {
  const managed = this.agents.get(agentId);
  if (!managed) return;
  
  if (managed.cycleInProgress) {
    logger.warn('Agent cycle already in progress, skipping', { agentId });
    return;
  }

  managed.cycleInProgress = true;

  try {
    const agent = managed.agent;
    const walletResult = this.walletManager.getWallet(agent.walletId);
    
    if (!walletResult.ok) {
      logger.error('Wallet not found for agent cycle', { 
        agentId, 
        error: walletResult.error.message 
      });
      return; // Reset happens in finally
    }

    const wallet = walletResult.value;
    
    try {
      const context = this.buildAgentContext(wallet, agent);
      const decision = await agent.think(context);

      if (!decision.shouldAct) {
        logger.debug('Agent decided not to act', { agentId, reasoning: decision.reasoning });
        return;
      }

      if (!decision.intent) {
        logger.warn('Agent decided to act but provided no intent', { agentId });
        return;
      }

      // Execute intent with error handling
      const executionResult = await this.executeIntent(agent, decision.intent, wallet);
      
      if (!executionResult.ok) {
        logger.error('Intent execution failed', { 
          agentId, 
          intentType: decision.intent.type,
          error: executionResult.error.message 
        });
        // Still record the attempt for visibility
        agent.recordAction(false);
        return;
      }

      agent.recordAction(true);
      logger.info('Agent executed intent successfully', { agentId });
      
    } catch (agentError) {
      logger.error('Unhandled error in agent cycle', { 
        agentId, 
        error: agentError instanceof Error ? agentError.message : String(agentError) 
      });
      agent.recordAction(false);
    }
  } catch (error) {
    logger.error('Critical error in agent cycle', { 
      agentId, 
      error: error instanceof Error ? error.message : String(error) 
    });
  } finally {
    managed.cycleInProgress = false;
  }
}
```

---

### 2.3 🟠 Solana Client: Retry Logic Missing for Connection Errors

**Location**: [src/rpc/solana-client.ts](src/rpc/solana-client.ts#L50-L100)  
**Severity**: HIGH  
**Risk**: Transient network failures cause immediate request failures

**Problem**:
```typescript
async getBalance(publicKey: PublicKey): Promise<Result<BalanceInfo, Error>> {
  try {
    const lamports = await this.connection.getBalance(publicKey);  // No retry logic

    const balance: BalanceInfo = {
      sol: lamports / LAMPORTS_PER_SOL,
      lamports: BigInt(lamports),
    };

    logger.debug('Balance fetched', {
      publicKey: publicKey.toBase58(),
      lamports,
    });

    return success(balance);
  } catch (error) {
    logger.error('Failed to get balance', {
      publicKey: publicKey.toBase58(),
      error: toError(error).message,
    });
    return failure(toError(error));
  }
}
```

The `maxRetries` field is defined but never used. All blockchain calls should retry on transient failures.

**Fix**:
```typescript
private async withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<Result<T, Error>> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logger.info(`${operationName} succeeded after ${attempt} attempts`);
      }
      return success(result);
    } catch (error) {
      lastError = toError(error);
      const isLastAttempt = attempt === this.maxRetries;
      const logLevel = isLastAttempt ? 'error' : 'warn';
      
      logger.log(
        logLevel,
        `${operationName} failed (attempt ${attempt}/${this.maxRetries})`,
        { error: lastError.message }
      );
      
      if (!isLastAttempt) {
        // Exponential backoff: 100ms, 200ms, 400ms, etc.
        const delayMs = 100 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  return failure(lastError || new Error(`${operationName} failed after ${this.maxRetries} attempts`));
}

async getBalance(publicKey: PublicKey): Promise<Result<BalanceInfo, Error>> {
  const result = await this.withRetry(
    async () => {
      const lamports = await this.connection.getBalance(publicKey);
      return {
        sol: lamports / LAMPORTS_PER_SOL,
        lamports: BigInt(lamports),
      };
    },
    `getBalance(${publicKey.toBase58()})`
  );

  if (!result.ok) {
    logger.error('Failed to get balance after retries', {
      publicKey: publicKey.toBase58(),
      error: result.error.message,
    });
  }
  
  return result;
}
```

**Applies to**: 
- `getBalance()`
- `getTokenBalances()`
- `getRecentBlockhash()`
- `sendTransaction()`
- All blockchain calls

---

### 2.4 🟠 API Server: Missing Null/Type Checks in Wallet Operations

**Location**: [src/server.ts](src/server.ts#L400-L450)  
**Severity**: HIGH  
**Risk**: Crashes when wallet operations return unexpected types

**Problem**:
```typescript
app.get('/api/agents/:id', asyncHandler(async (req: Request, res: Response) => {
  const orchestrator = getOrchestrator();
  const walletManager = getWalletManager();
  const client = getSolanaClient();

  const agentResult = orchestrator.getAgent(req.params['id'] ?? '');
  if (!agentResult.ok) {
    sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
    return;
  }

  const agent = agentResult.value;
  let balance = 0;
  let tokenBalances: unknown[] = [];

  const walletResult = walletManager.getWallet(agent.walletId);
  if (walletResult.ok) {
    // ⚠️ Assumes walletResult.value has publicKey property - no null check
    const pubkey = new PublicKey(walletResult.value.publicKey);
    const balanceResult = await client.getBalance(pubkey);
    if (balanceResult.ok) {
      balance = balanceResult.value.sol;  // ⚠️ Assumes .value has .sol
    }
  }
  
  // ... continues with potential crash points
}));
```

**Issues**:
1. `walletResult.value.publicKey` could be undefined
2. `balanceResult.value.sol` could be undefined
3. `new PublicKey()` could throw and isn't caught
4. Response type is loose (`unknown[]`)

**Fix**:
```typescript
app.get('/api/agents/:id', asyncHandler(async (req: Request, res: Response) => {
  const orchestrator = getOrchestrator();
  const walletManager = getWalletManager();
  const client = getSolanaClient();

  const agentId = req.params['id'];
  if (!agentId) {
    sendError(res, 'Agent ID is required', HTTP_STATUS.BAD_REQUEST, ERROR_CODE.VALIDATION_FAILED);
    return;
  }

  const agentResult = orchestrator.getAgent(agentId);
  if (!agentResult.ok) {
    sendError(res, agentResult.error.message, HTTP_STATUS.NOT_FOUND, ERROR_CODE.AGENT_NOT_FOUND);
    return;
  }

  const agent = agentResult.value;
  let balance = 0;
  let tokenBalances: TokenBalance[] = [];

  const walletResult = walletManager.getWallet(agent.walletId);
  if (walletResult.ok) {
    const wallet = walletResult.value;
    
    // Type guard
    if (!wallet.publicKey || typeof wallet.publicKey !== 'string') {
      logger.error('Invalid wallet public key', { walletId: agent.walletId });
    } else {
      try {
        const pubkey = new PublicKey(wallet.publicKey);
        
        const balanceResult = await client.getBalance(pubkey);
        if (balanceResult.ok) {
          balance = balanceResult.value.sol;
        } else {
          logger.warn('Failed to fetch balance', { error: balanceResult.error.message });
        }
        
        const tokensResult = await client.getTokenBalances(pubkey);
        if (tokensResult.ok) {
          tokenBalances = tokensResult.value;
        } else {
          logger.warn('Failed to fetch token balances', { error: tokensResult.error.message });
        }
      } catch (error) {
        logger.error('Failed to parse wallet public key', { 
          publicKey: wallet.publicKey, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
  }

  const transactions = orchestrator.getAgentTransactions(agent.id);
  const events = eventBus.getAgentEvents(agent.id, 50);

  sendSuccess(res, {
    agent,
    balance,
    tokenBalances,
    transactions,
    events,
  });
}));
```

---

### 2.5 🟠 Store: State Not Persisted on Wallet Daily Reset

**Location**: [src/wallet/wallet-manager.ts](src/wallet/wallet-manager.ts#L37-L60)  
**Severity**: HIGH  
**Risk**: State loss on restart, transfer limits reset incorrectly

**Problem**:
```typescript
private scheduleDailyReset(): void {
  // ... calculates msUntilMidnight ...
  
  setTimeout(() => {
    this.dailyTransfers.clear();
    logger.info('Daily transfer counters reset');
    this.scheduleDailyReset();  // Reschedules but doesn't persist
  }, msUntilMidnight);
}

private loadFromStore(): void {
  const data = loadState<{
    wallets: Record<string, InternalWallet>;
    policies: Record<string, Policy>;
    dailyTransfers: Record<string, number>;
  }>('wallet-manager');
  // ...
}

private saveToStore(): void {
  saveState('wallet-manager', {
    wallets: Object.fromEntries(this.wallets),
    policies: Object.fromEntries(this.policies),
    dailyTransfers: Object.fromEntries(this.dailyTransfers),
  });
}
```

The `dailyTransfers.clear()` is never followed by `this.saveToStore()`, so the state is lost if the server crashes or restarts.

**Fix**: Add `this.saveToStore()` after reset (see Critical Issue 1.2 fix above).

---

## 3. MEDIUM PRIORITY ISSUES

### 3.1 🟡 Type Safety: Loose Intent Parameter Types

**Location**: [src/types/shared.ts](src/types/shared.ts), [src/integration/intentRouter.ts](src/integration/intentRouter.ts)  
**Severity**: MEDIUM  
**Risk**: Runtime type errors, unclear API contracts

**Problem**:
```typescript
export interface ExternalIntent {
  readonly type: SupportedIntentType;
  readonly params: Record<string, unknown>;  // ⚠️ Too loose
}
```

All intent types should have strongly typed params based on the intent type (discriminated union).

**Fix**:
```typescript
export type ExternalIntent = 
  | {
      readonly type: 'REQUEST_AIRDROP';
      readonly params: { amount: number };
    }
  | {
      readonly type: 'TRANSFER_SOL';
      readonly params: { recipient: string; amount: number; memo?: string };
    }
  | {
      readonly type: 'TRANSFER_TOKEN';
      readonly params: { 
        mint: string; 
        recipient: string; 
        amount: string; 
        memo?: string 
      };
    }
  | {
      readonly type: 'QUERY_BALANCE';
      readonly params: Record<string, never>;
    }
  | {
      readonly type: 'AUTONOMOUS';
      readonly params: { instruction: string; [key: string]: unknown };
    }
  | {
      readonly type: 'SERVICE_PAYMENT';
      readonly params: { serviceId: string; amount: number };
    };

// This ensures type safety:
const intent: ExternalIntent = {
  type: 'TRANSFER_SOL',
  params: { recipient: 'abc', amount: 1.5 }  // ✅ TypeScript knows params shape
};
```

---

### 3.2 🟡 Logging: Sensitive Data Could Be Leaked

**Location**: [src/integration/intentRouter.ts](src/integration/intentRouter.ts), [src/orchestrator/orchestrator.ts](src/orchestrator/orchestrator.ts)  
**Severity**: MEDIUM  
**Risk**: Private keys, amounts, addresses in logs

**Problem**:
```typescript
logger.info('BYOA intent executed', {
  intentId,
  agentId: agent.id,
  type: externalIntent.type,
  // ⚠️ But what if params contain sensitive data?
  params: externalIntent.params,
});
```

The `params` object could contain:
- Recipient addresses (privacy issue)
- Token amounts (financial info)
- Service IDs (potentially sensitive)

**Fix**:
```typescript
function sanitizeIntentParams(params: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (key === 'recipient' || key === 'to' || key === 'serviceId') {
      // Truncate addresses/IDs
      const str = String(value);
      sanitized[key] = str.length > 8 ? `${str.slice(0, 4)}...${str.slice(-4)}` : '***';
    } else if (key === 'amount' || key === 'memo') {
      // Redact amounts and memos
      sanitized[key] = '***';
    } else {
      sanitized[key] = '[present]';
    }
  }
  
  return sanitized;
}

logger.info('BYOA intent executed', {
  intentId,
  agentId: agent.id,
  type: externalIntent.type,
  params: sanitizeIntentParams(externalIntent.params),
});
```

---

### 3.3 🟡 Agent Registry: Missing Pagination for Many Agents

**Location**: [src/integration/agentRegistry.ts](src/integration/agentRegistry.ts)  
**Severity**: MEDIUM  
**Risk**: Memory exhaustion with many agents, slow API responses

**Problem**:
```typescript
// No pagination support
getAllAgents(): ExternalAgentRecord[] {
  return Array.from(this.agents.values());
}

// API endpoint loads all agents at once
app.get('/api/agents', asyncHandler(async (req: Request, res: Response) => {
  const agents = orchestrator.getAllAgents();  // Could be 10,000+ records
  // ...
  sendSuccess(res, enrichedAgents);
}));
```

**Fix**:
```typescript
interface PaginationParams {
  limit: number;  // Default 50, max 500
  offset: number; // Default 0
}

getAllAgents(params?: PaginationParams) {
  const { limit = 50, offset = 0 } = params ?? {};
  const normalizedLimit = Math.min(Math.max(limit, 1), 500);
  const agents = Array.from(this.agents.values());
  
  return {
    data: agents.slice(offset, offset + normalizedLimit),
    total: agents.length,
    offset,
    limit: normalizedLimit,
  };
}

app.get('/api/agents', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(500, parseInt(req.query['limit'] as string, 10) || 50));
  const offset = Math.max(0, parseInt(req.query['offset'] as string, 10) || 0);

  const result = orchestrator.getAllAgents({ limit, offset });
  
  sendSuccess(res, {
    agents: result.data,
    pagination: {
      limit: result.limit,
      offset: result.offset,
      total: result.total,
    },
  });
}));
```

---

### 3.4 🟡 Configuration: Mainnet Safety Check Can Be Bypassed

**Location**: [src/utils/config.ts](src/utils/config.ts#L50-L70)  
**Severity**: MEDIUM  
**Risk**: System deployed to mainnet accidentally

**Problem**:
```typescript
// Validate network constraints
if (result.data.SOLANA_NETWORK === 'mainnet-beta') {
  throw new Error(
    'This system is designed for devnet only. Mainnet is not supported for safety.'
  );
}
```

The enum includes 'mainnet-beta' but prevents its use. This is contradictory and confusing. Better to remove the option entirely.

**Fix**:
```typescript
const ConfigSchema = z.object({
  // ... other config ...
  
  // Remove mainnet-beta from enum - only devnet/testnet
  SOLANA_NETWORK: z.enum(['devnet', 'testnet']).default('devnet'),
  
  // ... rest
});

// Remove the explicit mainnet check since it's impossible now
// But add a warning for testnet
export function getConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
  }
  
  // Warn if using testnet
  if (result.data.SOLANA_NETWORK === 'testnet') {
    console.warn(
      '⚠ WARNING: Connected to Solana testnet. ' +
        'This is a real blockchain with real token costs. Verify before proceeding.'
    );
  }
  
  // ... rest of validation
}
```

---

## 4. LOW PRIORITY / RECOMMENDATIONS

### 4.1 Documentation Gaps

**Issue**: Several TODO comments in code indicate incomplete features:
- [src/agent/multi-tenant-wallet-manager.ts](src/agent/multi-tenant-wallet-manager.ts#L42): Phase 2 per-tenant encryption keys
- [src/integration/privy-integration.ts](src/integration/privy-integration.ts#L29): Phase 2 Privy SDK integration
- [src/integration/strategy-marketplace.ts](src/integration/strategy-marketplace.ts#L40): Phase 2 marketplace features

**Recommendation**: 
1. Move TODOs to GitHub Issues
2. Update ARCHITECTURE.md with Phase 2 features
3. Create ROADMAP.md for feature tracking

---

### 4.2 Test Coverage

**Issue**: Several critical paths lack test coverage:
- Daily reset logic
- Transaction builder edge cases
- Retry logic
- Error handling in orchestrator cycles

**Recommendation**: 
Run `npm test` to see current coverage and target >80% for:
- `src/wallet/wallet-manager.ts`
- `src/rpc/transaction-builder.ts`
- `src/integration/intentRouter.ts`
- `src/orchestrator/orchestrator.ts`

---

### 4.3 Performance: Inefficient Balance Enrichment

**Issue**: [src/server.ts](src/server.ts#L400-L430) uses `Promise.allSettled()` to enrich agents with balances:
```typescript
const enrichedAgents = await Promise.allSettled(
  agents.map(async (agent) => {
    const balanceResult = await client.getBalance(...);
    // ... 
  })
);
```

With 100+ agents, this makes 100+ sequential RPC calls. Better to batch or use a separate cache.

**Recommendation**:
1. Implement a balance cache with TTL (5 seconds)
2. Return cached balances in `/api/agents` (list endpoint)
3. Only fetch fresh balances in `/api/agents/:id` (detail endpoint)

---

## 5. SECURITY AUDIT CHECKLIST

### ✅ Passed
- [x] Private keys encrypted with AES-256-GCM
- [x] Encryption key derivation uses scrypt (secure)
- [x] Key material cleared from memory after signing
- [x] Bearer token validation on BYOA endpoints
- [x] Rate limiting implemented (per IP and per agent)
- [x] CORS origin validation checks

### ⚠️ Needs Attention
- [ ] Add request/response size limits (done: `REQUEST_BODY_SIZE_LIMIT`)
- [ ] Add request timeout limits
- [ ] Add operation cost tracking (prevent RPC spam)
- [ ] Audit prototype pollution fix (M-1 FIX) - appears correct
- [ ] Add integrity checks for persisted state files
- [ ] Implement key rotation policy documentation

### 📋 Compliance Notes
- Mainnet access is properly blocked at config level
- Devnet-only design is enforced
- No SQL injection risk (no SQL used)
- No XXE risk (no XML parsing)
- Reasonable CSRF protection via CORS

---

## 6. RECOMMENDED ACTION PLAN

### Phase 1: CRITICAL FIXES (Target: This Week)
1. **Transaction builder**: Add proper null/type checks for blockhash
2. **Wallet daily reset**: Fix race condition and persistence
3. **Intent signatures**: Validate transactions before submission

### Phase 2: HIGH PRIORITY (Target: Next 2 Weeks)
1. Fix distributor agent address validation
2. Add error boundaries in orchestrator cycles
3. Implement retry logic in Solana client
4. Add null checks in API wallet operations
5. Persist state on daily reset

### Phase 3: MEDIUM PRIORITY (Target: Month 1)
1. Strong-type intent parameters
2. Redact sensitive data from logs
3. Add pagination to agent endpoints
4. Simplify mainnet configuration

### Phase 4: TESTING & POLISH (Target: Month 2)
1. Increase test coverage to >80%
2. Performance profiling and optimization
3. Documentation audit and updates
4. Security penetration testing

---

## 7. FILES REQUIRING CHANGES

| File | Priority | Changes Needed |
|------|----------|---|
| [src/rpc/transaction-builder.ts](src/rpc/transaction-builder.ts) | 🔴 CRITICAL | Blockhash null checks, error handling |
| [src/wallet/wallet-manager.ts](src/wallet/wallet-manager.ts) | 🔴 CRITICAL | Daily reset race condition, persistence |
| [src/integration/intentRouter.ts](src/integration/intentRouter.ts) | 🔴 CRITICAL | Signature validation, type safety |
| [src/agent/distributor-agent.ts](src/agent/distributor-agent.ts) | 🟠 HIGH | Address validation in think() |
| [src/orchestrator/orchestrator.ts](src/orchestrator/orchestrator.ts) | 🟠 HIGH | Error boundaries, finally cleanup |
| [src/rpc/solana-client.ts](src/rpc/solana-client.ts) | 🟠 HIGH | Retry logic for all blockchain calls |
| [src/server.ts](src/server.ts) | 🟠 HIGH | Null checks, type guards |
| [src/utils/config.ts](src/utils/config.ts) | 🟡 MEDIUM | Remove mainnet enum option |
| [src/types/shared.ts](src/types/shared.ts) | 🟡 MEDIUM | Discriminated union for intents |

---

## 8. CONCLUSION

The Agentic Wallet system has a **strong architectural foundation** but needs focused work on **error handling, validation, and type safety** before production deployment. The 3 critical issues are fixable in 1-2 days; the high-priority issues require ~1 week of work.

**Production Readiness**: 🟡 **60-70%**  
- ✅ Architecture is sound
- ✅ Security practices are good
- ⚠️ Error handling needs strengthening  
- ⚠️ Edge cases need coverage  
- ❌ Not ready for mainnet

**Recommendation**: Address all critical and high-priority issues before launching to testnet. Spend 2 weeks on this audit backlog, then perform security review and load testing.

---

**Next Steps**: 
1. Review this report in team
2. Create GitHub issues from each section
3. Assign to dev team with priority labels
4. Schedule follow-up audit after fixes

