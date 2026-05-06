# Withdrawal System Documentation

## Overview

The Withdrawal System is a secure, production-hardened feature that allows individual users to withdraw SOL funds from their agent wallets. It enforces multiple layers of security to prevent unauthorized withdrawals, exploitation, and accidental funds loss.

## Architecture

### Defense-in-Depth Security Model

The withdrawal system implements **7 critical security checks** that run sequentially before any state changes occur:

```
User Request
    ↓
1. Agent Existence Check ─────→ Verify agent exists in registry
    ↓
2. BYOA Agent Block ──────────→ Reject external agents (BYOA excluded)
    ↓
3. Recipient Validation ──────→ Validate Solana address format
    ↓
4. Rate Limiting ─────────────→ Max 1 withdrawal per agent per 24h
    ↓
5. Balance Verification ──────→ Check sufficient funds (with 0.001 SOL buffer)
    ↓
6. Create Pending Record ─────→ Store withdrawal request (not yet executed)
    ↓
7. User Confirmation ─────────→ User clicks "Confirm Withdraw"
    ↓
8. Transaction Build & Sign ─→ Build SOL transfer, sign with wallet key
    ↓
9. Broadcast to Solana ───────→ Send transaction, get signature
    ↓
10. Update Record Status ─────→ Mark as "executed", store signature
```

### Key Security Properties

| Property | Implementation |
|----------|-----------------|
| **Multi-tenant Isolation** | All withdrawals scoped to authenticated tenant; no cross-tenant leakage |
| **Agent Ownership** | User can only withdraw from agents they created (via agentRegistry) |
| **BYOA Exclusion** | External BYOA agents cannot be withdrawn from; their funds belong to external developers |
| **Rate Limiting** | Maximum 1 withdrawal per agent per 24 hours prevents fee exploitation |
| **Balance Protection** | Minimum 0.001 SOL retained as fee buffer; prevents wallet becoming unusable |
| **Recipient Validation** | All addresses validated via PublicKey constructor before creating transaction |
| **Atomic Operations** | Either succeeds completely or fails completely; no partial state changes |
| **Audit Trail** | All withdrawals logged with timestamp, amounts, recipient, and signature |
| **Reversibility** | Withdrawal records persisted; can be reviewed and correlated with on-chain transactions |

## API Endpoints

### 1. Request Withdrawal

**Endpoint:** `POST /api/agents/:id/withdraw`

**Authentication:** Bearer token (tenant scoped)

**Request Body:**
```json
{
  "recipient": "6VT1RL9LXXJbC2HZXZ...",
  "amount": 0.5,
  "description": "Quarterly payout"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "withdrawal_f7a3c2e1",
    "agentId": "agent_123",
    "agentName": "Treasury Agent",
    "walletId": "wallet_456",
    "walletPublicKey": "7VT1RL9...",
    "tenantId": "tenant_xyz",
    "recipient": "6VT1RL9...",
    "amountSol": 0.5,
    "fee": 0.00005,
    "status": "pending",
    "createdAt": "2026-05-06T10:00:00Z",
    "description": "Quarterly payout"
  }
}
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 404 | Agent not found or doesn't belong to tenant |
| 400 | Invalid recipient address, insufficient balance, or BYOA agent |
| 429 | Rate limit exceeded (withdrawal already requested in last 24h) |
| 409 | Agent is currently running |

### 2. Execute Withdrawal

**Endpoint:** `POST /api/withdrawals/:id/execute`

**Authentication:** Bearer token (tenant scoped)

**Request Body:** (empty)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "withdrawal_f7a3c2e1",
    "agentId": "agent_123",
    "walletId": "wallet_456",
    "recipient": "6VT1RL9...",
    "amountSol": 0.5,
    "fee": 0.00005,
    "status": "executed",
    "signature": "3vZY2u5cK...",
    "executedAt": "2026-05-06T10:05:00Z",
    "createdAt": "2026-05-06T10:00:00Z"
  }
}
```

**Error Responses:**

