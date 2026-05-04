# Mainnet Readiness Checklist

This checklist is the required gate before production deployment.

## 1) Environment

- Set `NODE_ENV=production`
- Set `SOLANA_NETWORK=mainnet-beta`
- Set `SOLANA_RPC_URL` to a mainnet provider endpoint
- Set `DATABASE_URL` to production Postgres
- Set `HELIUS_WEBHOOK_SECRET`
- Set strong, unique values for:
  - `KEY_ENCRYPTION_SECRET`
  - `ADMIN_API_KEY`

## 2) Automated validation

Generate a mainnet env template first:

```bash
npm run mainnet:migrate-env
```

This writes `.env.mainnet` with required production keys and placeholders.

Run:

```bash
npm run mainnet:check
```

This command fails if required production settings are missing or invalid.

## 3) Devnet-only behavior disabled

Production blocks:

- `REQUEST_AIRDROP` in BYOA registration
- `REQUEST_AIRDROP` in BYOA intent submission
- `REQUEST_AIRDROP` execution in `IntentRouter`
- Legacy orchestrator airdrop execution outside devnet

## 4) Data + storage

- Ensure Postgres is reachable from runtime network
- Confirm tracker tables are created on startup
- Verify webhook ingestion persists to Postgres

## 5) GMGN integration

If GMGN is enabled:

- Ensure `gmgn` binary is installed in runtime environment
- Set `GMGN_CLI_PATH` if binary is not on PATH
- Keep `GMGN_CREATE_INTENTS` behavior intentional for your execution policy

## 6) Deployment smoke checks

- Health endpoint: `/api/health`
- Submit a non-airdrop BYOA intent and verify execution
- Verify transaction indexing and event querying
- Verify no devnet endpoints are present in logs/config

## 7) Rollback readiness

- Backup `data/` and Postgres before deployment
- Keep previous release artifact available
- Have RPC provider failover endpoint configured
