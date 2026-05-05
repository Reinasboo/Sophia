# Deployment Guide

**Version**: 1.0.0 | **Last Updated**: May 5, 2026 | **Status**: Production-Ready

Complete step-by-step guide for deploying Agentic Wallet to production (mainnet).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Setup](#environment-setup)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Post-Deployment Validation](#post-deployment-validation)
7. [Rollback Procedures](#rollback-procedures)
8. [Emergency Procedures](#emergency-procedures)

---

## Prerequisites

### Required Access

- [x] GitHub repository write access (`main` branch)
- [x] Railway project admin access (backend)
- [x] Vercel project admin access (frontend)
- [x] Privy dashboard access (OAuth keys)
- [x] Solana mainnet RPC endpoint access
- [x] Database admin credentials (Railway PostgreSQL)

### Required Software

```bash
# Verify installations
node --version          # ≥ 20.0.0
npm --version           # ≥ 9.0.0
git --version           # ≥ 2.30.0
railway --version       # Any recent version (https://railway.app/cli)
```

### Required Credentials (`.env.production`)

Store securely (e.g., 1Password, AWS Secrets Manager):

```env
# Solana Configuration
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
HELIUS_WEBHOOK_SECRET=<webhook-secret-from-helius>

# Database Configuration
DATABASE_URL=postgres://user:pass@host:5432/db
# Get from Railway: Railway → Project → PostgreSQL → Connect tab

# Encryption Keys
KEY_ENCRYPTION_SECRET=<base64-256-bit-random-key>
# Generate: openssl rand -base64 32
# Store SECURELY; lost key = lost wallet access

ADMIN_API_KEY=<hex-256-bit-random-key>
# Generate: openssl rand -hex 32
# Store SECURELY; used for /api/proxy-admin authentication

# Privy OAuth
PRIVY_APP_ID=<app-id-from-privy-dashboard>
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<app-id>/jwks.json

# Frontend Configuration
NEXT_PUBLIC_API_URL=https://sophia-production-1a83.up.railway.app
NEXT_PUBLIC_WS_URL=wss://sophia-production-1a83.up.railway.app
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_PRIVY_APP_ID=<app-id-from-privy-dashboard>

# CORS
CORS_ORIGINS=https://<vercel-frontend-domain>,https://<custom-domain>

# Monitoring & Logging
LOG_LEVEL=info
NODE_ENV=production
```

---

## Pre-Deployment Checklist

### 1. Code Validation

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Run all tests (must pass)
npm test 2>&1 | tee test-results.log

# Check code quality
npm run lint

# Validate TypeScript compilation
npm run build

# Validate mainnet configuration
npm run mainnet:check
```

**Expected Output**:
```
✅ Tests: All passed
✅ Linting: No errors
✅ Build: Compilation successful
✅ Mainnet check: Configuration valid
```

### 2. Database Migration Readiness

```bash
# Check pending migrations
npm run db:migrate:status

# Dry-run next migration
npm run db:migrate:test

# Expected: All migrations should be applied in staging first
```

### 3. Environment Variable Validation

```bash
# Verify all required env vars are set
npm run validate:env:production

# This script checks:
# ✅ All required keys present
# ✅ Solana network = mainnet-beta
# ✅ Encryption keys have correct format/length
# ✅ RPC endpoint is reachable
# ✅ Database connection works
# ✅ Privy JWKS URL valid
```

### 4. Security Review

```bash
# Check for hardcoded secrets
grep -r "devnet" apps/frontend --exclude-dir=node_modules
# Expected: No results (devnet should only be in comments/docs)

grep -r "private_key" src --exclude-dir=node_modules
# Expected: No hardcoded keys in code

# Audit dependencies for vulnerabilities
npm audit --audit-level=high
# Expected: No HIGH or CRITICAL vulnerabilities (MODERATE OK with exception doc)
```

### 5. Infrastructure Pre-Flight Check

```bash
# Verify Railway service health
railway status

# Expected output:
# Connected to project: Agentic-Wallet
# Service: sophia (backend)
#   Status: running
#   Replicas: 1/1 healthy
# Service: Postgres
#   Status: running

# Test RPC endpoint
curl -s https://api.mainnet-beta.solana.com \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .

# Expected: { "jsonrpc": "2.0", "result": "ok" }

# Test database connection
psql "$DATABASE_URL" -c "SELECT version();"

# Expected: PostgreSQL version output
```

### 6. Staging Validation

```bash
# Optional: Test in staging environment first
git tag v<version> -m "Release v<version>"
git push origin v<version>

# Deploy to staging branch (if configured)
git push origin main:staging

# Wait 5 minutes for staging deployment
# Test critical user paths in staging UI
# Verify logs for errors
```

**Sign-off Template**:
```
[ ] Code review passed
[ ] All tests passing
[ ] mainnet:check validation passed
[ ] Security audit passed
[ ] Database migrations tested
[ ] RPC endpoint verified
[ ] Staging deployment successful (if applicable)
[ ] Product sign-off received
Approval: _______________  Date: _______
```

---

## Environment Setup

### Step 1: Create Production Environment Files

**On Local Machine** (never commit):

```bash
# Create production env files (for reference/validation)
touch .env.production
touch .env.production.local

# Never commit these files!
echo ".env.production" >> .gitignore
echo ".env.production.local" >> .gitignore
git add .gitignore && git commit -m "chore: update gitignore for env files"
```

**Populate `.env.production.local`** with values from your secure vault:

```bash
# Copy template
cp .env.example .env.production.local

# Edit with secure values
code .env.production.local  # Use your preferred editor

# Verify file is NOT committed
git status | grep env.production
# Expected: file should NOT appear (gitignored)
```

### Step 2: Configure Railway Service

```bash
# Login to Railway CLI
railway login

# Switch to production project
railway project select  # Select "Agentic-Wallet" project

# Set production environment variables
railway env set NODE_ENV production
railway env set SOLANA_NETWORK mainnet-beta

# Set sensitive variables (from vault)
railway env set SOLANA_RPC_URL "https://api.mainnet-beta.solana.com"
railway env set KEY_ENCRYPTION_SECRET "$(openssl rand -base64 32)"
railway env set ADMIN_API_KEY "$(openssl rand -hex 32)"

# Verify all vars are set
railway env list
```

### Step 3: Configure Vercel Frontend

**Via Vercel Dashboard**:
1. Go to Vercel Project → Settings → Environment Variables
2. Add for Production:
   - `NEXT_PUBLIC_API_URL`: `https://sophia-production-1a83.up.railway.app`
   - `NEXT_PUBLIC_WS_URL`: `wss://sophia-production-1a83.up.railway.app`
   - `NEXT_PUBLIC_SOLANA_NETWORK`: `mainnet-beta`
   - `NEXT_PUBLIC_PRIVY_APP_ID`: `<privy-app-id>`

**Via Vercel CLI**:
```bash
# Install Vercel CLI
npm i -g vercel

# Link to project
vercel link

# Set production env vars
vercel env add NEXT_PUBLIC_API_URL
# Paste: https://sophia-production-1a83.up.railway.app
# Select: Production
```

### Step 4: Validate Configuration

```bash
# From project root
npm run mainnet:migrate-env

# This generates:
# .env.mainnet — final validated config for production
# mainnet-config.json — JSON representation for auditing

# Review generated config
cat .env.mainnet

# Commit mainnet config (safe; no secrets)
git add mainnet-config.json
git commit -m "chore: update mainnet configuration"
```

---

## Backend Deployment

### Option 1: Automatic Deployment (GitHub → Railway)

Railway is configured to auto-deploy on push to `main` branch via webhook.

```bash
# Ensure all changes are committed
git status  # Should be clean

# Push to main
git push origin main

# Monitor deployment in Railway dashboard
railway logs --service sophia --follow

# Wait for these messages:
# "Server listening on port 3000"
# "Connected to PostgreSQL"
# "Mainnet validation: OK"
```

**Estimated Deployment Time**: 2-3 minutes

### Option 2: Manual CLI Deployment

```bash
# Build locally
npm run build

# Deploy from CLI
railway up --service sophia

# This will:
# 1. Build Docker image
# 2. Push to Railway registry
# 3. Restart container with new image
# 4. Monitor health checks (30s)

# Watch logs
railway logs --service sophia --follow
```

### Option 3: Emergency Redeploy (from GitHub)

```bash
# If deployment is stuck or needs immediate restart
railway service restart sophia

# This will:
# 1. Stop current container
# 2. Start new container from current image
# 3. Run health checks
# 4. Resume normal operation

# Monitor
railway logs --service sophia --follow
```

### Verification Steps

```bash
# 1. Check health endpoint
curl -s https://sophia-production-1a83.up.railway.app/api/health | jq .

# Expected:
# {
#   "success": true,
#   "data": {
#     "status": "healthy",
#     "timestamp": "2026-05-05T..."
#   }
# }

# 2. Check database connectivity
railway logs --service sophia | grep "Connected to PostgreSQL"

# 3. Check RPC connectivity
railway logs --service sophia | grep "RPC health"

# 4. Check WebSocket server
curl -i https://sophia-production-1a83.up.railway.app/api/health -H "Upgrade: websocket"
# Expected: 101 Switching Protocols (WebSocket available)

# 5. Monitor error logs for 5 minutes
railway logs --service sophia --follow --until=5m
# Should show: [INFO] Normal operation, no errors
```

---

## Frontend Deployment

### Automatic Deployment (GitHub → Vercel)

Vercel is configured to auto-deploy on push to `main` branch.

```bash
# Verify environment variables are set
vercel env ls  # Should show production vars

# Push to main
git push origin main

# Monitor in Vercel Dashboard:
# 1. Go to Deployments tab
# 2. Watch build progress (3-5 minutes)
# 3. Wait for "Production" badge to appear

# Or use CLI
vercel logs --follow --since=5m
```

### Manual Deployment

```bash
# Build frontend locally
cd apps/frontend
npm run build

# Deploy to Vercel
vercel deploy --prod

# This will:
# 1. Create production build
# 2. Deploy to Edge network
# 3. Run post-deploy validations
# 4. Promote to production domain

# Wait for confirmation
# Expected: "✓ Deployment ready on https://<domain>"
```

### Verification Steps

```bash
# 1. Test frontend loads
curl -I https://<vercel-domain>/

# Expected: 200 OK, _next/static/* served with cache headers

# 2. Test API connectivity
open https://<vercel-domain>  # In browser DevTools → Network tab

# Should show:
# ✅ API calls to backend successful
# ✅ WebSocket connection established (wss://)
# ✅ No CORS errors

# 3. Test critical paths
# - Login page loads
# - Create agent flow works
# - Explorer page displays transactions
# - Real-time WebSocket updates work

# 4. Performance check
vercel inspect --since=5m
# Should show: LCP < 2s, FCP < 1s
```

---

## Post-Deployment Validation

### Immediate Checks (0-5 minutes)

```bash
# 1. Backend health
for i in {1..5}; do
  curl -s https://sophia-production-1a83.up.railway.app/api/health | jq .success
  sleep 1
done
# Expected: All 5 requests return true

# 2. Database
railway db shell <<EOF
SELECT COUNT(*) FROM pg_stat_activity;
EOF
# Expected: No connection errors

# 3. RPC
curl -s https://api.mainnet-beta.solana.com \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .result
# Expected: "ok"

# 4. Frontend render
curl -s https://<vercel-domain>/ | grep -q "<title>"
# Expected: Exit code 0 (HTML contains title)
```

### Smoke Tests (5-30 minutes)

```bash
# Run automated smoke test suite (if available)
npm run test:smoke:production

# Manual smoke test checklist:
# [ ] Login with test account via Privy
# [ ] Create a new agent (5-step flow)
# [ ] View agent dashboard
# [ ] See real-time metrics update via WebSocket
# [ ] View transaction explorer
# [ ] Search transaction by signature
# [ ] Verify admin can access /api/agents
# [ ] Verify BYOA endpoint is reachable

# Expected: All tests pass, no errors in browser console
```

### Extended Validation (30 minutes - 2 hours)

```bash
# 1. Performance baseline
lighthouse --output json https://<vercel-domain> > lighthouse.json
jq '.categories | .performance.score' lighthouse.json
# Expected: > 80

# 2. Database performance
railway logs --service sophia | grep "slow query"
# Expected: No slow queries

# 3. Error rate monitoring
railway logs --service sophia | grep "ERROR\|error" | wc -l
# Expected: < 5 errors (minor startup warnings OK)

# 4. Transaction flow end-to-end
# Submit a test intent via BYOA endpoint (if configured)
# Verify:
# ✓ Intent accepted
# ✓ Transaction submitted to mainnet
# ✓ Transaction indexed in explorer
# ✓ WebSocket notified frontend

# 5. Rate limiting verification
# Simulate rate limit: 31 requests in 60s
for i in {1..31}; do
  curl -s https://sophia-production-1a83.up.railway.app/api/health &
done
wait
# Expected: Request #31+ returns 429 Too Many Requests
```

### Sign-Off Checklist

```
Deployment ID: _______________  Date: __________
Deployed By: _______________

Immediate Checks (0-5 min)
[ ] Backend health: 5/5 OK
[ ] Database connectivity: OK
[ ] RPC provider: OK
[ ] Frontend renders: OK

Smoke Tests (5-30 min)
[ ] User login: OK
[ ] Agent creation: OK
[ ] Dashboard metrics: OK
[ ] WebSocket real-time: OK
[ ] Transaction explorer: OK
[ ] Admin API: OK

Extended Validation (30 min - 2 hr)
[ ] Performance score > 80
[ ] Error rate < 1%
[ ] No slow queries
[ ] End-to-end transaction flow: OK

Post-Deployment
[ ] Monitoring alerts configured
[ ] Team notified
[ ] Release notes published
[ ] Rollback plan ready

Approval: _______________  Date: _______
```

---

## Rollback Procedures

### Scenario: Critical Bug Detected Post-Deployment

#### Option 1: Fast Rollback (Last Working Commit)

```bash
# 1. Identify last working commit
git log --oneline -10
# Pick the commit before the problematic one

# 2. Revert to that commit (creates new commit)
git revert <commit-hash>
# This creates a new commit that undoes changes

# 3. Push to main (Railway auto-deploys)
git push origin main

# 4. Monitor deployment
railway logs --service sophia --follow

# 5. Verify rollback success
curl -s https://sophia-production-1a83.up.railway.app/api/health | jq .

# Expected: Service healthy within 3-5 minutes
```

**Rollback Time**: 2-3 minutes (including Railway redeployment)

#### Option 2: Emergency Container Restart (No Code Change)

Use if the bug is intermittent/infrastructure-related:

```bash
# 1. Restart backend
railway service restart sophia

# 2. Wait for health check to pass
for i in {1..30}; do
  health=$(curl -s https://sophia-production-1a83.up.railway.app/api/health | jq .success)
  if [ "$health" == "true" ]; then
    echo "✓ Service healthy at attempt $i"
    break
  fi
  sleep 10
done

# Expected: Healthy within 30-120 seconds
```

**Restart Time**: 30-120 seconds

#### Option 3: Previous Docker Image (Railway-Specific)

If you need to deploy an older version:

```bash
# 1. List recent deployments
railway deployment list

# 2. Redeploy a previous deployment
railway deployment deploy <previous-deployment-id>

# 3. Monitor
railway logs --service sophia --follow
```

**Revert Time**: 1-2 minutes

### Frontend Rollback (Vercel)

```bash
# 1. Go to Vercel Deployments tab
# 2. Find last working deployment (look for "✓ Production")
# 3. Click "Promote to Production"
# 4. Confirm promotion

# Or via CLI:
vercel rollback --confirm

# Verify:
# Wait 1-2 minutes for CDN propagation
# Test frontend at https://<domain>
```

**Rollback Time**: < 2 minutes

### Communication Template

```
INCIDENT ALERT: Production Deployment Rolled Back

Deployment: v1.2.3 → Previous (v1.2.2)
Reason: [Critical bug | Data corruption | Performance | Security]
Duration: [X minutes] downtime
Impact: [Users affected, features unavailable]

Rollback Status: ✓ COMPLETE
  ├─ Backend: v1.2.2 deployed (healthy)
  ├─ Frontend: v1.2.2 deployed (CDN propagating)
  └─ Database: No changes required

Timeline:
  [HH:MM] Issue detected
  [HH:MM] Rollback initiated
  [HH:MM] Rollback complete & verified
  [HH:MM] Monitoring normal operation

Next Steps:
  1. Post-mortem scheduled for [date]
  2. Root cause analysis in progress
  3. v1.2.4 will include fixes

Follow-up: [link to incident post-mortem]
```

---

## Emergency Procedures

### Database Emergency

**Symptom**: Database connection errors, data corruption, or unavailability

```bash
# 1. Check database status
railway status --service Postgres

# 2. View recent logs for errors
railway logs --service Postgres -n 50

# 3. Connect to database directly
psql "$DATABASE_URL" -c "SELECT pg_database.datname, 
  pg_size_pretty(pg_database_bloat_size(datname))
  FROM pg_database;"

# If corrupted:
# 4. Restore from backup
railway database restore --backup-id <backup-id>
# This will restore to point-in-time before corruption

# 5. Verify restoration
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM agents;"

# 6. Restart backend to reset connection pool
railway service restart sophia

# 7. Validate data integrity
npm run test:db-integrity
```

**Recovery Time**: 5-15 minutes

### RPC Provider Emergency

**Symptom**: RPC endpoint unreachable, rate limits exceeded, or network issues

```bash
# 1. Check current RPC health
curl -s https://api.mainnet-beta.solana.com \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'

# 2. Check circuit breaker status in backend logs
railway logs --service sophia | grep "circuit breaker"

# 3. If RPC is down, switch to backup RPC
# Edit Railway environment variable:
railway env set SOLANA_RPC_URL "https://api.solana.com"
# (or another public RPC endpoint)

# 4. Restart backend to pick up new RPC
railway service restart sophia

# 5. Verify connectivity
railway logs --service sophia | grep "RPC health"

# 6. Monitor transaction success rate
# Expected: > 95% within 2 minutes
```

**Recovery Time**: 2-5 minutes

### Memory Leak / Performance Degradation

**Symptom**: Backend slowness, increased response times, memory consumption growing

```bash
# 1. Check current resource usage
railway logs --service sophia | tail -20
# Look for: memory usage, CPU usage

# 2. Identify heavy operations
railway logs --service sophia | grep "slow query\|duration"

# 3. Quick restart (clears memory)
railway service restart sophia

# 4. If issue persists, enable debug logging
railway env set LOG_LEVEL debug
railway service restart sophia

# 5. Collect heap dump for analysis
# Contact DevOps for heap dump
# Analyze with Node clinic or clinic.js

# 6. Temporary mitigation: Scale up replicas
railway scale --service sophia --replicas 2

# 7. Root cause investigation
npm run debug:profile:memory > memory-profile.json
# Send to engineering team for analysis
```

**Recovery Time**: 2-5 minutes (restart), 1+ hours (root cause)

### DDoS / Rate Limit Attack

**Symptom**: Spike in 429 errors, legitimate users cannot access

```bash
# 1. Monitor request rate
railway logs --service sophia | grep "429" | wc -l

# 2. Enable stricter rate limiting (temporary)
railway env set RATE_LIMIT_STRICT true
railway service restart sophia

# 3. Optional: Enable Cloudflare DDoS protection
# Contact DevOps: Enable Cloudflare in front of Railway

# 4. Scale up to handle traffic spike
railway scale --service sophia --replicas 3

# 5. Monitor metrics
railway logs --service sophia --follow

# 6. Once attack subsides, revert settings
railway env set RATE_LIMIT_STRICT false
```

**Mitigation Time**: 2-5 minutes

### Security Incident (Compromised Key)

**Symptom**: Unauthorized access detected, suspicious account activity

```bash
# IMMEDIATE: Stop the service
railway service stop sophia

# 1. Rotate compromised keys
# Generate new ADMIN_API_KEY
NEW_KEY=$(openssl rand -hex 32)
railway env set ADMIN_API_KEY "$NEW_KEY"

# 2. Generate new KEY_ENCRYPTION_SECRET
NEW_SECRET=$(openssl rand -base64 32)
railway env set KEY_ENCRYPTION_SECRET "$NEW_SECRET"

# 3. Audit recent activity
psql "$DATABASE_URL" -c "
  SELECT created_at, agent_id, intent_type 
  FROM intents 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC;"

# 4. Restore service with new keys
railway service start sophia

# 5. Notify security team
# Send incident report with timeline and affected accounts

# 6. Post-incident review
# Schedule meeting to analyze breach origin
# Update security guidelines
# Require password reset for all users
```

**Immediate Response Time**: 5-10 minutes

---

## Related Documentation

- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) — System architecture overview
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-2 operations
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Common issues & solutions
- [MAINNET_READINESS_CHECKLIST.md](./MAINNET_READINESS_CHECKLIST.md) — Pre-launch validation
