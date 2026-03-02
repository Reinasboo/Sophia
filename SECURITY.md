# Security Model

This document describes the security architecture, threat model, and defensive measures implemented in the Agentic Wallet System.

## Security Principles

1. **Least Privilege**: Components only have necessary permissions
2. **Defense in Depth**: Multiple layers of security controls
3. **Secure by Default**: Restrictive defaults, explicit opt-in
4. **Auditable**: All actions logged and traceable
5. **Fail Secure**: Errors result in denial, not bypass

## Threat Model

### Assets to Protect

1. **Private Keys**: Most critical - loss means loss of funds
2. **Wallet Balances**: SOL and SPL tokens under management
3. **System Integrity**: Correct operation of agents
4. **Data Confidentiality**: Transaction history, balances

### Threat Actors

| Actor | Capability | Motivation |
|-------|-----------|------------|
| External Attacker | Network access | Financial gain |
| Malicious Agent Code | Agent context access | Unauthorized transfers |
| Compromised Frontend | API access | Key exfiltration |
| Insider Threat | Full system access | Financial gain |

### Attack Vectors

#### 1. Key Extraction
**Threat**: Attacker extracts private keys from memory or storage

**Mitigations**:
- Keys encrypted at rest with AES-256-GCM
- Keys decrypted only momentarily for signing (<10ms)
- No key persistence in plaintext
- Secure key derivation with scrypt (N=32768 — OWASP recommended)
- **Memory zeroed**: `secretKey.fill(0)` immediately after signing

```typescript
// Key is decrypted, used for signing, then zeroed
const secretKey = decrypt(wallet.encryptedSecretKey, secret);
const keypair = Keypair.fromSecretKey(secretKey);
transaction.sign(keypair);
secretKey.fill(0); // zero before GC — defense in depth
// secretKey falls out of scope, eligible for GC
```

#### 2. Agent Compromise
**Threat**: Malicious agent code attempts unauthorized actions

**Mitigations**:
- Agents have NO cryptographic capabilities
- Intent-based communication (agents emit wishes, not commands)
- Policy engine validates all intents
- Rate limiting on transfers
- Balance minimums enforced

```typescript
// Agent CANNOT do this:
wallet.secretKey  // ❌ Not exposed
signTransaction() // ❌ Not available

// Agent CAN only do this:
return { type: 'transfer_sol', amount: 0.1, recipient: '...' }
return { type: 'transfer_token', mint: '...', amount: 10, recipient: '...' }
return { type: 'autonomous', action: 'transfer_sol', params: { amount: 0.5, recipient: '...' } }
// All intent types are validated by the same policy engine
// EXCEPT 'autonomous', which bypasses policy checks by design
```

#### 3. Frontend Attack
**Threat**: XSS or compromised frontend attempts key theft

**Mitigations**:
- Frontend never receives key material
- API only exposes public information
- CORS configured for specific origins (GET, POST, PATCH)
- Agent creation and configuration go through server-side validation
- Strategy parameters validated by Zod schemas in the Strategy Registry
- `executionSettings` bounds enforced server-side (min cycle 5 s, max 1 h)

```typescript
// API Response - Safe
{
  id: "wallet_abc123",
  publicKey: "7xKXt...",  // ✓ Public
  balance: 1.5            // ✓ Public
}

// Never returned
{
  secretKey: "...",       // ❌ Never exposed
  encryptedSecretKey: "..." // ❌ Never exposed
}
```

#### 4. Network Attacks
**Threat**: Man-in-the-middle, replay attacks

**Mitigations**:
- HTTPS in production
- Solana transaction signatures
- Blockhash validity windows
- Transaction deduplication

#### 5. Denial of Service
**Threat**: Resource exhaustion

**Mitigations**:
- Agent count limits
- **Per-IP API rate limiting** (120 req/min sliding window with auto-cleanup)
- **Per-agent BYOA rate limiting** (30 intents/min sliding window)
- Transaction retry limits
- Daily transfer limits per wallet

#### 6. Arbitrary Program Execution
**Threat**: Autonomous agent calls a malicious Solana program via `execute_instructions`

**Mitigations**:
- `AUTONOMOUS execute_instructions` enforces a **program allowlist** of 12 vetted programs
- Disallowed program IDs are rejected before signing (no transaction built)
- Allowlist includes: System Program, Token Program, ATA Program, Memo, Jupiter v6, Raydium AMM/CLMM, Orca Whirlpool, Pump.fun, PumpSwap, Bonk.fun
- Unknown programs are logged and blocked with an actionable error message

#### 7. Pre-Execution Error Cost
**Threat**: Agents burn SOL fees on transactions that would fail on-chain

**Mitigations**:
- **Transaction simulation** runs on all 10 execution paths before `sendTransaction()`
- Simulation failures abort the operation and record the error — no fee burned
- Covers: orchestrator SOL/token transfers, all 8 intentRouter paths (BYOA SOL, token, autonomous, raw, swap, create_token, arbitrary instructions)

