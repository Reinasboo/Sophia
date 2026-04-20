# Service Payment Integration Guide

## Overview

The Agentic Wallet now supports **x402 (HTTP 402 Payment Required)** and **MPP (Micropayment Protocol)** for implementing pay-per-use service models. This enables:

- **Per-service spend caps** — Limit maximum amount per transaction
- **Daily budgets** — Control total daily spending by service
- **Cooldown periods** — Rate-limit service calls
- **Program allowlists/blocklists** — Security controls
- **Replay attack prevention** — Nonce-based deduplication

## Architecture

### Components

```
Service Payment Flow:
┌─────────────────┐
│ External Agent  │
│   (BYOA)        │
└────────┬────────┘
         │
         ├─ SERVICE_PAYMENT intent
         │
    ┌────▼─────────────────────────┐
    │  Intent Router               │
    │  (executeServicePayment)     │
    └────┬──────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Service Policy Manager (Validation)       │
    │  • validateServicePayment()                │
    │    - Check cap per transaction             │
    │    - Check daily budget                    │
    │    - Check cooldown                        │
    │    - Check nonce (replay prevention)       │
    │    - Check program allowlist/blocklist     │
    └────┬───────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ x402 / MPP Handlers                      │
    │  • X402Handler (HTTP 402 token gen)      │
    │  • MPPHandler (Micropayment messaging)   │
    └────┬───────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Transaction Builder                       │
    │  • Sign transfer with memo tag             │
    │  • Include service metadata                │
    └────┬───────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ RPC / Solana Blockchain                   │
    │  • Send + confirm transaction              │
    └────┬───────────────────────────────────────┘
         │
    ┌────▼──────────────────────────────────────┐
    │ Service Policy Manager (Recording)        │
    │  • recordServicePayment()                  │
    │    - Increment daily spend                 │
    │    - Record nonce (replay prevention)      │
    │    - Update lastCallAt (cooldown)          │
    └────────────────────────────────────────────┘
```

## Endpoints

All endpoints use REST JSON with service policy manager singleton.

### Service Policy Management

#### 1. Register Service Policy (POST)
**Endpoint:** `POST /api/service-policies`

**Description:** Register a new service policy for spend control.

**Request Body:**
```json
{
  "serviceId": "inference-service",
  "capPerTransaction": 100_000,
  "dailyBudgetAmount": 500_000,
  "cooldownSeconds": 30,
  "allowedPrograms": [],
  "blockedPrograms": []
}
```

**Response (201):**
```json
{
  "status": "success",
  "policy": {
    "serviceId": "inference-service",
    "capPerTransaction": 100_000,
    "dailyBudgetAmount": 500_000,
    "cooldownSeconds": 30,
    "allowedPrograms": [],
    "blockedPrograms": []
  }
}
```

**Error Cases:**
- `400` — Invalid serviceId, negative caps, invalid cooldown
- `409` — Policy already exists for serviceId

---

#### 2. Get Service Policy (GET)
**Endpoint:** `GET /api/service-policies/:serviceId`

**Description:** Retrieve policy configuration for a service.

**Response (200):**
```json
{
  "status": "success",
  "policy": {
    "serviceId": "inference-service",
    "capPerTransaction": 100_000,
    "dailyBudgetAmount": 500_000,
    "cooldownSeconds": 30,
    "allowedPrograms": [],
    "blockedPrograms": []
  }
}
```

**Error Cases:**
- `404` — Service policy not found

---

#### 3. Update Service Policy (PATCH)
**Endpoint:** `PATCH /api/service-policies/:serviceId`

**Description:** Update selected policy fields.

**Request Body (optional fields):**
```json
{
  "capPerTransaction": 200_000,
  "dailyBudgetAmount": 1_000_000,
  "cooldownSeconds": 60,
  "allowedPrograms": ["11111111111111111111111111111111"],
  "blockedPrograms": []
}
```

**Response (200):**
```json
{
  "status": "success",
  "policy": {
    "serviceId": "inference-service",
    "capPerTransaction": 200_000,
    "dailyBudgetAmount": 1_000_000,
    "cooldownSeconds": 60,
    "allowedPrograms": ["11111111111111111111111111111111"],
    "blockedPrograms": []
  }
}
```

**Error Cases:**
- `400` — Invalid update values
- `404` — Service policy not found

---

