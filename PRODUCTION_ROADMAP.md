# Production Readiness Roadmap — April 20, 2026

**Status**: Frontend redesigned (Bold Aggressive brand ✓). Backend ready for scale. Assessment complete.

---

## 1. Backend Improvements (High Impact)

### 🔴 Critical Path

#### A. Transaction Resilience & Retry Strategy
**Current State**: Basic exponential backoff exists  
**Gap**: No transaction simulation pre-submission, no parallel retry coordination  
**Impact**: Prevent silent failures, reduce stuck transactions  

```
Priority: P0 | Effort: 4 hours | Value: Blocks production at scale
```

**Tasks**:
1. Pre-flight transaction simulation before submission
2. Parallel retry with exponential backoff + jitter
3. Dead letter queue for failed transactions (recovery path)
4. Transaction status polling with webhook notifications

#### B. Rate Limiting & Quota Management
**Current State**: No rate limits on agent loop execution  
**Gap**: Agents can spam RPC, burst transactions without throttling  
**Impact**: Prevent RPC provider rate limit violations, DDoS self-inflict  

```
Priority: P0 | Effort: 3 hours | Value: Prevents account lockout
```

**Tasks**:
1. Per-wallet transaction rate limiting (TPS quota)
2. Per-agent decision frequency limiter (min cycle time)
3. Global RPC call budget (requests/minute)
4. Graceful backoff when limits approached

#### C. WebSocket Heartbeat & Connection Management
**Current State**: WebSocket connections can go stale  
**Gap**: Dead connections not detected, clients hang indefinitely  
**Impact**: Frontend dashboards stay responsive, agents stay informed  

```
Priority: P1 | Effort: 2 hours | Value: Operational stability
```

**Tasks**:
1. Bidirectional ping/pong heartbeat (30s interval)
2. Automatic reconnection with exponential backoff
3. Connection lifecycle events (connect/disconnect/timeout)
4. Health check endpoint (`GET /health`)

### 🟡 Scale & Performance

#### D. Database Layer (Optional, for multi-node deployment)
**Current State**: In-memory store + disk persistence (single node)  
**Gap**: No distributed state, no multi-instance coordination  
**Impact**: Unlock horizontal scaling, HA deployments  

```
Priority: P2 | Effort: 16 hours | Value: Future-proofs architecture
```

**Options**: 
- PostgreSQL + connection pooling
- Redis for session/cache layer
- Event sourcing for audit trail

#### E. Agent Decision Caching
**Current State**: Every agent cycle recalculates context from RPC  
**Gap**: Inefficient RPC usage, latency on balance queries  
**Impact**: Reduce latency 50%, RPC usage 30%  

```
Priority: P1 | Effort: 3 hours | Value: Cost savings + speed
```

**Tasks**:
1. Cache balance queries (TTL 5-10s, stale-while-revalidate)
2. Cache token metadata (indefinite, invalidate on update)
3. Cache recent transaction history (TTL 30s)

---

## 2. Testing Improvements

### Test Coverage Gaps

```
Current: ~60% backend coverage
Target: 85% critical paths + E2E
```

#### A. Critical Path E2E Tests
**Current State**: Unit tests only  
**Gap**: No end-to-end agent → signing → submission flow test  
**Impact**: Catch integration bugs before users  

```
Priority: P0 | Effort: 6 hours | Value: Blocks production
```

**Test Scenarios**:
1. ✅ Agent decision → Intent creation → Wallet signing → Transaction submission (happy path)
2. ❌ Agent decision → Insufficient balance → Graceful failure + notification
3. 🔄 Agent decision → RPC timeout → Retry logic → Success
4. 🛑 Agent decision → Policy violation → Blocked, logged
5. 🔌 BYOA agent connection → Intent submission → Execution → Disconnect

#### B. Policy Engine Tests
**Current State**: Basic policy validation  
**Gap**: No comprehensive daily cap, allowlist, cooldown tests  
**Impact**: Prevent policy bypass bugs  

```
Priority: P0 | Effort: 4 hours | Value: Security critical
```

**Test Scenarios**:
1. Daily budget cap enforced across multiple transactions
2. Allowlist blocks non-approved recipients
3. Cooldown prevents rapid-fire transactions
4. Policy reset at midnight UTC (timezone edge cases)
5. Multi-agent policies don't interfere

#### C. Encryption & Key Management Tests
**Current State**: Basic encryption tests  
**Gap**: No key rotation, no distributed key tests  
**Impact**: Confidence in security layer  

```
Priority: P1 | Effort: 3 hours | Value: Operational confidence
```

**Test Scenarios**:
1. Key derivation from secret (scrypt parameters fixed)
2. AES-256-GCM decryption failure on tampered ciphertext
3. Key zeroing after signing (memory safety)
4. Concurrent signing operations (race conditions)

