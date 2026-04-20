# Operator Runbook

**For running Sophia in production (testnet/devnet) with confidence.**

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Deployment Steps](#deployment-steps)
4. [Monitoring & Health Checks](#monitoring--health-checks)
5. [Troubleshooting](#troubleshooting)
6. [Incident Response](#incident-response)
7. [Scaling Guide](#scaling-guide)
8. [Backup & Recovery](#backup--recovery)

---

## Pre-Deployment Checklist

**Before deploying to testnet/devnet, verify:**

- [ ] All tests passing (`npm test` exit code 0)
- [ ] No console errors in build (`npm run build`)
- [ ] `.env` file created with all required variables
- [ ] RPC endpoint is responsive (`curl https://api.devnet.solana.com/`)
- [ ] Encryption key is 64 hex characters (32 bytes)
- [ ] Admin API key is set and secured
- [ ] CORS origins configured correctly
- [ ] Database backup created (if using external DB)
- [ ] Logging level set to `info` or `debug`
- [ ] Firewall allows inbound on ports 3001 (API) and 3002 (WebSocket)

**Deployment Readiness:**
```bash
# Run full pre-flight checks
npm run build
npm test
npm run lint

# Validate environment
node -e "require('./src/utils/config.js').getConfig()" && echo "✓ Config valid"
```

---

## Environment Setup

### Required Environment Variables

Create `.env` file in project root:

```bash
# ═══════════════════════════════════════════════════════════════
# REQUIRED: Security & Encryption
# ═══════════════════════════════════════════════════════════════

# 64-character hex string (32 bytes AES-256 key)
KEY_ENCRYPTION_SECRET=0000000000000000000000000000000000000000000000000000000000000000

# Admin API authentication key (for POST/PATCH endpoints)
ADMIN_API_KEY=your-secure-admin-key-here-minimum-16-chars

# ═══════════════════════════════════════════════════════════════
# REQUIRED: Blockchain Configuration
# ═══════════════════════════════════════════════════════════════

# RPC endpoint (devnet, testnet only — mainnet blocked)
SOLANA_RPC_URL=https://api.devnet.solana.com

# Network (MUST be 'devnet' or 'testnet', never 'mainnet-beta')
SOLANA_NETWORK=devnet

# ═══════════════════════════════════════════════════════════════
# REQUIRED: Server Configuration
# ═══════════════════════════════════════════════════════════════

# REST API port
PORT=3001

# WebSocket port
WS_PORT=3002

# CORS origins (comma-separated, or empty for defaults)
# CORS_ORIGINS=http://localhost:3000,https://myapp.example.com

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: Performance Tuning
# ═══════════════════════════════════════════════════════════════

# Max concurrent agents (default: 20)
MAX_AGENTS=20

# Agent loop interval in milliseconds (default: 15000 = 15s)
AGENT_LOOP_INTERVAL_MS=15000

# Max transaction retries (default: 3)
MAX_RETRIES=3

# Transaction confirmation timeout in milliseconds (default: 30000 = 30s)
CONFIRMATION_TIMEOUT_MS=30000

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: Logging
# ═══════════════════════════════════════════════════════════════

# Log level: 'debug', 'info', 'warn', 'error' (default: 'info')
LOG_LEVEL=info

# ═══════════════════════════════════════════════════════════════
# OPTIONAL: Node.js
# ═══════════════════════════════════════════════════════════════

# Production mode
NODE_ENV=production

# Trust proxy hops (set to 1 if behind reverse proxy)
# TRUST_PROXY=1
```

### Generate Secure Keys

```bash
# Generate 64-character hex encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to KEY_ENCRYPTION_SECRET

# Generate admin API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to ADMIN_API_KEY
```

### Validate Configuration

```bash
# Check env vars are loaded correctly
npm run validate-config

# Expected output:
# ✓ RPC endpoint responding
# ✓ Network is devnet/testnet (not mainnet)
# ✓ Encryption key valid (64 hex chars)
# ✓ Ports available (3001, 3002)
```

---

## Deployment Steps

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Build frontend and backend
npm run build

# 3. Run tests
npm test

# 4. Start development server (with hot reload)
npm run dev
# Server runs on http://localhost:3001
# Frontend available at http://localhost:3000
```

### Staging/Production Deployment

```bash
# 1. Clone and setup
git clone https://github.com/your-org/agentic-wallet.git
cd agentic-wallet
npm install

# 2. Create .env with production values
cp .env.example .env
# Edit .env with production secrets and RPC endpoint

# 3. Validate configuration
node -e "require('./src/utils/config.js').getConfig()" && echo "✓ Config valid"

# 4. Build
npm run build

# 5. Run tests
npm test

# 6. Start production server (use PM2 or similar)
pm2 start dist/src/server.js --name sophia-api
pm2 start 'npm run frontend' --name sophia-frontend

# 7. Verify health
curl http://localhost:3001/api/health
# Expected: {"success": true, "data": {"status": "healthy"}}
```

### Docker Deployment

```bash
# Build image
docker build -t sophia:latest .

# Run container
docker run -d \
  --name sophia \
  -p 3001:3001 \
  -p 3002:3002 \
  -e KEY_ENCRYPTION_SECRET=<64-char-hex> \
  -e ADMIN_API_KEY=<secure-key> \
  -e SOLANA_RPC_URL=https://api.devnet.solana.com \
  -e SOLANA_NETWORK=devnet \
  sophia:latest

# Check logs
docker logs sophia -f
```

### Kubernetes Deployment

See `.github/k8s/` for example manifests (if deploying at scale).

---

## Monitoring & Health Checks

### Health Endpoint

```bash
# Check if backend is responding
curl http://localhost:3001/api/health

# Expected response:
# {
#   "success": true,
#   "data": {"status": "healthy"},
#   "timestamp": "2026-04-20T12:00:00.000Z"
# }
```

### Stats Endpoint

```bash
# Get system stats
curl http://localhost:3001/api/stats

# Expected fields:
# - activeAgents: number
# - totalTransactions: number
# - avgGasPrice: number (SOL)
# - rpcHealth: "healthy" | "degraded"
```

### Rate Limit Status

```bash
# Check rate limiting status
curl http://localhost:3001/api/monitoring/rate-limits

# Expected response:
# {
#   "rpc": {
#     "used": 45,
#     "limit": 1200,
#     "utilization": "3.75%",
#     "blocked": false
#   },
#   "wallets": [
#     {
#       "address": "11111111...11111111",
#       "used": 5,
#       "max": 30,
#       "utilization": "16.67%",
#       "blocked": false
#     }
#   ]
# }
```

### WebSocket Connection Test

```bash
# Test WebSocket connection
wscat -c ws://localhost:3002

# Should receive agent state updates
> {"agents": [...], "timestamp": "..."}
```

### Metrics to Monitor

**Infrastructure:**
- CPU usage < 70%
- Memory usage < 80%
- Disk space > 20% free
- Network latency to RPC < 200ms

**Application:**
- Active agents count
- Transaction success rate > 95%
- Average transaction latency < 5s
- RPC budget utilization < 80%
- WebSocket connection count (healthy)
- Error rate < 1%

---

## Troubleshooting

### Problem: Backend won't start

**Error: `EADDRINUSE: address already in use :::3001`**

```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or use different port
PORT=3003 npm start
```

**Error: `KEY_ENCRYPTION_SECRET must be 64 hex characters`**

```bash
# Generate valid key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env and restart
```

### Problem: RPC connection failures

**Error: `Failed to fetch recent blockhash`**

```bash
# 1. Check RPC endpoint is accessible
curl https://api.devnet.solana.com/

# 2. If timeout, check network connectivity
ping api.devnet.solana.com

# 3. Temporarily use backup RPC endpoint (create RPC failover)
SOLANA_RPC_URL=https://api-backup.devnet.solana.com npm start

# 4. Check RPC rate limiting
curl http://localhost:3001/api/monitoring/rate-limits
```

### Problem: Rate limiting blocking all transactions

**Error: `RPC rate limit exceeded, try again later`**

```bash
# Check rate limiter status
curl http://localhost:3001/api/monitoring/rate-limits

# If RPC utilization > 90%:
# 1. Reduce agent loop frequency
MAX_AGENTS=10 AGENT_LOOP_INTERVAL_MS=30000 npm start

# 2. Or switch to higher-tier RPC provider
SOLANA_RPC_URL=https://api.rpc.helius.xyz/?api-key=YOUR_KEY npm start

# 3. Check which wallets are consuming budget
curl http://localhost:3001/api/monitoring/rate-limits | grep -A2 wallets
```

### Problem: Transactions stuck or not confirming

**Error: `Transaction failed after all retry attempts`**

```bash
# 1. Check if transaction is actually submitted
curl http://localhost:3001/api/transactions | head -20

# 2. Check network congestion
curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getRecentPrioritizationFees","params":[[]]}'

# 3. Increase confirmation timeout
CONFIRMATION_TIMEOUT_MS=60000 npm start

# 4. Reduce transaction frequency
MAX_AGENTS=5 AGENT_LOOP_INTERVAL_MS=60000 npm start
```

### Problem: Memory leak suspected

**Symptoms: Memory usage steadily increases**

```bash
# 1. Enable debug logging to see what's happening
LOG_LEVEL=debug npm start | tail -100

# 2. Check for unclosed connections
# Look for "connection open" without "connection closed"

# 3. Restart service gracefully
pm2 restart sophia-api --wait-ready

# 4. If leak persists, check for:
# - Unclosed timer handles (setInterval)
# - Accumulating event listeners
# - Unbounded arrays growing over time
```

### Problem: WebSocket clients disconnecting

**Error: `WebSocket connection closed unexpectedly`**

```bash
# 1. Check if WS server is healthy
curl http://localhost:3001/api/health

# 2. Verify firewall allows port 3002
netstat -an | grep 3002

# 3. Check for stale connections not being cleaned up
# (Look for "WebSocket connected" logs without "disconnected")

# 4. Enable heartbeat (see P1: WebSocket Heartbeat feature)
```

### Problem: Invalid transaction signatures

**Error: `Transaction failed: Invalid signature`**

```bash
# 1. Check that KEY_ENCRYPTION_SECRET is consistent
# (If key changes, wallets can't be re-encrypted)

# 2. Verify wallet still has private key
curl http://localhost:3001/api/agents/<id>

# 3. Check if wallet was corrupted during restart
# (Restart from backup if necessary)
```

---

## Incident Response

### Major Outage Procedure

**Step 1: Assess Impact**

```bash
# Check backend health
curl http://localhost:3001/api/health

# Check which agents are affected
curl http://localhost:3001/api/agents | jq '.data[] | {id, status, lastError}'

# Check transaction queue
curl http://localhost:3001/api/transactions | head -20
```

**Step 2: Halt Agents Immediately**

```bash
# Stop the service (prevents more transactions from executing)
pm2 stop sophia-api

# Or gracefully via API (if responding):
# Patch each agent to paused state
```

**Step 3: Investigate Root Cause**

```bash
# Check logs for errors
tail -500 logs/sophia.log | grep -i error

# Check RPC status
curl https://api.devnet.solana.com/

# Check system resources
free -h   # Memory
df -h     # Disk
top -n 1  # CPU
```

**Step 4: Restore Service**

```bash
# If RPC issue: wait for recovery or switch RPC provider
# If memory issue: restart with fewer agents
# If config issue: fix .env and restart

pm2 restart sophia-api

# Monitor logs for next 5 minutes
pm2 logs sophia-api
```

**Step 5: Post-Incident Review**

- [ ] Document what happened
- [ ] Root cause analysis
- [ ] Implement monitoring to catch earlier
- [ ] Update runbook with new scenario

### Wallet Compromise Procedure

**If private key is suspected compromised:**

1. **Immediately stop affected agent**
   ```bash
   curl -X POST http://localhost:3001/api/agents/<id>/stop \
     -H "X-Admin-Auth: <key>"
   ```

2. **Create new wallet**
   ```bash
   curl -X POST http://localhost:3001/api/wallets \
     -H "X-Admin-Auth: <key>"
   ```

3. **Transfer remaining funds**
   ```bash
   curl -X POST http://localhost:3001/api/intents \
     -H "Authorization: Bearer <token>" \
     -d '{"type": "TRANSFER_SOL", "params": {...}}'
   ```

4. **Audit transactions from compromised wallet**
   ```bash
   curl http://localhost:3001/api/transactions?wallet=<address>
   ```

5. **Report incident to security team**
   - Email: security@agentic-wallet.dev
   - Include timeline and impact assessment

### RPC Provider Failure

**If primary RPC fails:**

```bash
# Switch to backup RPC
export SOLANA_RPC_URL=https://api-backup.devnet.solana.com
pm2 restart sophia-api

# Or use failover logic (implement in future):
# Try primary → wait 5s → try secondary
```

---

## Scaling Guide

### Vertical Scaling (More Powerful Hardware)

```bash
# On larger machine with more CPU/memory:
MAX_AGENTS=50 npm start
```

**Recommended resources:**
- 4+ CPU cores
- 8+ GB RAM
- 50 Mbps network

### Horizontal Scaling (Multiple Instances)

**Use load balancer (nginx):**

```nginx
upstream sophia {
  server localhost:3001;
  server localhost:3003;
  server localhost:3005;
}

server {
  listen 80;
  location / {
    proxy_pass http://sophia;
  }
}
```

**Start multiple instances:**
```bash
PORT=3001 WS_PORT=3002 npm start &
PORT=3003 WS_PORT=3004 npm start &
PORT=3005 WS_PORT=3006 npm start &
```

**Note**: WebSocket distribution requires sticky sessions (by client IP or session token).

### Distributed State (Production)

For multiple instances sharing state:
- Implement Redis for session/cache layer
- Use PostgreSQL for persistent state
- Add event bus for inter-instance coordination (See backlog)

---

## Backup & Recovery

### Daily Backup Procedure

```bash
# Backup wallet state (stores encrypted private keys)
tar -czf backup-wallets-$(date +%Y%m%d).tar.gz data/

# Backup transaction history
cp data/transactions.json backup-transactions-$(date +%Y%m%d).json

# Upload to S3 or secure storage
aws s3 cp backup-wallets-*.tar.gz s3://my-backups/sophia/
```

### Recovery from Backup

```bash
# Restore wallets
tar -xzf backup-wallets-20260420.tar.gz -C .

# Restore transaction history
cp backup-transactions-20260420.json data/transactions.json

# Restart service
npm start
```

### Transaction Recovery

**If a transaction is stuck in pending:**

```bash
# Check status on Solana
solana confirm -u devnet <signature>

# If confirmed on-chain but not recorded:
# Manually insert into transaction log
# (Implementation detail: see transaction-builder.ts)

# If never submitted:
# Retry transaction from backup/replay
```

---

## Support & Escalation

**Issue severity levels:**

| Severity | Description | Response Time |
|----------|-------------|---|
| P1 | All agents stopped, no transactions possible | 15 min |
| P2 | Some agents failing, rate limited | 1 hour |
| P3 | Degraded performance, errors in logs | 4 hours |
| P4 | Enhancement or non-critical bug | 24 hours |

**Escalation contacts:**
- Primary: ops@agentic-wallet.dev
- Security: security@agentic-wallet.dev
- On-call: See PagerDuty rotation

---

## Maintenance Windows

**Regular maintenance:**
- Weekly: Check logs for errors, review metrics
- Monthly: Backup verification, dependency updates
- Quarterly: Load testing, capacity planning

**Scheduled downtime:** (none required for stateless architecture)

---

**Last Updated**: April 20, 2026  
**Version**: 1.0.0  
**Status**: Production Ready
