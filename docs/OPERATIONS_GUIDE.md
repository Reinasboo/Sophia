# Operations Guide

**Version**: 1.0.0 | **Last Updated**: May 5, 2026 | **Status**: Production-Ready

Day-2 operational procedures, monitoring, troubleshooting, and incident response.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring & Alerting](#monitoring--alerting)
3. [Common Issues & Resolution](#common-issues--resolution)
4. [Performance Optimization](#performance-optimization)
5. [Backup & Recovery](#backup--recovery)
6. [Scaling & Capacity Planning](#scaling--capacity-planning)
7. [Incident Response](#incident-response)
8. [Maintenance Windows](#maintenance-windows)

---

## Daily Operations

### Morning Check (5 minutes)

Perform this check every morning before business hours:

```bash
# 1. System health status
railway status

# Expected output:
# ✓ sophia (backend): healthy, 1/1 replicas running
# ✓ Postgres: healthy
# No errors or warnings

# 2. Check for overnight errors
railway logs --service sophia --since 8h | grep "ERROR\|CRITICAL\|ALERT"

# Expected: No critical errors (minor warnings OK)

# 3. Database connections
railway db shell <<EOF
SELECT datname, count(*) 
FROM pg_stat_activity 
GROUP BY datname;
EOF

# Expected: 10-30 connections (not maxed out)

# 4. Verify RPC connectivity
curl -s https://api.mainnet-beta.solana.com \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .result

# Expected: "ok"

# 5. Check transaction success rate (last 1 hour)
railway logs --service sophia --since 1h | grep "transaction_success_rate"

# Expected: > 95%
```

**Checklist**:
- [ ] All services reporting healthy
- [ ] No critical errors in logs
- [ ] Database connections within limits
- [ ] RPC provider responding
- [ ] Transaction success rate > 95%

### Hourly Monitoring (1 minute)

Set up an automated cron job (or use Railway monitoring):

```bash
#!/bin/bash
# File: /usr/local/bin/agentic-wallet-health-check.sh

BACKEND_URL="https://sophia-production-1a83.up.railway.app"
ALERT_EMAIL="ops@example.com"

# Check 1: API health
health=$(curl -s "$BACKEND_URL/api/health" | jq .success)
if [ "$health" != "true" ]; then
  echo "ALERT: Backend unhealthy" | mail -s "Agentic Wallet ALERT" $ALERT_EMAIL
  exit 1
fi

# Check 2: Database connectivity
db_health=$(railway logs --service sophia --since 1m | grep "query error" | wc -l)
if [ "$db_health" -gt 5 ]; then
  echo "ALERT: High database error rate" | mail -s "Agentic Wallet ALERT" $ALERT_EMAIL
  exit 1
fi

# Check 3: Memory usage
memory_pct=$(railway logs --service sophia --since 5m | grep "memory" | tail -1 | awk '{print $NF}' | sed 's/%//')
if [ "$memory_pct" -gt 80 ]; then
  echo "ALERT: Memory usage at ${memory_pct}%" | mail -s "Agentic Wallet ALERT" $ALERT_EMAIL
  exit 1
fi

exit 0
```

**Setup cron**:
```bash
# Every hour, at minute 0
0 * * * * /usr/local/bin/agentic-wallet-health-check.sh
```

### Daily Report (EOD, 10 minutes)

Generate a daily summary for the team:

```bash
#!/bin/bash
# File: generate-daily-report.sh

echo "=== Agentic Wallet Daily Report ===" > daily-report.txt
echo "Date: $(date)" >> daily-report.txt
echo "" >> daily-report.txt

# Uptime
echo "## Uptime" >> daily-report.txt
railway logs --service sophia --since 24h | grep "service started\|container restarted" >> daily-report.txt

# Errors
echo "" >> daily-report.txt
echo "## Errors (last 24h)" >> daily-report.txt
railway logs --service sophia --since 24h | grep "ERROR\|CRITICAL" | wc -l >> daily-report.txt

# Transactions
echo "" >> daily-report.txt
echo "## Transactions (last 24h)" >> daily-report.txt
railway db shell <<EOF >> daily-report.txt
SELECT DATE(created_at), COUNT(*) FROM transactions 
WHERE created_at > NOW() - INTERVAL '24 hours' 
GROUP BY DATE(created_at);
EOF

# Performance
echo "" >> daily-report.txt
echo "## Performance Metrics" >> daily-report.txt
echo "Avg Response Time (API):" >> daily-report.txt
railway logs --service sophia --since 24h | grep "response_time_ms" >> daily-report.txt

# Send report
mail -s "Daily Report: Agentic Wallet" ops@example.com < daily-report.txt
```

### Weekly Maintenance

Every Monday, 2 AM UTC (off-peak):

```bash
# 1. Update dependencies for security patches
npm audit
npm audit fix
# If breaking changes: coordinate with team

# 2. Vacuum database (cleanup)
railway db shell <<EOF
VACUUM ANALYZE agents;
VACUUM ANALYZE transactions;
VACUUM ANALYZE intents;
REINDEX INDEX agents_agent_id_idx;
EOF

# 3. Review and archive old logs
railway logs --service sophia --since 7d > logs-archive-$(date +%Y-%m-%d).log

# 4. Backup current state
railway database backup
# Verify backup created
railway database backups list | head -1

# 5. Test restore procedure (documentation update only)
# Don't actually restore unless needed

# 6. Performance metrics review
# Check slow query logs
# Identify N+1 queries
# Plan optimizations
```

### Monthly Reviews

First Tuesday of month:

```bash
# 1. Security audit
npm audit --audit-level=high
npm outdated --long

# 2. Capacity planning
# Review transaction volume trend
# Estimate next 3 months growth
# Plan scaling if needed

# 3. Cost analysis
# Review Railway billing
# Review Vercel usage
# Optimize if possible

# 4. Disaster recovery drill
# Test backup restore
# Verify RTO targets
# Document lessons learned

# 5. Documentation review
# Check if docs are still accurate
# Update for any infrastructure changes
# Review runbooks for clarity
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

| Metric                   | Threshold | Action                   |
| ------------------------ | ---------- | ------------------------ |
| **Availability**         | < 99.5%    | Page on-call engineer    |
| **Error Rate**           | > 1%       | Check logs, investigate  |
| **Response Time (p95)**  | > 2s       | Check database, scale if needed |
| **Database Connections** | > 40/50    | Increase pool or optimize queries |
| **Memory Usage**         | > 80%      | Investigate leak, restart if needed |
| **Disk Usage**           | > 90%      | Clean old logs, archive DB |
| **RPC Rate Limit**       | > 80%      | Batch requests, optimize |

### Setting Up Monitoring (Railway)

**Via Railway Dashboard**:
1. Go to Project → Monitoring
2. Enable metrics:
   - [ ] CPU usage
   - [ ] Memory usage
   - [ ] Disk I/O
   - [ ] Network I/O
   - [ ] Request count
   - [ ] Error rate

**Via Custom Metrics** (if using external monitoring):

```typescript
// src/utils/metrics.ts
import { StatsD } from 'node-statsd';

const client = new StatsD({
  host: 'datadog.example.com',
  port: 8125,
  prefix: 'agentic_wallet.'
});

export function recordMetric(name: string, value: number, tags: string[] = []) {
  client.gauge(name, value, tags);
}

export function recordTiming(name: string, duration: number, tags: string[] = []) {
  client.timing(name, duration, tags);
}

// Usage:
recordTiming('api.request', responseTime, ['endpoint:/api/agents', 'method:GET']);
recordMetric('db.connections', connectionCount, ['pool:main']);
```

### Alert Routing

**Critical Alerts** (page on-call):
- Backend offline (health check fails)
- Database unavailable
- Transaction success rate < 90%
- Memory leak detected (growing > 5%/min)

**High Priority** (send to Slack #alerts):
- Error rate > 5%
- Response time p95 > 5s
- Database query time > 10s
- Rate limit triggered

**Medium Priority** (daily digest):
- Disk usage growing
- Minor dependency updates available
- Cost trending up
- Non-critical warnings

**Setup Slack Integration**:
```bash
# Create Slack webhook
# Post to #alerts channel

curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Server status check FAILED"}' \
  $SLACK_WEBHOOK_URL
```

---

## Common Issues & Resolution

### Issue 1: Backend Not Responding

**Symptom**: `curl https://sophia-production-1a83.up.railway.app/api/health` times out

**Investigation**:
```bash
# Check service status
railway status

# Check logs for startup errors
railway logs --service sophia -n 100

# Check memory/CPU
railway logs --service sophia | tail -5  # Look for resource metrics

# Check database connection
railway logs --service sophia | grep "Connected to PostgreSQL"
```

**Resolution**:
```bash
# Option 1: Service is crashing (quick restart)
railway service restart sophia
sleep 30
curl -s https://sophia-production-1a83.up.railway.app/api/health

# Option 2: OOM (Out of Memory) - scale up
railway service update sophia --memory 1Gi  # Increase from 512MB to 1GB
railway service restart sophia

# Option 3: Database issue - verify connectivity
psql "$DATABASE_URL" -c "SELECT 1;"  # Should return 1

# Option 4: Rollback to previous version
git revert HEAD --no-edit
git push origin main
# Wait 3-5 minutes for deployment
```

**Root Cause Check**:
```bash
# View recent commits
git log --oneline -5

# Check if last commit has issues
git diff HEAD~1 HEAD

# Run tests on last commit
git stash
npm test
```

### Issue 2: Database Connections Maxed Out

**Symptom**: Database errors like `connect ECONNREFUSED` or `connection pool exhausted`

**Investigation**:
```bash
# Check current connections
psql "$DATABASE_URL" -c "
  SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
"

# Find long-running queries
psql "$DATABASE_URL" -c "
  SELECT pid, usename, state, query, query_start 
  FROM pg_stat_activity 
  WHERE query_start < now() - INTERVAL '5 minutes'
  ORDER BY query_start;"

# Check for connection leaks
railway logs --service sophia | grep "pool\|connection" | tail -20
```

**Resolution**:
```bash
# Option 1: Kill idle connections (temporary)
psql "$DATABASE_URL" -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE state = 'idle' AND query_start < now() - INTERVAL '1 hour';"

# Option 2: Increase connection pool size
# Edit .env
# DATABASE_MAX_CONNECTIONS=50  # Increase from 30
railway env set DATABASE_MAX_CONNECTIONS 50
railway service restart sophia

# Option 3: Identify and fix N+1 queries
# Check application logs for repeated similar queries
# Refactor database queries to batch

# Option 4: Scale database
# Contact Railway support: increase PostgreSQL connection limit
```

### Issue 3: High Memory Usage / Memory Leak

**Symptom**: Memory usage grows from 100MB to 400MB over hours; service slows down

**Investigation**:
```bash
# Check memory trend
railway logs --service sophia --since 24h | grep "memory" | tail -20

# Generate heap dump (Node.js)
kill -USR2 <pid>  # Trigger heap snapshot
# Check /tmp for heap dump files

# Identify memory hog modules
npm ls --all | grep large-package

# Check for circular references in code
grep -r "\.on\(" src/ --include="*.ts" | grep -v "\.once\("
```

**Resolution**:
```bash
# Immediate: Restart service (clears memory)
railway service restart sophia

# Short-term: Reduce cache TTL
railway env set CACHE_TTL 300  # Reduce from 600s
railway service restart sophia

# Long-term:
# 1. Enable Node heap profiling
# 2. Run under production load
# 3. Analyze heap dump with clinic.js or Chrome DevTools
# 4. Fix memory leaks in event listeners / socket cleanup

# Prevention:
# - Use --max-old-space-size flag
railway env set NODE_OPTIONS "--max-old-space-size=384"
```

### Issue 4: Transactions Failing (Low Success Rate)

**Symptom**: Transaction success rate dropped from 98% to 75%; users reporting failed transactions

**Investigation**:
```bash
# Check recent transaction errors
railway logs --service sophia | grep "transaction.*error\|simulation failed" | tail -20

# Check RPC health
curl -s https://api.mainnet-beta.solana.com -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .

# Check for rate limiting
railway logs --service sophia | grep "rate limit\|429" | wc -l

# Review transaction details
psql "$DATABASE_URL" -c "
  SELECT status, error, COUNT(*) 
  FROM transactions 
  WHERE created_at > NOW() - INTERVAL '1 hour' 
  GROUP BY status, error;"
```

**Resolution**:
```bash
# Option 1: RPC provider is degraded - switch RPC
railway env set SOLANA_RPC_URL "https://api.solana.com"
railway service restart sophia
# Monitor success rate for 5 minutes

# Option 2: Rate limiting triggered - reduce transaction rate
# Implement exponential backoff in transaction submission
# Or increase rate limit quota

# Option 3: Wallet balance insufficient - check
psql "$DATABASE_URL" -c "
  SELECT agent_id, wallet_address FROM agents 
  WHERE status = 'active' LIMIT 10;"
# Check wallet balances on explorer

# Option 4: Fee market spike - adjust fee strategy
# Edit transaction builder to use dynamic fees
railway env set PRIORITY_FEE_PERCENTILE 60  # Use median + 60%
railway service restart sophia
```

### Issue 5: API Response Time Slow

**Symptom**: API requests taking 5-10s; users experiencing slow dashboard loads

**Investigation**:
```bash
# Check database query time
railway logs --service sophia | grep "duration" | sort -t= -k2 -rn | head -10

# Identify slow endpoints
railway logs --service sophia | grep "GET\|POST" | awk '{print $1 " " $4 " " $NF}' | sort | uniq -c | sort -rn

# Check database indexes
psql "$DATABASE_URL" -c "
  SELECT schemaname, tablename, indexname 
  FROM pg_indexes 
  WHERE tablename IN ('agents', 'transactions', 'intents');"

# Analyze query plan
psql "$DATABASE_URL" -c "
  EXPLAIN ANALYZE 
  SELECT * FROM agents WHERE agent_id = 'some-id';"
```

**Resolution**:
```bash
# Option 1: Add missing index
psql "$DATABASE_URL" -c "
  CREATE INDEX idx_transactions_agent_id ON transactions(agent_id);
  ANALYZE transactions;
"

# Option 2: Reduce N+1 queries
# Review application code for SELECT in loop
# Implement batch queries / JOIN

# Option 3: Enable query caching
railway env set QUERY_CACHE_TTL 60
railway service restart sophia

# Option 4: Scale database replicas
# Contact Railway support: add read replica
# Update connection string to route reads to replica

# Option 5: Upgrade backend resources
railway service update sophia --cpu 1000m  # Increase CPU
railway service restart sophia
```

---

## Performance Optimization

### Database Query Optimization

**Find Slow Queries**:
```bash
# Enable slow query log
railway db shell <<EOF
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1 second
SELECT pg_reload_conf();
EOF

# Review slow queries
railway logs --service Postgres | grep "log_min_duration"
```

**Add Indexes**:
```bash
# Analyze query plans
EXPLAIN ANALYZE SELECT * FROM agents WHERE user_id = '123' AND status = 'active';

# If sequential scan: add index
CREATE INDEX idx_agents_user_status ON agents(user_id, status);
ANALYZE agents;

# Verify index used
EXPLAIN SELECT * FROM agents WHERE user_id = '123' AND status = 'active';
# Should show: Index Scan on idx_agents_user_status
```

**Optimize Connection Pooling**:
```bash
# Current pool config
psql "$DATABASE_URL" -c "SHOW max_connections;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"

# If many idle connections, adjust node-pg pool
railway env set NODE_POOL_MIN 5
railway env set NODE_POOL_MAX 20
railway service restart sophia
```

### API Response Caching

**Add Response Caching**:
```typescript
// src/middleware/cache.ts
import redis from 'redis';

const client = redis.createClient();

export function cacheResponse(ttl: number = 300) {
  return async (req, res, next) => {
    const key = `cache:${req.method}:${req.url}`;
    
    // Check cache
    const cached = await client.get(key);
    if (cached) {
      return res.json(JSON.parse(cached));
    }
    
    // Capture response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      client.setEx(key, ttl, JSON.stringify(data));
      return originalJson(data);
    };
    
    next();
  };
}

// Usage:
router.get('/api/agents/:id', cacheResponse(60), getAgentHandler);
```

### Frontend Performance

**Enable ISR (Incremental Static Regeneration)**:
```typescript
// pages/agents/index.tsx
export async function getStaticProps() {
  const agents = await fetchAgents();
  
  return {
    props: { agents },
    revalidate: 60,  // Revalidate every 60 seconds
  };
}
```

**Optimize Images**:
```typescript
import Image from 'next/image';

// Before (unoptimized)
<img src="/dashboard-chart.png" width="800" height="600" />

// After (optimized)
<Image 
  src="/dashboard-chart.png" 
  width={800} 
  height={600}
  quality={75}
  placeholder="blur"
/>
```

---

## Backup & Recovery

### Database Backup Strategy

**Automatic Backups** (Railway):
```bash
# Check backup schedule
railway database backups list

# Expected output:
# Backup ID          Created At              Size
# bk_123456789       2026-05-05T02:00:00Z    125.5 MB
# bk_987654321       2026-05-04T02:00:00Z    124.2 MB

# Retention: 7 days (configurable)
```

**Manual Backup** (before major changes):
```bash
# Create backup
railway database backup

# Verify backup created
railway database backups list | head -1
```

**Restore from Backup**:
```bash
# List available backups
railway database backups list

# Restore (WARNING: This overwrites current database!)
railway database restore --backup-id bk_123456789

# Verify restoration
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM agents;"
```

### Transaction History Archive

**Monthly Archive**:
```bash
# Export transactions older than 30 days
psql "$DATABASE_URL" -c "
  COPY (SELECT * FROM transactions WHERE created_at < NOW() - INTERVAL '30 days')
  TO STDOUT CSV HEADER" > transactions-archive-$(date +%Y-%m).csv

# Upload to cold storage
aws s3 cp transactions-archive-*.csv s3://backups/transactions/

# Delete archived transactions (optional, for space)
# psql "$DATABASE_URL" -c "DELETE FROM transactions WHERE created_at < NOW() - INTERVAL '30 days';"
```

### Code Backup Strategy

**Git Backup** (automatic):
```bash
# Verify remote backup
git remote -v
# Expected: origin pointing to GitHub

# Create additional backup remote (optional)
git remote add backup https://backup-service.com/repo.git
git push backup main
```

---

## Scaling & Capacity Planning

### When to Scale

**Scale Backend (Replicas)** when:
- CPU usage consistently > 70%
- Memory usage > 80%
- Response time p95 > 3s
- Error rate increasing

```bash
# Increase replicas
railway scale --service sophia --replicas 2  # From 1 to 2

# Monitor
railway logs --service sophia --follow

# Verify load balancing
# All traffic should distribute across replicas
```

**Scale Database** when:
- Connection pool exhausted
- Query time degrading
- Disk usage > 80%

```bash
# Increase database resources
railway service update Postgres --memory 2Gi  # From 1GB to 2GB

# Or add read replica (contact Railway support)
```

**Scale Frontend** when:
- CDN cache hit rate < 90%
- Build time > 5 minutes

```bash
# Frontend auto-scales via Vercel; nothing to do
# Monitor Vercel dashboard for build performance

# Optimize if needed:
# - Reduce bundle size (npm ls --depth=0)
# - Enable compression (next.config.js)
# - Use dynamic imports for large components
```

### Capacity Planning (6-month forecast)

**Data Points to Track**:
- Transactions per day (trend)
- Agents created per week (trend)
- Database size growth (MB/week)
- Peak concurrent users
- API request volume (requests/sec)

**Planning Template**:
```
Current State (May 2026):
- Transactions/day: 1,000
- Database size: 500 MB
- Peak load: 50 req/sec
- Agents: 250

Forecast (November 2026):
- Transactions/day: 5,000 (5x growth)
- Database size: 2.5 GB (5x growth)
- Peak load: 250 req/sec (5x growth)
- Agents: 1,250 (5x growth)

Required Scaling:
- Backend: 3 replicas (from 1) → $150/month increase
- Database: 4GB RAM (from 1GB) → $100/month increase
- Estimated total: $250/month additional cost

Timeline:
- Month 1-2: Monitor growth rate
- Month 3: Plan scaling
- Month 4: Execute scaling
- Month 5-6: Validate and optimize
```

---

## Incident Response

### Incident Severity Levels

| Level    | Response Time | Examples                          | On-Call |
| -------- | ------------- | --------------------------------- | ------- |
| **SEV-1** | Immediate     | Backend offline, data loss         | Page    |
| **SEV-2** | 15 minutes    | Error rate > 10%, major slowdown  | Notify  |
| **SEV-3** | 1 hour        | Error rate 1-5%, minor slowdown   | Ticket  |
| **SEV-4** | Next business day | Documentation, optimization | Backlog |

### Incident Response Playbook

**Step 1: Detect & Alert** (0-2 min)
```bash
# Automated alert triggers
# or manual: "I noticed something wrong"

# Assign incident commander
# Create incident channel (Slack)
```

**Step 2: Initial Response** (2-5 min)
```bash
# Commander: Check service status
railway status

# Get current logs
railway logs --service sophia -n 100

# Engage subject matter expert (SME)
# SME: Investigate root cause
```

**Step 3: Stabilize** (5-30 min)
```bash
# Implement workaround or fix
# - Restart service
# - Scale up
# - Rollback deployment
# - Switch RPC provider
# - etc.

# Verify stabilization
curl -s https://sophia-production-1a83.up.railway.app/api/health
# Keep checking for 5 minutes
```

**Step 4: Communicate** (Continuous)
```bash
# Update Slack channel every 5 minutes
# Notify affected customers if needed
# Give ETA for resolution
```

**Step 5: Full Resolution** (0.5-4 hours)
```bash
# Confirm issue is resolved
# Monitor metrics (error rate, latency) for 30 min
# Document RCA (root cause analysis)
```

**Step 6: Post-Mortem** (24-48 hours)
```bash
# Team meeting to discuss:
# - What happened?
# - Why did it happen?
# - What should we do differently?
# - Action items?

# Create GitHub issue with findings
# Update runbooks if needed
```

### Incident Communication Template

```
🚨 INCIDENT: [Name]
Status: [INVESTIGATING | MITIGATING | RESOLVED]
Duration: [X minutes]
Impact: [Describe user impact]
Last Update: [Time] by [Name]

Timeline:
[HH:MM] Issue detected by [system/person]
[HH:MM] Investigation started
[HH:MM] Root cause identified
[HH:MM] Mitigation implemented
[HH:MM] Service restored
[HH:MM] All clear, normal operations

Next Steps:
- Post-mortem scheduled for [date]
- Preventive measures: [list]

Questions? [contact]
```

---

## Maintenance Windows

### Planned Maintenance Schedule

**Monthly** (First Sunday, 2-3 AM UTC):
- Database maintenance (VACUUM, REINDEX)
- Security patches (npm audit fix)
- Backup verification

**Quarterly** (First day of quarter, 3-4 AM UTC):
- Major dependency updates
- Infrastructure optimization
- Disaster recovery drill

### Maintenance Procedures

**Before Maintenance** (24 hours):
```bash
# 1. Announce to users
# Message in Discord/Twitter: "Scheduled maintenance..."

# 2. Create backup
railway database backup
# Verify backup created

# 3. Notify team
# Send Slack message with maintenance window
```

**During Maintenance** (2 AM UTC):
```bash
# 1. Stop accepting requests (optional)
# Set maintenance mode banner

# 2. Perform maintenance
npm audit fix
npm run build
# etc.

# 3. Test thoroughly
npm test
npm run mainnet:check

# 4. Deploy
git push origin main
# Wait for deployment to complete

# 5. Verify
curl -s https://sophia-production-1a83.up.railway.app/api/health
```

**After Maintenance**:
```bash
# 1. Monitor for 30 minutes
railway logs --service sophia --follow

# 2. Announce completion
# Message in Discord: "Maintenance complete, all systems operational"

# 3. Document
# Add entry to changelog
# Record any issues encountered

# 4. Review metrics
# Check if any regressions introduced
```

---

## Related Documentation

- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) — System architecture
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Deployment procedures
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — Advanced troubleshooting
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) — Security model