## Security Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    UNTRUSTED ZONE                        │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐    │
│  │  Frontend   │  │   Agent     │  │  External    │    │
│  │  (Browser)  │  │   Logic     │  │  BYOA Agent  │    │
│  └─────────────┘  └─────────────┘  └──────────────┘    │
│         │                │                │              │
│         │ API            │ Intent         │ Bearer Token │
│         │ (read-only)    │                │ + Intent     │
│         ▼                ▼                ▼              │
├─────────────────────────────────────────────────────────┤
│                    TRUST BOUNDARY                        │
├─────────────────────────────────────────────────────────┤
│                    TRUSTED ZONE                          │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐    │
│  │   Policy    │  │   Wallet    │  │  Integration │    │
│  │  Validator  │  │  Manager    │  │  Layer       │    │
│  └─────────────┘  └─────────────┘  └──────────────┘    │
│         │                │                │              │
│         │                │ Encrypted Keys │ Token hashes │
│         ▼                ▼                ▼              │
│  ┌─────────────────────────────────────────┐            │
│  │              Secure Storage              │            │
│  │         (AES-256-GCM encrypted)         │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## BYOA (Bring Your Own Agent) Security Model

### Why External Agents Cannot Access Keys

The BYOA integration layer is designed so that external agents **never** hold or
observe private key material. This is enforced at multiple levels:

1. **Control Tokens ≠ Keys**: The control token authenticates intents but cannot
   sign transactions. It is a bearer token only.
2. **Intent Boundary**: External agents submit high-level intents
   (`REQUEST_AIRDROP`, `TRANSFER_SOL`, `TRANSFER_TOKEN`, `QUERY_BALANCE`, `AUTONOMOUS`), not raw transactions.
   The platform converts intents to transactions internally.
   **Note**: `AUTONOMOUS` intents bypass the policy engine but are still fully
   logged and rate-limited. The agent still never touches private keys.
3. **Wallet Isolation**: Each external agent is bound to exactly one wallet.
   An agent's token cannot access any other agent's wallet.
4. **Token Storage**: Control tokens are immediately hashed (SHA-256) upon
   registration. The raw token is returned once and never stored.

### Intent-Based Isolation

```
External Agent                     Platform
     │                                │
     │  "I want to send 0.5 SOL      │
     │   to address XYZ"             │
     │───────────────────────────────►│
     │                                │  1. Authenticate token
     │                                │  2. Verify intent in supported set
     │                                │  3. Rate limit check
     │                                │  4. Policy validation (max amount, daily limit)
     │                                │  5. Build transaction (RPC layer)
     │                                │  6. Sign transaction (wallet layer - keys here only)
     │                                │  7. Submit to Solana
     │  { status: "executed",         │
     │    signature: "abc..." }       │
     │◄───────────────────────────────│
```

The external agent only sees:
- ✓ Their wallet's public key
- ✓ Their wallet's balance
- ✓ Intent execution results (success/failure)

They never see:
- ✗ Private keys (encrypted, internal only)
- ✗ Other agents' wallets
- ✗ Raw transaction bytes
- ✗ Encryption secrets

### Rate Limiting

BYOA intents are rate-limited per agent:
- **30 intents per minute** per agent (sliding window)
- **Daily transfer limits** enforced by the policy engine
- **Maximum transfer amounts** per the wallet's policy

### Revocation

Agents can be permanently revoked via `POST /api/byoa/agents/:id/revoke`.
Once revoked:
- The token hash is deleted from the index
- All subsequent intent submissions are rejected
- The wallet remains but is no longer controllable

### Token Rotation (Reconnect)

If an agent loses its control token, an admin can issue a replacement via
`POST /api/byoa/agents/:id/rotate-token` (requires admin auth).

```bash
curl -X POST http://localhost:3001/api/byoa/agents/<agentId>/rotate-token \
  -H "X-Admin-Key: <adminKey>"

# Response:
{
  "agentId": "...",
  "controlToken": "<new-token-shown-once>",
  "walletPublicKey": "...",
  "note": "Token rotated. Update your agent with this new token. The wallet is unchanged."
}
```

What happens internally:
1. The old token hash is **deleted** from the token index (old token instantly invalid)
2. A new 256-bit token is generated
3. New hash is stored; wallet binding is **untouched**
4. Agent submits intents with the new token — same wallet, same funds

This means a disconnected or token-lost agent is **never** locked out of its wallet permanently.

## Policy Engine

The policy engine validates all agent intents:

```typescript
interface Policy {
  maxTransferAmount: number;    // Max per transaction (default: 1 SOL)
  maxDailyTransfers: number;    // Per wallet (default: 100)
  requireMinBalance: number;    // Min balance to maintain (default: 0.01 SOL)
  allowedRecipients?: string[]; // Whitelist (optional)
  blockedRecipients?: string[]; // Blacklist (optional)
}
```

**Validation Process**:
```
Intent → Policy Check → Balance Check → Rate Limit Check → Execute/Reject
```

## Key Storage

Keys are encrypted using:
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: scrypt (N=32768, r=8, p=1) — OWASP recommended minimum
- **Salt**: 32 bytes random per key
- **IV**: 16 bytes random per encryption