#### 4. List All Policies (GET)
**Endpoint:** `GET /api/service-policies`

**Description:** List all registered service policies (admin endpoint).

**Response (200):**
```json
{
  "status": "success",
  "count": 3,
  "policies": [
    {
      "serviceId": "inference-service",
      "capPerTransaction": 100_000,
      "dailyBudgetAmount": 500_000,
      "cooldownSeconds": 30,
      "allowedPrograms": [],
      "blockedPrograms": []
    },
    {
      "serviceId": "translation-service",
      "capPerTransaction": 250_000,
      "dailyBudgetAmount": 1_000_000,
      "cooldownSeconds": 15,
      "allowedPrograms": [],
      "blockedPrograms": []
    }
  ]
}
```

---

### Usage Tracking

#### 5. Get Usage Record (GET)
**Endpoint:** `GET /api/service-policies/:serviceId/usage/:walletId`

**Description:** View current usage for wallet + service pair.

**Parameters:**
- `serviceId` — Service identifier
- `walletId` — Wallet public key (base58)

**Response (200):**
```json
{
  "status": "success",
  "serviceId": "inference-service",
  "walletId": "EPjFWaJy47DDaunGyv5QSN34cp1ADNYWNtPTPYGm7b7",
  "usage": {
    "serviceId": "inference-service",
    "walletId": "EPjFWaJy47DDaunGyv5QSN34cp1ADNYWNtPTPYGm7b7",
    "totalSpentToday": 300_000,
    "callCountToday": 5,
    "lastCallAt": "2026-01-20T15:30:45.123Z",
    "dailyResetAt": "2026-01-21T00:00:00.000Z",
    "remainingBudget": 200_000,
    "cooldownRemaining": 0.25
  }
}
```

**Fields:**
- `totalSpentToday` — Lamports spent today
- `callCountToday` — Number of calls today
- `lastCallAt` — Timestamp of last payment
- `remainingBudget` — Remaining daily budget (derived)
- `cooldownRemaining` — Seconds until next call allowed (derived)

**Error Cases:**
- `400` — Invalid wallet ID format
- `404` — Service policy or usage record not found

---

#### 6. Reset Usage (DELETE)
**Endpoint:** `DELETE /api/service-policies/:serviceId/usage/:walletId`

**Description:** Reset usage record (admin operation, e.g., for testing or reconciliation).

**Parameters:**
- `serviceId` — Service identifier
- `walletId` — Wallet public key (base58)

**Response (200):**
```json
{
  "status": "success",
  "message": "Usage record reset"
}
```

**Error Cases:**
- `400` — Invalid wallet ID format
- `404` — Service policy not found

---

## SERVICE_PAYMENT Intent Type

### Overview

The `SERVICE_PAYMENT` intent enables agents to execute service payments with automatic policy validation.

### Intent Structure

```typescript
interface ServicePaymentIntent extends BaseIntent {
  type: 'SERVICE_PAYMENT';
  serviceId: string;           // Service identifier
  amount: number;              // Lamports to transfer
  recipient: string;           // Recipient public key (base58)
  description?: string;        // Payment description
}
```

### Execution Flow

1. **Intent Routing** — Router receives SERVICE_PAYMENT intent
2. **Policy Validation** — ServicePolicyManager checks:
   - Service policy exists
   - Amount ≤ cap per transaction
   - Remaining daily budget sufficient
   - Cooldown elapsed since last call
   - Nonce unique (replay prevention)
   - Program allowlist/blocklist (if applicable)
3. **Transaction Building** — Create Solana transfer with memo
4. **Signing** — Sign with wallet keypair
5. **Simulation** — Dry-run transaction
6. **Sending** — Submit to blockchain
7. **Recording** — Update usage, record nonce
8. **Audit** — Emit event with transaction details

### Error Handling

Policy validation failures return descriptive errors:

```json
{
  "error": "Amount 150000 exceeds cap per transaction (100000)"
}
```

Common errors:
- `"Amount exceeds cap per transaction"`
- `"Would exceed daily budget"`
- `"Cooldown not elapsed. Wait Xs"`
- `"Intent ID already used (replay attack detected)"`
- `"Program is not in allowed list"`
- `"Program is blocked"`

## x402 Protocol (HTTP 402 Payment Required)

### X402Handler

**Purpose:** Generate and verify HTTP 402 payment descriptors for service access tokens.