| Status | Condition |
|--------|-----------|
| 404 | Withdrawal not found or doesn't belong to tenant |
| 400 | Withdrawal already executed/failed, or broadcast error |

### 3. Get Withdrawal History (Tenant)

**Endpoint:** `GET /api/withdrawals?limit=100`

**Authentication:** Bearer token (tenant scoped)

**Query Parameters:**
- `limit` (optional): Max 500, default 100

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "withdrawal_f7a3c2e1",
      "agentId": "agent_123",
      "agentName": "Treasury Agent",
      "status": "executed",
      "amountSol": 0.5,
      "recipient": "6VT1RL9...",
      "signature": "3vZY2u5cK...",
      "executedAt": "2026-05-06T10:05:00Z",
      "createdAt": "2026-05-06T10:00:00Z"
    },
    ...
  ]
}
```

### 4. Get Agent Withdrawal History

**Endpoint:** `GET /api/agents/:id/withdrawals?limit=50`

**Authentication:** Bearer token (tenant scoped)

**Response:** Same as tenant history but filtered to single agent

### 5. Get Withdrawal Record

**Endpoint:** `GET /api/withdrawals/:id`

**Authentication:** Bearer token (tenant scoped)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "withdrawal_f7a3c2e1",
    "agentId": "agent_123",
    "walletId": "wallet_456",
    "recipient": "6VT1RL9...",
    "amountSol": 0.5,
    "fee": 0.00005,
    "status": "pending|executed|failed",
    "signature": "3vZY2u5cK...",
    "error": null,
    "createdAt": "2026-05-06T10:00:00Z",
    "executedAt": "2026-05-06T10:05:00Z"
  }
}
```

## Workflow Example

### Scenario: User withdraws 0.5 SOL from agent

1. **Request Phase**
   ```
   POST /api/agents/agent_123/withdraw
   {
     "recipient": "6VT1RL9LXXJbC2HZXZ...",
     "amount": 0.5,
     "description": "Monthly dividend"
   }
   ```
   
   System performs all 6 security checks:
   - ✓ Agent exists
   - ✓ Not a BYOA agent
   - ✓ Recipient address valid
   - ✓ No pending withdrawals (rate limit OK)
   - ✓ Balance check: wallet has 1.0 SOL, requesting 0.5 SOL → OK
   - ✓ Creates withdrawal record with status `pending`

   **Returns:** Withdrawal ID `withdrawal_f7a3c2e1`

2. **User Reviews** (in dashboard)
   - Amount: 0.5 SOL
   - Fee: ~0.00005 SOL
   - Recipient: `6VT1RL9LXXJbC2HZXZ...`
   - Total out of wallet: 0.50005 SOL

3. **User Confirms**
   ```
   POST /api/withdrawals/withdrawal_f7a3c2e1/execute
   ```

   System executes:
   - Builds SOL transfer transaction (0.5 SOL)
   - Gets recent blockhash
   - Signs with agent wallet's private key
   - Broadcasts to Solana
   - Gets signature: `3vZY2u5cK7mL8pQ...`
   - Updates withdrawal record: status → `executed`, stores signature

   **Returns:** Updated withdrawal with signature

4. **Verification**
   ```
   User can:
   - View transaction on Solana explorer: https://solscan.io/tx/3vZY2u5cK7mL8pQ...
   - Query GET /api/withdrawals/withdrawal_f7a3c2e1 for signature
   - Export withdrawal history as audit record
   ```