```typescript
// Encryption format: salt:iv:authTag:ciphertext (base64)
function encrypt(data: Uint8Array, passphrase: string): string {
  const salt = randomBytes(32);
  const key = scryptSync(passphrase, salt, 32);
  const iv = randomBytes(16);
  
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = cipher.update(data);
  const authTag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
}
```

## Logging and Audit

All security-relevant events are logged:

```typescript
// Sensitive data is automatically redacted
logger.info('Transaction signed', {
  walletId: 'wallet_123',
  signature: 'abc...',
  secretKey: '[REDACTED]'  // Auto-redacted
});
```

**Logged Events**:
- Wallet creation
- Transaction signing
- Policy validation (pass/fail)
- Agent status changes
- API requests

## Network Security (Devnet)

This system is designed for **Devnet only**:

```typescript
if (config.SOLANA_NETWORK === 'mainnet-beta') {
  throw new Error('Mainnet is not supported for safety');
}
```

**Mainnet Production Requirements** (not implemented):
- Hardware Security Module (HSM) integration
- Multi-signature requirements
- Formal security audit
- Rate limiting infrastructure
- Key rotation procedures
- Incident response plan

## Security Checklist

### Implemented ✓
- [x] Encrypted key storage
- [x] Agent isolation from keys
- [x] Memory zeroing of secret key after signing (`secretKey.fill(0)`)
- [x] Recipient address validation (PublicKey constructor before creating intents)
- [x] Policy-based validation
- [x] Read-only frontend (no key exposure)
- [x] Input validation (Zod) for all API endpoints
- [x] Secure logging (exact-match redaction of sensitive fields, RPC URL redacted)
- [x] Rate limiting (daily transfers)
- [x] **Per-IP API rate limiting** (120 req/min sliding window)
- [x] Balance minimums
- [x] BYOA control token hashing (SHA-256)
- [x] BYOA timing-safe token comparison (`crypto.timingSafeEqual`)
- [x] BYOA per-agent rate limiting (30/min)
- [x] BYOA intent validation against supported set
- [x] BYOA 1-wallet-per-agent isolation
- [x] BYOA agent revocation
- [x] **BYOA token rotation** (`rotate-token` — reconnect to same wallet with new token, old token invalidated atomically)
- [x] **Program allowlist for `execute_instructions`** (12 vetted DeFi/system programs)
- [x] **Transaction simulation on all execution paths** (10 paths — errors abort before fee is burned)
- [x] Strategy Registry param validation (Zod schemas per strategy)
- [x] Execution settings bounds (cycle 5 s–1 h, actions 1–10 000)
- [x] SPL token transfer (`transfer_token`) validated by the same policy engine as `transfer_sol`
- [x] SPL token transfers require wallet-layer signing (agents never access keys)
- [x] **On-chain token decimal lookup** (`getMintDecimals()` — no hardcoded 9)
- [x] AUTONOMOUS intent type: policy bypass is intentional, documented, and fully logged
- [x] Global intent history (`/api/intents`) provides unified audit trail for all intent types
- [x] Orchestrator records built-in agent intents to IntentRouter for centralized logging
- [x] Unhandled rejection / uncaught exception handlers
- [x] Production-mode encryption secret validation
- [x] Request body size limit (512 KB)
- [x] Admin API key authentication on all mutation endpoints (X-Admin-Key header)
- [x] BYOA registration requires admin auth (no open registration)
- [x] Autonomous intent safety guardrails (rate limits, transfer caps, min balance)
- [x] Prototype pollution prevention (Zod record transforms strip __proto__/constructor)
- [x] Error response sanitization (no stack traces leaked)
- [x] Configurable CORS origins via CORS_ORIGINS env var
- [x] WebSocket origin validation
- [x] Token transfer decimal awareness (callers specify decimals, not hardcoded 9)
- [x] Raw transaction inspection logging (programs audited before signing)
- [x] RateLimiter stale entry cleanup (prevents memory leaks)
- [x] EventBus subscriber limit (max 100)
- [x] EventBus amortized O(1) history trimming
- [x] Startup warnings for default encryption secret / admin key
- [x] **Graceful shutdown** (HTTP drain 10s timeout, WebSocket 1001 close)
- [x] **scrypt cost N=32768** (OWASP recommended)

### Recommended for Production
- [ ] HSM integration
- [ ] TLS/HTTPS everywhere
- [x] API authentication (admin key)
- [ ] Multi-signature wallets
- [ ] Key rotation
- [ ] Backup/recovery procedures
- [ ] Security monitoring
- [ ] Penetration testing
- [ ] Formal audit
- [ ] Persistent state (database) instead of in-memory
- [ ] Cryptographic randomness for agent behavior (replace Math.random)
- [ ] Recipient address validation at agent construction time
- [ ] Auto-generated frontend types from backend schemas

## Incident Response

If you suspect a security breach:

1. **Stop all agents immediately**
2. **Revoke any exposed secrets**
3. **Audit transaction history**
4. **Review access logs**
5. **Report to security team**

## Responsible Disclosure

If you discover a security vulnerability:
1. **Do not** disclose publicly
2. Email security@example.com
3. Include reproduction steps
4. Allow 90 days for fix

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [Solana Security Best Practices](https://docs.solana.com/security)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