#### D. BYOA Integration Tests
**Current State**: Basic auth + routing  
**Gap**: No malicious agent simulation, no token expiry tests  
**Impact**: Confidence BYOA is truly sandboxed  

```
Priority: P1 | Effort: 4 hours | Value: Feature confidence
```

**Test Scenarios**:
1. Valid BYOA agent token → Intent accepted
2. Expired BYOA token → Rejection
3. Invalid token signature → Rejection
4. BYOA agent with malformed intent → Sanitization + logging
5. BYOA agent + policy violation → Blocked

#### E. Load & Stress Tests
**Current State**: None  
**Gap**: Unknown breaking point, no performance baselines  
**Impact**: Know limits before production  

```
Priority: P2 | Effort: 8 hours | Value: Operational planning
```

**Scenarios**:
1. 20 concurrent agents × 100 cycles = 2,000 transactions
2. WebSocket burst subscribe (1,000 concurrent clients)
3. RPC rate limit simulation (backpressure handling)
4. Memory leak detection (48-hour run)

---

## 3. Documentation

### Critical Gaps

#### A. Operator Runbook
**Current State**: Architecture docs exist  
**Gap**: No troubleshooting guide, no deployment guide, no monitoring guide  
**Impact**: Can't operate system without developer knowledge  

```
Priority: P0 | Effort: 4 hours | Value: Operational readiness
```

**Include**:
- Deployment checklist (env vars, secrets, RPC setup)
- Common issues & fixes (stuck agents, high gas fees, RPC failures)
- Monitoring dashboard setup (metrics to watch)
- Incident response (agent crash, key compromise, RPC outage)
- Scaling guide (single node → multi-node, load balancer config)

#### B. API Documentation (OpenAPI/Swagger)
**Current State**: Manual README sections  
**Gap**: No interactive API explorer, no schema enforcement  
**Impact**: Developer friction, easy to misuse API  

```
Priority: P1 | Effort: 3 hours | Value: Developer experience
```

**Deliverable**: Auto-generated Swagger UI at `/api-docs`  
**Include**: All endpoints, request/response schemas, error codes

#### C. BYOA Integration Guide
**Current State**: Brief section in README  
**Gap**: No step-by-step example, no token generation guide  
**Impact**: External agents can't integrate  

```
Priority: P1 | Effort: 3 hours | Value: Feature adoption
```

**Include**:
- Token generation & refresh flow
- Example BYOA agent (Python, Node.js)
- Intent payload examples
- Error handling patterns

#### D. Security Policy & Threat Model
**Current State**: SECURITY.md exists (vulnerability reporting)  
**Gap**: No threat model, no security architecture rationale  
**Impact**: Auditors can't validate design  

```
Priority: P2 | Effort: 6 hours | Value: Audit readiness
```

**Include**:
- Threat model (STRIDE format)
- Attack surface diagram
- Key management security assumptions
- Policy engine guarantee coverage

---

## 4. New Features

### Quick Wins (High Value, Low Effort)

#### A. Agent Performance Dashboard
**Current State**: Basic stats displayed  
**Gap**: No per-agent metrics (success rate, gas spent, ROI)  
**Impact**: Operators can't assess agent health  

```
Priority: P1 | Effort: 4 hours | Value: Operational visibility
```

**Metrics**:
- Total transactions submitted
- Success vs. failed rate
- Average gas per transaction
- Total SOL spent vs. earned
- Cycle time (avg decision latency)
- Policy violations (if any)

#### B. Transaction Explorer
**Current State**: Transaction list view exists  
**Gap**: Can't drill into tx details, no cross-agent aggregate view  
**Impact**: Hard to debug issues  

```
Priority: P1 | Effort: 5 hours | Value: Debugging capability
```

**Features**:
- Click tx to see full details (program, accounts, logs)
- Filter by agent, status, date range
- Export CSV for accounting
- Aggregate spending dashboard

#### C. Agent Pause/Resume
**Current State**: Agents run continuously  
**Gap**: Can't pause agent without deleting (destructive)  
**Impact**: Operators can't emergency-stop agents  

```
Priority: P1 | Effort: 2 hours | Value: Operational safety
```

**Implementation**:
1. Add `paused` field to Agent state
2. Skip think/execute loop if paused
3. UI toggle to pause/resume
4. Log pause/resume events

#### D. Policy Dry-Run Mode
**Current State**: Policies enforced on submission  
**Gap**: Can't test if policy would approve intent without executing  
**Impact**: Hard to validate policies before deployment  

```
Priority: P2 | Effort: 3 hours | Value: Operational safety
```