### Payment Descriptor

```typescript
interface X402PaymentDescriptor {
  paymentAddress: string;  // Service public key
  amount: number;          // Lamports required
  requestId: string;       // Unique request ID
  expiresAt: Date;         // Descriptor expiration
  accessToken?: string;    // Optional access token
}
```

### Usage Example

```typescript
const x402Handler = getX402Handler(servicePublicKey);

// 1. Generate payment descriptor
const descriptor = x402Handler.generatePaymentDescriptor(
  1_000_000,  // Amount in lamports
  300         // Validity duration in seconds
);

// 2. Encode as HTTP header
const header = X402Handler.encodeX402Header(descriptor);
// Result: base64-encoded JSON payload

// 3. Send in HTTP response
res.set('X-Payment-Descriptor', header);
res.status(402).json({ error: 'Payment required' });

// 4. Client verifies descriptor
const parseResult = X402Handler.parseX402Header(clientHeader);
const verified = x402Handler.verifyDescriptor(parseResult.value);
```

## MPP Protocol (Micropayment Protocol)

### MPPHandler

**Purpose:** Handle micropayment messaging with Ed25519 signatures and nonce-based replay prevention.

### Message Types

#### Payment Request
```typescript
{
  version: "1.0",
  messageType: "payment_request",
  serviceId: "inference-service",
  walletPublicKey: "...",
  amount: 100_000,
  nonce: "32-byte-hex-string",
  timestamp: Date,
  signature?: "hex-string"
}
```

#### Payment Proof
```typescript
{
  version: "1.0",
  messageType: "payment_proof",
  serviceId: "inference-service",
  walletPublicKey: "...",
  amount: 100_000,
  nonce: "proof-nonce-including-tx-sig",
  timestamp: Date,
  signature?: "hex-string"
}
```

### Usage Example

```typescript
const walletKeypair = Keypair.generate();
const mppHandler = getMPPHandler(
  'inference-service',
  walletKeypair.publicKey.toBase58(),
  walletKeypair
);

// 1. Create payment request
const request = mppHandler.createPaymentRequest(
  1_000_000,
  'AI inference call'
);

// 2. Sign request
const signResult = mppHandler.signMessage(request);
const signedRequest = signResult.value;

// 3. Send to service (serialize via toJSON)
const requestJson = mppHandler.toJSON(signedRequest);

// 4. Service verifies request
const verifyResult = mppHandler.verifyPaymentRequest(request);
if (verifyResult.ok) {
  // Process payment
}

// 5. Create payment proof
const txSignature = '...'; // After transaction confirmation
const proof = mppHandler.createPaymentProof(
  txSignature,
  1_000_000,
  request.nonce
);
```

## Security Considerations

### Replay Attack Prevention

- **Nonce tracking:** Each payment records nonce in ServicePolicyManager
- **Per-service isolation:** Nonces tracked independently per service
- **Bounded memory:** LRU cache with 10k entry limit
- **Age-based pruning:** Stops accepting nonces older than 24 hours

### Program Allowlists/Blocklists

- **Allowlist:** If specified, only programs in list allowed
- **Blocklist:** Programs in list always blocked
- **SPL Token security:** Block token program if not needed
- **Custom program protection:** Restrict to known safe program IDs

### Daily Budget Resets

- **UTC midnight:** Automatic reset at 00:00:00 UTC
- **Per-wallet isolation:** Budgets tracked independently per wallet
- **Exact boundary:** Reset at midnight to second precision
- **Pre-calculation:** Next reset time pre-calculated in each usage record

### Transaction Memoing

Transactions include memo tag for audit trail:
```
AgenticWallet:service_payment:${serviceId}:${agentId}
```

This enables on-chain transaction history tracking and compliance.

## Configuration

### Environment Variables

```bash
# Solana RPC endpoint
SOLANA_RPC_URL=https://api.devnet.solana.com

# Service policy storage location
SERVICE_POLICY_STORE_PATH=./data/service-policies.json

# Optional: max nonces in memory
SERVICE_POLICY_MAX_NONCES=10000

# Optional: cooldown check mode strict|warning
SERVICE_POLICY_COOLDOWN_MODE=strict
```

### Programmatic Configuration