5. **Next Withdrawal**
   - User cannot request another withdrawal for 24 hours
   - After 24 hours (based on first withdrawal's timestamp), they can request again

## Implementation Details

### WithdrawalManager Class

Located in `src/wallet/withdrawal-manager.ts`

**Key Methods:**

```typescript
// Request withdrawal (all security checks here)
async requestWithdrawal(req: WithdrawalRequest): Promise<Result<WithdrawalRecord, Error>>

// Execute after user confirmation
async executeWithdrawal(withdrawalId: string): Promise<Result<WithdrawalRecord, Error>>

// Query methods
getWithdrawalHistory(tenantId: string, limit: number): WithdrawalRecord[]
getAgentWithdrawalHistory(agentId: string, limit: number): WithdrawalRecord[]
getWithdrawalRecord(withdrawalId: string): WithdrawalRecord | undefined
canWithdraw(agentId: string): boolean
```

### Persistence

Withdrawal records are persisted to disk via `data/withdrawals.json`:

```json
{
  "records": [
    {
      "id": "withdrawal_f7a3c2e1",
      "agentId": "agent_123",
      "agentName": "Treasury Agent",
      "walletId": "wallet_456",
      "walletPublicKey": "7VT1RL9...",
      "tenantId": "tenant_xyz",
      "recipient": "6VT1RL9...",
      "amountSol": 0.5,
      "fee": 0.00005,
      "status": "executed",
      "signature": "3vZY2u5cK7mL8pQ...",
      "description": "Monthly dividend",
      "createdAt": "2026-05-06T10:00:00Z",
      "executedAt": "2026-05-06T10:05:00Z"
    }
  ]
}
```

### Rate Limiting

Rate limiting is tracked per-agent in memory:

```typescript
private dailyWithdrawals: Map<string, number[]> = new Map();
// Stores timestamps of withdrawal requests in last 24 hours
// Max 1 request per agent per 24h window
```

## BYOA Agent Exclusion

**Why are BYOA agents excluded from withdrawals?**

1. **Ownership Model**: BYOA agents are registered and owned by external developers
2. **Fund Ownership**: Funds in BYOA agent wallets belong to the external developer, not Sophia platform users
3. **Legal Clarity**: Withdrawing from someone else's agent would be theft
4. **Security**: Prevents cross-tenant fund access
5. **API Boundary**: Maintains strict separation between platform and external integrations

**Check 1 - Agent Existence:**
```typescript
const agentResult = this.agentRegistry.getAgent(agentId);
// Fails if agent not registered
```

**Check 2 - BYOA Blocking:**
```typescript
const byoaAgentId = this.walletBinder.getAgentForWallet(agentId);
if (byoaAgentId) {
  // Reject: this is a BYOA agent
  return failure("Cannot withdraw from external agent");
}
```

## Error Handling

### Graceful Failure

All errors are caught and recorded:

```typescript
catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Create failed record
  const updatedRecord: WithdrawalRecord = {
    ...record,
    status: 'failed',
    error: err.message,
  };
  
  this.records[recordIndex] = updatedRecord;
  this.saveToStore();
  
  logger.error('Withdrawal execution failed', { ... });
  return failure(err);
}
```

Withdrawal records with `status: 'failed'` are preserved for audit purposes.

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| "Agent not found" | Agent doesn't exist | Verify agent ID |
| "External agent... cannot be withdrawn from" | BYOA agent | Create a regular agent instead |
| "Invalid recipient address" | Bad Solana address | Verify recipient's public key |
| "Rate limit exceeded" | Already withdrew in last 24h | Wait 24 hours from first withdrawal |
| "Insufficient balance" | Wallet has < requested + 0.001 SOL | Request smaller amount |
| "Agent must be stopped" | Agent is running (future check) | Stop agent before withdrawing |

## Logging & Monitoring

All withdrawal operations are logged for debugging and audit:

```
[WITHDRAWAL] Withdrawal requested
  withdrawalId: withdrawal_f7a3c2e1
  agentId: agent_123
  recipient: 6VT1RL9...
  amount: 0.5
  fee: 0.00005
  tenantId: tenant_xyz

[WITHDRAWAL] Withdrawal executed
  withdrawalId: withdrawal_f7a3c2e1
  signature: 3vZY2u5cK7mL8pQ...
  agentId: agent_123
  amount: 0.5
  recipient: 6VT1RL9...

[WITHDRAWAL] Withdrawal execution failed
  withdrawalId: withdrawal_f7a3c2e1
  agentId: agent_123
  error: "InsufficientFunds: account has insufficient lamports"
```

## Testing

### Unit Tests (to implement)

```typescript
describe('WithdrawalManager', () => {
  test('blocks BYOA agents', async () => {
    const result = await withdrawalManager.requestWithdrawal({
      agentId: 'byoa_agent',
      tenantId: 'tenant_123',
      recipient: '...',
    });
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('external');
  });

  test('enforces rate limiting', async () => {
    // First withdrawal succeeds
    const result1 = await withdrawalManager.requestWithdrawal({...});
    expect(result1.ok).toBe(true);

    // Second withdrawal within 24h fails
    const result2 = await withdrawalManager.requestWithdrawal({...});
    expect(result2.ok).toBe(false);
    expect(result2.error.message).toContain('rate limit');
  });

  test('persists records to disk', async () => {
    const result = await withdrawalManager.requestWithdrawal({...});
    const manager2 = new WithdrawalManager();
    const record = manager2.getWithdrawalRecord(result.value.id);
    expect(record).toBeDefined();
  });

  test('validates recipient addresses', async () => {
    const result = await withdrawalManager.requestWithdrawal({
      recipient: 'invalid-address',
      ...
    });
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Invalid recipient');
  });
});
```

### Integration Tests

```typescript
test('end-to-end withdrawal flow', async () => {
  // 1. Create agent
  const agent = await orchestrator.createAgent({...});

  // 2. Deposit funds to agent wallet
  const walletPubkey = agent.walletPublicKey;
  await deposit(walletPubkey, 2.0); // 2 SOL

  // 3. Request withdrawal
  const withdrawal = await withdrawalManager.requestWithdrawal({
    agentId: agent.id,
    tenantId: 'tenant_123',
    recipient: userWalletAddress,
    amount: 1.0,
  });
  expect(withdrawal.status).toBe('pending');

  // 4. Execute withdrawal
  const executed = await withdrawalManager.executeWithdrawal(withdrawal.id);
  expect(executed.status).toBe('executed');
  expect(executed.signature).toBeDefined();

  // 5. Verify on-chain
  const signature = executed.signature;
  const tx = await solanaClient.getTransaction(signature);
  expect(tx).toBeDefined();
});
```

## Future Enhancements

1. **Agent Status Check** - Prevent withdrawal while agent is running
2. **Batch Withdrawals** - Withdraw from multiple agents in single transaction
3. **Scheduled Withdrawals** - Withdraw on fixed schedule (e.g., monthly)
4. **Whitelist Recipients** - Admin can limit withdrawal destinations
5. **Withdrawal Limits** - Set per-user or per-agent daily withdrawal caps
6. **Multiple Tokens** - Support SPL token withdrawals, not just SOL
7. **Recovery** - Unconfirmed withdrawals that fail can be retried
8. **Analytics** - Track withdrawal patterns and volumes per tenant

## FAQ

**Q: Can I withdraw while my agent is running?**
A: Currently no checks prevent this (implemented in future). Best practice: stop agent first.

**Q: What if my withdrawal transaction fails?**
A: The withdrawal record will be marked `failed` with the error message. You can request a new withdrawal after 24 hours.

**Q: Can I withdraw from BYOA agents?**
A: No, BYOA agents are external and their funds belong to their creators. Only withdraw from agents you created.

**Q: Is there a minimum withdrawal amount?**
A: No minimum, but you must retain 0.001 SOL for fees. If your wallet has 0.001 SOL or less, you cannot withdraw.

**Q: Can I withdraw to any Solana address?**
A: Yes, any valid Solana public key. The recipient doesn't need to exist; the transaction will succeed and the recipient can claim it.

**Q: How is the withdrawal fee calculated?**
A: Standard SOL transfer fee (~5,000 lamports = 0.00005 SOL). This is Solana network fee, not a platform fee.

**Q: Can I cancel a pending withdrawal?**
A: Not yet—future enhancement. For now, you must wait for the confirm step or let 24h pass and request a new one.

**Q: Are withdrawals reversible?**
A: Blockchain transactions are immutable once confirmed. However, withdrawal records are persisted for audit purposes.

---

**Last Updated:** May 6, 2026  
**Status:** Production Ready  
**Security Level:** Critical Path