**Implementation**:
1. New endpoint: `POST /api/agents/:id/policy-check`
2. Accept intent, return would-be approval/rejection + reason
3. No transaction submission, no state change

### Medium Effort, High Value

#### E. Multi-Wallet Agent
**Current State**: Each agent has 1 wallet  
**Gap**: Can't distribute funds across multiple wallets for redundancy  
**Impact**: Single point of failure for agent  

```
Priority: P2 | Effort: 8 hours | Value: High-availability setup
```

**Design**:
- Agent can manage multiple wallets (primary + backups)
- Policy applied per-wallet or aggregate
- Automatic failover if primary depleted

#### F. Agent Scheduling (CRON-like)
**Current State**: Agents run continuously at fixed interval  
**Gap**: Can't schedule specific times (e.g., "run at 9am UTC")  
**Impact**: Can't optimize gas prices, timezone-specific operations  

```
Priority: P2 | Effort: 6 hours | Value: Operational flexibility
```

**Implementation**:
1. Add `schedule` field to Agent config (cron expression)
2. Skip think/execute if outside scheduled window
3. UI picker for common schedules

---

## Prioritization Framework

### Production Readiness Tiers

| Tier | P0 (Block Production) | P1 (First Month) | P2 (Roadmap) |
|------|----------------------|------------------|--------------|
| **Backend** | Transaction resilience, Rate limiting | WebSocket heartbeat, Caching | DB layer, Multi-node |
| **Testing** | E2E critical path, Policy tests | Encryption tests, BYOA tests | Load tests, Chaos |
| **Docs** | Operator runbook | API docs, BYOA guide | Threat model |
| **Features** | Agent pause/resume | Dashboard, Explorer | Scheduling, Multi-wallet |

---

## Recommended Implementation Order

### Week 1: Production Blocking
```
1. Transaction resilience (4h)        → Deploys
2. Rate limiting (3h)                 → Deploys
3. E2E critical path tests (6h)       → Ships with 1.0.1
4. Policy engine tests (4h)           → Ships with 1.0.1
5. Operator runbook (4h)              → Deploys
6. Agent pause/resume (2h)            → Deploys
```

**Outcome**: Production-ready, operationally sound, 75%+ critical path coverage

### Week 2: Stability & Visibility
```
7. WebSocket heartbeat (2h)           → Deploys
8. Agent caching layer (3h)           → Deploys 1.0.2
9. Performance dashboard (4h)         → Deploys 1.0.2
10. Transaction explorer (5h)         → Deploys 1.0.2
11. API docs (3h)                     → Deployed
12. BYOA integration guide (3h)       → Deployed
```

**Outcome**: Operators have visibility, developers have docs, performance optimized

### Week 3+: Scale & Polish
```
13. Encryption tests (3h)
14. BYOA integration tests (4h)
15. Policy dry-run mode (3h)
16. Threat model & security docs (6h)
17. Load tests (8h)
```

---

## Success Criteria

### Backend
- [ ] Zero stuck transactions (monitored for 7 days)
- [ ] RPC rate limits never hit (quota usage < 80%)
- [ ] Agent responsiveness < 500ms avg (p99 < 2s)
- [ ] No memory leaks (48-hour stable)

### Testing
- [ ] 85% critical path coverage
- [ ] All P0 scenarios passing
- [ ] Load test passes: 20 agents × 100 cycles

### Documentation
- [ ] Operator can deploy & operate solo
- [ ] Developer can integrate BYOA agent in < 2 hours
- [ ] Zero "how do I...?" questions from early users

### Features
- [ ] Agent pause/resume used in first incident (safe operations)
- [ ] Dashboard metrics show agent ROI clearly
- [ ] Transaction explorer used for 100% of support requests

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| E2E tests find critical bugs late | Run immediately after backend improvements |
| Performance dashboard adds complexity | Use existing metrics, simple aggregation |
| Rate limiting causes false positives | Conservative limits, monitoring for 3 days pre-production |
| Multi-wallet agent increases scope | Defer to Month 2, not blocking |

---

## Timeline

```
Today (Apr 20)   : Frontend redesigned ✓
Week 1 (Apr 22)  : Backend + Testing complete, Runbook done
Week 2 (Apr 29)  : Dashboards + Docs complete
Week 3 (May 6)   : Production Launch (testnet/devnet)
Week 4+          : Early user feedback + iterative improvements
```

---

## Next Steps

**Choose your path**:
- **Path A (Aggressive)**: Implement Week 1 + 2 in parallel (8 people 1 week, or 1 person 2 weeks)
- **Path B (Measured)**: Implement Week 1, validate, then Week 2 (safer, better testing window)
- **Path C (Custom)**: Pick specific P0 + P1 items, we'll detail estimates

**Recommendation**: Path B with focus on P0 items first. Operators need reliability > features.