```typescript
// Register multiple policies at startup
const policies = [
  {
    serviceId: 'inference-service',
    capPerTransaction: 100_000,
    dailyBudgetAmount: 500_000,
    cooldownSeconds: 30,
    allowedPrograms: [],
    blockedPrograms: [],
  },
  {
    serviceId: 'translation-service',
    capPerTransaction: 250_000,
    dailyBudgetAmount: 1_000_000,
    cooldownSeconds: 15,
    allowedPrograms: [],
    blockedPrograms: [],
  },
];

const policyManager = getServicePolicyManager();
for (const policy of policies) {
  policyManager.registerServicePolicy(policy);
}
```

## Testing

### Run Test Suite

```bash
# All tests
npm test

# Service policy tests only
npm test service-policy.test

# x402/MPP protocol tests
npm test x402-mpp.test

# Integration tests
npm test service-payment-integration.test

# Watch mode
npm test -- --watch
```

### Test Coverage

- ✅ Service Policy Registration (3 cases)
- ✅ Per-Transaction Spend Caps (2 cases)
- ✅ Daily Budget Enforcement (3 cases)
- ✅ Cooldown Enforcement (2 cases)
- ✅ Replay Attack Prevention (1 case)
- ✅ Program Allowlist/Blocklist (1 case)
- ✅ Usage Record Management (2 cases)
- ✅ x402 Descriptor Generation & Verification (10 cases)
- ✅ MPP Message Signing & Verification (8 cases)
- ✅ SERVICE_PAYMENT Intent Execution (15+ cases)

## Compliance & Audit

### Compliance Features

- **SOC 2 Type II ready:** Comprehensive logging and state management
- **Audit trail:** All payments emit events with full context
- **State persistence:** Policies and usage persisted to storage
- **Transaction linking:** Memo tags for on-chain traceability

### Logging Example

```
[2026-01-20T15:30:45Z] DEBUG SERVICE_POLICY Service payment validated {
  walletId: "EPjFWaJy47DDaunGyv5QSN34cp1ADNYWNtPTPYGm7b7",
  serviceId: "inference-service",
  amount: 100_000
}

[2026-01-20T15:30:46Z] DEBUG SERVICE_POLICY Service payment recorded {
  walletId: "EPjFWaJy47DDaunGyv5QSN34cp1ADNYWNtPTPYGm7b7",
  serviceId: "inference-service",
  amount: 100_000,
  totalTodayAfter: 300_000
}

[2026-01-20T15:30:48Z] INFO INTENT_ROUTER SERVICE_PAYMENT_EXECUTED {
  intentId: "payment-1",
  serviceId: "inference-service",
  agentId: "agent-1",
  amount: 100_000,
  txSignature: "5x...",
  timestamp: "2026-01-20T15:30:48Z"
}
```

## Migration Guide

### From Previous Wallet Version

1. **Register service policies:**
   ```bash
   curl -X POST http://localhost:3000/api/service-policies \
     -H "Content-Type: application/json" \
     -d '{
       "serviceId": "my-service",
       "capPerTransaction": 100000,
       "dailyBudgetAmount": 500000,
       "cooldownSeconds": 30
     }'
   ```

2. **Update agents to use SERVICE_PAYMENT:**
   ```typescript
   // Old: Direct transfer intent
   { type: 'TRANSFER', recipient, amount }
   
   // New: Service payment with policy enforcement
   { type: 'SERVICE_PAYMENT', serviceId, recipient, amount }
   ```

3. **Monitor usage:**
   ```bash
   curl http://localhost:3000/api/service-policies/my-service/usage/:walletId
   ```

## Troubleshooting

### "Service policy not found"
- Verify service policy registered via `GET /api/service-policies`
- Create policy if missing: `POST /api/service-policies`

### "Amount exceeds cap per transaction"
- Check policy: `GET /api/service-policies/:serviceId`
- Reduce payment amount or increase cap via `PATCH`

### "Cooldown not elapsed"
- Check usage: `GET /api/service-policies/:serviceId/usage/:walletId`
- See `cooldownRemaining` field for wait time

### "Would exceed daily budget"
- Check `remainingBudget` in usage record
- Wait until next UTC midnight for reset or manually reset via `DELETE`

### "Intent ID already used (replay attack)"
- Each payment must use unique intent ID
- Verify nonce generation in client code

## Support

- **Issues:** GitHub issues on Agentic-wallet repository
- **Email:** support@agentic-wallet.dev
- **Docs:** See DEEP_DIVE.md for architecture details
