# Quick Action Plan - Audit Fixes

## 🔴 CRITICAL (Do First - 1-2 Days)

### Issue #1: Transaction Builder Blockhash Validation
**File**: `src/rpc/transaction-builder.ts`  
**Lines**: 78-120, 151-170, 50-70, 233-250  
**Effort**: 2-3 hours

**What's Wrong**:
```
buildSolTransfer() → uses blockhashResult.value without null check
buildTokenTransfer() → same issue
buildMemoTransaction() → same issue
estimateFee() → same issue
```

**Quick Fix**:
1. After `if (!blockhashResult.ok)` check
2. Add: `if (!blockhash)` guard
3. Add proper error message for null blockhash
4. Apply to all 4 functions

---

### Issue #2: Wallet Daily Reset Race Condition
**File**: `src/wallet/wallet-manager.ts`  
**Lines**: 37-60  
**Effort**: 1-2 hours

**What's Wrong**:
- `dailyTransfers.clear()` has no persistence
- Early returns don't reset `cycleInProgress`  
- No recovery after restart
- Multiple instances could spawn timers

**Quick Fix**:
1. Add `this.dailyResetTimer` field to track timer
2. Add `saveToStore()` call after `clear()`
3. Cancel timer on early returns
4. Add `destroy()` method for shutdown cleanup

---

### Issue #3: Intent Router - Transaction Signature Validation
**File**: `src/integration/intentRouter.ts`  
**Lines**: 250-350 (executeTransferSol + related)  
**Effort**: 2-3 hours

**What's Wrong**:
- No check if transaction was actually signed
- No validation of required signers
- No error if signature is missing

**Quick Fix**:
1. After `signTransaction()` succeeds
2. Check `signedTx.signatures` array is not empty
3. Verify fee payer is in signatures array
4. Throw error if validation fails

---

## 🟠 HIGH (Do Next - 1 Week)

### Issue #4: Distributor Agent Address Validation  
**File**: `src/agent/distributor-agent.ts`  
**Lines**: 85-95, 135-145 (think + addRecipient)  
**Effort**: 2 hours

**Fix Checklist**:
- [ ] Validate address in `addRecipient()` 
- [ ] Validate address before creating intent in `think()`
- [ ] Use `new PublicKey()` to validate
- [ ] Catch and log validation errors

---

### Issue #5: Orchestrator Agent Cycle Error Handling
**File**: `src/orchestrator/orchestrator.ts`  
**Lines**: 180-230 (executeAgentCycle)  
**Effort**: 2-3 hours

**Fix Checklist**:
- [ ] Wrap `agent.think()` in try-catch
- [ ] Always reset `cycleInProgress` in finally
- [ ] Catch errors at intent execution level
- [ ] Call `agent.recordAction(false)` on error
- [ ] Log full error stack traces

---

### Issue #6: Solana Client Retry Logic
**File**: `src/rpc/solana-client.ts`  
**Lines**: 50-150 (getBalance, getTokenBalances, etc.)  
**Effort**: 3-4 hours

**Fix Checklist**:
- [ ] Create `withRetry()` helper method
- [ ] Implement exponential backoff (100ms, 200ms, 400ms)
- [ ] Apply to `getBalance()`
- [ ] Apply to `getTokenBalances()`
- [ ] Apply to `getRecentBlockhash()`
- [ ] Apply to `sendTransaction()`
- [ ] Apply to all RPC calls

---

### Issue #7: API Server Wallet Operation Type Guards
**File**: `src/server.ts`  
**Lines**: 400-450 (GET /api/agents/:id)  
**Effort**: 1-2 hours

**Fix Checklist**:
- [ ] Check `walletResult.value.publicKey` exists before use
- [ ] Use type guard: `if (!wallet.publicKey || typeof wallet.publicKey !== 'string')`
- [ ] Wrap `new PublicKey()` in try-catch
- [ ] Check `balanceResult.value.sol` exists before use
- [ ] Log failures instead of crashing

---

## 🟡 MEDIUM (Nice to Have - 1-2 Weeks)

### Issue #8: Intent Parameter Type Safety
**File**: `src/types/shared.ts`, `src/integration/intentRouter.ts`  
**Effort**: 2-3 hours

**Fix**: Discriminated union type for ExternalIntent with proper param typing

---

### Issue #9: Sensitive Data Logging
**File**: `src/integration/intentRouter.ts`, `src/orchestrator/orchestrator.ts`  
**Effort**: 1 hour

**Fix**: Implement `sanitizeIntentParams()` helper to redact addresses/amounts

---

### Issue #10: Agent Endpoint Pagination
**File**: `src/server.ts` (GET /api/agents)  
**Effort**: 1-2 hours

**Fix**: Add `limit` and `offset` query params, default 50, max 500

---

### Issue #11: Configuration Mainnet Safety
**File**: `src/utils/config.ts`  
**Effort**: 30 minutes

**Fix**: Remove 'mainnet-beta' from enum, only support devnet/testnet

---

## Tracking Progress

### Week 1 (Critical)
- [ ] Issue #1: Transaction Builder
- [ ] Issue #2: Wallet Reset
- [ ] Issue #3: Signature Validation

### Week 2 (High Priority)  
- [ ] Issue #4: Distributor Validation
- [ ] Issue #5: Orchestrator Error Handling
- [ ] Issue #6: Solana Client Retries
- [ ] Issue #7: API Type Guards

### Week 3+ (Medium Priority)
- [ ] Issue #8: Type Safety
- [ ] Issue #9: Logging
- [ ] Issue #10: Pagination
- [ ] Issue #11: Config Safety

## Testing After Each Fix

```bash
# Run tests
npm test

# Run linter
npm run lint

# Build to catch TypeScript errors
npm run build

# Manual testing for issue-specific fixes:
- Test transaction building with bad RPC
- Test wallet with daily reset boundary
- Test agent execution error recovery
- Test API endpoints with missing data
```

## Verification Checklist

Before considering an issue "done":

- [ ] Code compiles without errors (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Specific issue is addressed (not just partially)
- [ ] Error messages are clear and helpful
- [ ] Related tests have been added or updated
- [ ] Code review by another developer (if available)

## Notes

1. **Dependencies**: None of these fixes require new dependencies
2. **Backward Compat**: All fixes are backward compatible
3. **Rollout**: Can be deployed incrementally (critical issues first)
4. **Documentation**: Update error handling guide after fixes

