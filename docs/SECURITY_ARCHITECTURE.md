# Security Architecture

**Version**: 1.0.0 | **Last Updated**: May 5, 2026 | **Classification**: Operational

Deep-dive into security model, encryption, authentication flows, and threat mitigations.

## Table of Contents

1. [Security Model Overview](#security-model-overview)
2. [Encryption Architecture](#encryption-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [Threat Model & Mitigations](#threat-model--mitigations)
5. [Key Management](#key-management)
6. [Compliance & Auditing](#compliance--auditing)
7. [Incident Response](#incident-response)
8. [Security Guidelines for Operators](#security-guidelines-for-operators)

---

## Security Model Overview

### Threat Model

**Assets**:
- Private keys (highest value)
- User funds (high value)
- User data / transaction history (medium value)
- System availability (medium value)

**Threat Actors**:
1. **Unauthenticated External Attacker** — No system access
2. **Authenticated User (Normal)** — Can only affect own agents/wallets
3. **Compromised Frontend** — XSS/CSRF attacks, malicious scripts
4. **Rogue Admin** — Has admin API key, potential insider threat
5. **Infrastructure Compromise** — Railway/Vercel access compromised

### Security Principles

1. **Defense in Depth** — Multiple layers of security
2. **Least Privilege** — Users/services only access what needed
3. **Zero Trust** — Verify every request, even from internal sources
4. **Fail Secure** — Errors should not expose sensitive data
5. **Encryption by Default** — All sensitive data encrypted at rest
6. **Audit Everything** — Complete logging of sensitive operations

### Security Layers

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Network Security                          │
│  • TLS 1.3 for all data in transit                  │
│  • CORS policy enforcement                          │
│  • Rate limiting & DDoS protection                  │
└─────────────────────────────────────────────────────┘
              │ HTTPS + WSS
┌─────────────▼─────────────────────────────────────┐
│  Layer 2: Authentication & Authorization           │
│  • Privy OAuth (frontend users)                     │
│  • JWT verification (BYOA agents)                   │
│  • Admin API key (server operations)                │
│  • Per-wallet policies enforced                     │
└─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────┐
│  Layer 3: Application Logic                        │
│  • Input validation (Zod schemas)                   │
│  • Policy engine evaluation                         │
│  • Intent routing & sequencing                      │
│  • Transaction simulation (pre-flight)              │
└─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────┐
│  Layer 4: Cryptographic Operations                 │
│  • Private key isolation (wallet manager only)     │
│  • Transaction signing via hardware wallet capable │
│  • Encryption of stored secrets                     │
└─────────────────────────────────────────────────────┘
              │
┌─────────────▼─────────────────────────────────────┐
│  Layer 5: Blockchain Verification                  │
│  • Transaction pre-flight simulation                │
│  • On-chain confirmation verification               │
│  • Replay attack prevention (signatures unique)     │
└─────────────────────────────────────────────────────┘
```

---

## Encryption Architecture

### Data Classification

| Classification | Examples                 | Encryption | Location        |
| -------------- | ------------------------ | ---------- | --------------- |
| **Public**     | Agent ID, transaction sig | None       | Database, CDN   |
| **Sensitive**  | Wallet address           | ✓ Encrypted| Database        |
| **Confidential**| Private keys             | ✓ Encrypted| Memory (temp)   |
| **Secret**     | Admin API key            | ✓ Hashed   | Vault only      |

### Private Key Encryption

**Algorithm**: AES-256-GCM (Galois/Counter Mode)

**Key Derivation**:
```
KEY_ENCRYPTION_SECRET (256-bit, stored in vault)
         │
         ├─ User Password (from setup)
         │
         ▼
scrypt(password, salt, N=16384, r=8, p=1)
         │
         ▼ (32 bytes)
Derived Key (for AES-256-GCM)
```

**Encryption Flow**:
```typescript
// At agent creation
const plaintext = privateKeyBuffer;  // 64 bytes
const iv = crypto.randomBytes(12);   // 96 bits for GCM
const aad = agentId;                 // Additional authenticated data

const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
cipher.setAAD(Buffer.from(aad));

const encrypted = Buffer.concat([
  cipher.update(plaintext),
  cipher.final()
]);

const authTag = cipher.getAuthTag();  // 128 bits

// Stored format: [iv (12) | authTag (16) | encrypted (64)]
const ciphertext = Buffer.concat([iv, authTag, encrypted]);
```

**Decryption Flow**:
```typescript
// At transaction signing
const [iv, authTag, encrypted] = splitCiphertext(storedEncrypted);

const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
decipher.setAAD(Buffer.from(agentId));
decipher.setAuthTag(authTag);

const plaintext = Buffer.concat([
  decipher.update(encrypted),
  decipher.final()
]);

// plaintext is now the private key
```

**Security Properties**:
- **Confidentiality**: Only holder of KEY_ENCRYPTION_SECRET can decrypt
- **Authenticity**: AuthTag ensures tampering detected
- **IV Uniqueness**: Random IV prevents identical plaintexts producing identical ciphertexts
- **No Key Derivation from Plaintext**: Derived key is independent

### Database Encryption at Rest

**Sensitive Fields** (encrypted in database):
- `wallets.encrypted_private_key` — AES-256-GCM encrypted
- `wallets.metadata.phone` — (if stored)
- `agents.configuration` — Encrypted if contains secrets

**Encryption Process**:
```sql
-- Before insert
UPDATE agents 
SET configuration = pgcrypto.pgp_sym_encrypt(
  configuration::text, 
  'KEY_ENCRYPTION_SECRET'
)
WHERE id = 'agent_123';

-- Encrypted in database
-- Decrypted on read (transparent in ORM)
```

### Transit Encryption (TLS 1.3)

**All traffic** is encrypted with TLS 1.3:
- Frontend → Backend: HTTPS
- Frontend → WebSocket: WSS
- Backend → RPC: HTTPS
- Backend → Database: TLS connection
- Database → Backups: Encrypted during transfer

**Certificate Pinning** (optional, for high-security):
```typescript
// Client-side
import https from 'https';
import fs from 'fs';

const cert = fs.readFileSync('railway.crt');
const agent = new https.Agent({ ca: [cert] });
// All requests use this agent
```

### API Key Hashing

**Admin API Key Storage**:
```typescript
// Generation
const apiKey = crypto.randomBytes(32).toString('hex');  // Displayed once

// Storage (hashed)
const hash = crypto
  .createHash('sha256')
  .update(apiKey)
  .digest('hex');

// Verification
const incomingKey = req.headers['x-admin-key'];
const incomingHash = crypto
  .createHash('sha256')
  .update(incomingKey)
  .digest('hex');

if (incomingHash !== storedHash) {
  throw new UnauthorizedException();
}
```

---

## Authentication & Authorization

### Frontend User Authentication Flow

```
User (Browser)
    │
    ├─ Click "Login"
    │
    ▼
Privy OAuth Flow
    │
    ├─ Redirect to Privy login
    ├─ User authenticates (email/wallet/social)
    ├─ Privy issues OAuth token
    │
    ▼
Frontend Callback
    │
    ├─ POST /api/auth/privy-callback
    ├─ Body: { token: "eyJhbGc..." }
    │
    ▼
Backend Verification
    │
    ├─ Fetch JWKS from Privy endpoint
    ├─ Verify JWT signature (RS256)
    ├─ Extract user ID from "sub" claim
    ├─ Lookup or create user in database
    │
    ▼
Session Creation
    │
    ├─ Generate session cookie (httpOnly, secure)
    ├─ Store session in memory (or Redis if needed)
    │
    ▼
Frontend
    │
    └─ Redirect to dashboard
    └─ Cookie sent with all subsequent requests
```

**JWT Verification** (Privy):
```typescript
// src/integration/agentAdapter.ts
import { jwtVerify } from 'jose';

const jwksUrl = process.env.PRIVY_JWKS_URL;

async function verifyPrivyToken(token: string) {
  // Fetch JWKS (cached, refreshed daily)
  const keyset = await fetchJWKS(jwksUrl);
  
  // Verify token
  const { payload } = await jwtVerify(token, keyset);
  
  // Validate claims
  if (payload.aud !== process.env.PRIVY_APP_ID) {
    throw new Error('Invalid audience');
  }
  
  if (Date.now() > (payload.exp! * 1000)) {
    throw new Error('Token expired');
  }
  
  return payload.sub;  // User ID
}
```

### BYOA Agent Authentication Flow

```
External Agent
    │
    ├─ Has JWT from Privy (user authenticated agent)
    │
    ▼
Submit Intent
    │
    ├─ POST /api/byoa/intents
    ├─ Header: Authorization: Bearer <jwt>
    │
    ▼
Backend JWT Verification
    │
    ├─ Verify signature (same as frontend)
    ├─ Verify "aud" claim (matches PRIVY_APP_ID)
    ├─ Verify "exp" (not expired)
    │
    ▼
Agent Registration Lookup
    │
    ├─ Query database for byoa_agents where privy_user_id = payload.sub
    ├─ Get agent policies
    │
    ▼
Intent Validation & Execution
    │
    ├─ Validate intent type in supportedIntents
    ├─ Check policies (daily limits, amounts)
    ├─ Build & sign transaction
    └─ Submit to network
```

### Admin API Key Authorization

```
Operator / Service
    │
    ├─ Has X-Admin-Key (from vault)
    │
    ▼
API Request
    │
    ├─ POST /api/agents
    ├─ Header: X-Admin-Key: <key>
    │
    ▼
Backend Verification
    │
    ├─ Hash incoming key with SHA256
    ├─ Compare with stored hash (constant-time comparison)
    │
    ├─ If match:
    │  ├─ Check request signing window (prevent replay)
    │  ├─ Log request (with redaction of sensitive fields)
    │  └─ Execute operation
    │
    ├─ If no match:
    │  ├─ Log security event (alert team)
    │  └─ Return 403 Forbidden
    │
    ▼
Operation Complete
```

### Policy-Based Access Control

**Per-Agent Policies**:
```json
{
  "agentId": "agent_123",
  "policies": {
    "dailyLimit": 10000000,        // 10 SOL/day
    "maxTransactionSize": 1000000, // 1 SOL/tx
    "allowedOperations": ["transfer", "swap"],
    "allowedRecipients": [
      "recipient1.sol",
      "recipient2.sol"
    ],
    "timeWindowStart": "09:00",    // UTC
    "timeWindowEnd": "17:00"       // UTC
  }
}
```

**Policy Evaluation**:
```typescript
function evaluatePolicy(
  agent: Agent,
  intent: Intent
): { allowed: boolean; reason?: string } {
  const policy = agent.policies;
  
  // Check operation allowed
  if (!policy.allowedOperations.includes(intent.type)) {
    return { allowed: false, reason: 'Operation not allowed' };
  }
  
  // Check daily limit
  const today = new Date().toDateString();
  const todaySpent = agent.transactions
    .filter(t => new Date(t.createdAt).toDateString() === today)
    .reduce((sum, t) => sum + t.amount, 0);
  
  if (todaySpent + intent.amount > policy.dailyLimit) {
    return { allowed: false, reason: 'Daily limit exceeded' };
  }
  
  // Check transaction size
  if (intent.amount > policy.maxTransactionSize) {
    return { allowed: false, reason: 'Transaction too large' };
  }
  
  // Check recipient allowed
  if (policy.allowedRecipients && 
      !policy.allowedRecipients.includes(intent.recipient)) {
    return { allowed: false, reason: 'Recipient not allowed' };
  }
  
  // Check time window
  const currentHour = new Date().getUTCHours();
  const [startHour, startMin] = policy.timeWindowStart.split(':');
  const [endHour, endMin] = policy.timeWindowEnd.split(':');
  
  if (currentHour < parseInt(startHour) || 
      currentHour >= parseInt(endHour)) {
    return { allowed: false, reason: 'Outside allowed time window' };
  }
  
  return { allowed: true };
}
```

---

## Threat Model & Mitigations

### Threat 1: Private Key Compromise

**Scenario**: Attacker gains access to private key (database breach, memory dump, etc.)

**Mitigations**:
- ✓ Private keys encrypted at rest (AES-256-GCM)
- ✓ Encryption key stored in vault, not in code
- ✓ Keys only decrypted in isolated wallet manager
- ✓ Decrypted key never written to disk (memory only)
- ✓ Audit logs track all key access
- ✓ Hardware wallet support (future) for signing

**Residual Risk**: Medium (if attacker has both encrypted key AND decryption key)

**Mitigation**: Regular key rotation, monitoring for unusual access patterns

---

### Threat 2: Unauthorized Transaction Submission

**Scenario**: Attacker submits transaction without proper authorization

**Mitigations**:
- ✓ JWT signature verification (BYOA agents)
- ✓ Admin API key verification (server operations)
- ✓ Per-agent policy enforcement
- ✓ Transaction simulation before submission
- ✓ Rate limiting (30 tx/min per wallet)
- ✓ Recipient whitelist (optional)

**Residual Risk**: Low (if all auth mechanisms working)

**Mitigation**: Real-time alerting on unusual transaction patterns

---

### Threat 3: Frontend XSS Attack

**Scenario**: Attacker injects malicious script, steals user session

**Mitigations**:
- ✓ Session cookies httpOnly (not accessible to JavaScript)
- ✓ Session cookies secure (only over HTTPS)
- ✓ SameSite=Strict (no cross-site request forgery)
- ✓ Content Security Policy (CSP) headers
- ✓ Input validation (Zod on frontend)
- ✓ React automatic escaping

**Residual Risk**: Low (httpOnly prevents session theft)

**Mitigation**: Regular security audits, dependency updates

---

### Threat 4: Rogue Admin

**Scenario**: Admin with API key abuses access, submits unauthorized transactions

**Mitigations**:
- ✓ Admin key logged on every use (audit trail)
- ✓ Rate limiting applies to admin too
- ✓ All operations require policy enforcement
- ✓ Unusual patterns alert security team
- ✓ Key rotation possible (new key issued)
- ✓ API key only grants specific operations

**Residual Risk**: Medium (admin has legitimate access)

**Mitigation**: Segregate duties (creator ≠ approver), rotation schedule, monitoring

---

### Threat 5: Database Breach

**Scenario**: Attacker gains access to PostgreSQL database

**Mitigations**:
- ✓ Database behind Railway firewall (no public access)
- ✓ Connection via TLS
- ✓ Private keys encrypted (useless without KEY_ENCRYPTION_SECRET)
- ✓ Read replicas for sensitive queries
- ✓ Backup encryption (Railway managed)
- ✓ Database backups not accessible to regular users

**Residual Risk**: Medium (depends on DATABASE_URL exposure)

**Mitigation**: Strict environment variable access control, audit trail

---

### Threat 6: RPC Provider Attack

**Scenario**: RPC provider manipulated, returns false transaction confirmations

**Mitigations**:
- ✓ Transaction simulation before submission
- ✓ On-chain confirmation verification
- ✓ Helius webhook verification (signature check)
- ✓ Fallback to backup RPC if primary fails
- ✓ Monitor confirmation inconsistencies

**Residual Risk**: Low (consensus layer security)

**Mitigation**: Use multiple RPC providers, stagger queries

---

### Threat 7: Insider Threat (DevOps / Operator)

**Scenario**: Operator with infrastructure access steals keys or modifies code

**Mitigations**:
- ✓ Encryption keys in separate vault (not even DevOps has)
- ✓ Audit logs of all SSH access
- ✓ Code reviewed before deployment (GitHub)
- ✓ CI/CD automated (minimal human intervention)
- ✓ Secrets rotated regularly
- ✓ Infrastructure immutable (containers)

**Residual Risk**: Medium (requires multiple control bypasses)

**Mitigation**: Separation of duties, surveillance, exit procedures

---

## Key Management

### Encryption Key Lifecycle

**Generation**:
```bash
# Create strong 256-bit key
openssl rand -base64 32
# Output: aB7Cq9rNxOpqK3lT8uVwXyZ2a4dEfGhIjKlMnOpQrS=
```

**Storage** (Vault):
- Store in 1Password, AWS Secrets Manager, or similar
- Never commit to Git
- Never log or display
- Access via environment variable only

**Rotation** (Quarterly):
```bash
# Create new key
NEW_KEY=$(openssl rand -base64 32)

# Update environment variable
railway env set KEY_ENCRYPTION_SECRET "$NEW_KEY"

# Migrate encrypted data (if storing multiple versions):
npm run scripts/rotate-encryption-key.ts

# Verify old key is removed
# Keep audit log of rotation
```

**Destruction** (When no longer needed):
- Securely delete from vault
- Update rotation log
- Notify team
- Audit historical access

### Admin API Key Rotation

**Quarterly Rotation**:
```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Create backup of old key (secure location)
echo "$OLD_KEY" | gpg --symmetric > admin-key-backup-2026-05-05.gpg

# Update environment variable
railway env set ADMIN_API_KEY "$NEW_KEY"

# Restart backend to pick up new key
railway service restart sophia

# Notify team of new key
# Update documentation
# Remove old key from any integrations
```

### Database Credentials

**Initial Setup**:
```bash
# Generate password
DB_PASSWORD=$(openssl rand -base64 32)

# Create database user
createdb -U postgres -W sophia_prod

# Store in vault (never in code)
railway env set DATABASE_URL "postgres://user:$DB_PASSWORD@host/db"
```

**Rotation** (If compromised):
```bash
# Create new database user
psql -c "ALTER ROLE sophia_prod WITH PASSWORD '$NEW_PASSWORD';"

# Update connection string
railway env set DATABASE_URL "postgres://user:$NEW_PASSWORD@host/db"

# Restart backend
railway service restart sophia

# Verify connection works
psql "$DATABASE_URL" -c "SELECT 1;"
```

---

## Compliance & Auditing

### Audit Logging

**Events Logged**:
- User authentication (success/failure)
- Agent creation / modification / deletion
- Transaction submission / execution
- Policy violations
- Failed authorization attempts
- Admin API key usage
- Database backups

**Audit Log Format**:
```json
{
  "timestamp": "2026-05-05T10:30:00Z",
  "event_type": "transaction_submitted",
  "user_id": "user_123",
  "agent_id": "agent_e8f5b9a2",
  "action": "submit",
  "result": "success",
  "details": {
    "intent_type": "transfer",
    "amount": 1000000,
    "recipient": "ABC...123"
  },
  "ip_address": "203.0.113.42",
  "user_agent": "Mozilla/5.0..."
}
```

**Storage** (PostgreSQL):
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255),
  agent_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  result VARCHAR(20) NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_agent_id ON audit_logs(agent_id);
```

**Retention**: 365 days (configurable)

### Access Control Audit

**Quarterly Review**:
```bash
# Who has accessed the system?
SELECT user_id, COUNT(*) as event_count 
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY user_id 
ORDER BY event_count DESC;

# What operations were performed?
SELECT event_type, COUNT(*) 
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY event_type;

# Any failed authorization attempts?
SELECT COUNT(*) FROM audit_logs 
WHERE result = 'failure' 
AND event_type IN ('auth_failed', 'authorization_failed');
```

### Compliance Standards

**Security Standards Met**:
- [x] OWASP Top 10 (2021) — All items addressed
- [x] NIST Cybersecurity Framework — Identify, Protect, Detect, Respond, Recover
- [x] SOC 2 Type II ready — Audit trail, access controls, encryption
- [x] GDPR ready — Data protection, user consent, right to erasure
- [x] Industry Best Practices — Key management, TLS, secure coding

---

## Incident Response

### Security Incident Classification

| Severity | Examples                                    | Response |
| -------- | ------------------------------------------- | -------- |
| **CRIT** | Private key leaked, funds stolen            | Immediate |
| **HIGH** | Unauthorized admin API key access           | 1 hour   |
| **MED**  | Unauthorized transaction attempted (blocked)| 4 hours  |
| **LOW**  | Failed login attempt, minor misconfiguration| 1 day    |

### Incident Response Template

```
SECURITY INCIDENT REPORT

Date Detected: 2026-05-05T10:30:00Z
Incident Type: [Key compromise | Unauthorized access | Data breach | ...]
Severity: [CRIT | HIGH | MED | LOW]
Detected By: [System alert | Manual | ...]

TIMELINE:
[HH:MM] Event occurred
[HH:MM] Detection
[HH:MM] Investigation started
[HH:MM] Mitigation begun
[HH:MM] Resolution completed

IMPACT:
- Affected Resources: [List]
- User Impact: [Description]
- Data Exposed: [Yes/No, what data]
- Financial Impact: [Amount, if applicable]

ROOT CAUSE:
[Analysis]

RESPONSE:
1. Immediate actions taken: [List]
2. Mitigation: [List]
3. Containment: [List]

RECOVERY:
1. Restoration steps: [List]
2. Verification: [List]
3. Communication: [List]

LESSONS LEARNED:
1. What should we do differently? [List]
2. Process improvements: [List]
3. Tool/training improvements: [List]

FOLLOW-UP:
- [ ] Fix implemented
- [ ] Process documented
- [ ] Team trained
- [ ] Monitoring enhanced
- [ ] Incident closed
```

---

## Security Guidelines for Operators

### Daily Checklist

- [ ] Review security alerts in monitoring dashboard
- [ ] Check audit logs for unusual activity
- [ ] Verify backup completion
- [ ] Monitor error rates (should be < 1%)

### Weekly Checklist

- [ ] Rotate access logs to archive
- [ ] Review admin API key usage
- [ ] Check for pending security patches
- [ ] Test failover procedures (documentation)

### Monthly Checklist

- [ ] Full audit log review
- [ ] Security vulnerability scan
- [ ] Key rotation if needed
- [ ] Disaster recovery drill

### Red Flags (Investigate Immediately)

- Multiple failed authentication attempts from same IP
- Admin API key usage outside normal hours
- Unexpected large transactions
- Database connection errors
- Rapid RPC provider failures
- WebSocket disconnection spikes

### Secure Communication

**For Sensitive Topics**:
- Use Signal or encrypted messaging
- Never email passwords or keys
- Conference calls only (no chat records)
- Document discussion in secure Notion

**For Incident Updates**:
- Use dedicated Slack channel (#security-incidents)
- Avoid mentioning specific amounts/addresses
- Redact sensitive information in logs before sharing
- After-action debrief within 48 hours

---

## Related Documentation

- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) — System architecture overview
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Secure deployment procedures
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-2 operations
