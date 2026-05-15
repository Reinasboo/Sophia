# Infrastructure Improvement Plan

**Scope:** Full-stack Solana infrastructure across backend, frontend, persistence, deployment, CI/CD, observability, and operations.

**Prepared for:** Senior engineering execution after review

## Why this document exists

The repository already has a credible production skeleton: a TypeScript backend, a Next.js frontend, Railway and Vercel deployment configs, GitHub Actions, structured logging, Solana RPC integration, and multiple health endpoints. The main opportunity is not to invent a new stack. It is to remove drift, reduce state fragmentation, harden delivery, and turn the current production-branded system into a system that is easier to operate, safer to change, and more resilient under Solana mainnet load.

## What exists today

- Backend entrypoint: [src/index.ts](../src/index.ts)
- API/server surface: [src/server.ts](../src/server.ts)
- Config and environment validation: [src/utils/config.ts](../src/utils/config.ts)
- Structured logging: [src/utils/logger.ts](../src/utils/logger.ts)
- File-backed shared state store: [src/utils/store.ts](../src/utils/store.ts)
- Hybrid bearer token persistence: [src/utils/bearer-token-store.ts](../src/utils/bearer-token-store.ts) and [src/utils/bearer-token-store-db.ts](../src/utils/bearer-token-store-db.ts)
- Data indexing layer with Postgres/file fallback: [src/data/tracker.ts](../src/data/tracker.ts)
- Mainnet readiness checks: [scripts/validate-mainnet-readiness.ts](../scripts/validate-mainnet-readiness.ts)
- Root package scripts: [package.json](../package.json)
- Frontend package scripts: [apps/frontend/package.json](../apps/frontend/package.json)
- Docker runtime: [Dockerfile](../Dockerfile)
- Railway deployment config: [railway.json](../railway.json)
- Vercel deployment config: [vercel.json](../vercel.json)
- CI/CD and security automation: [.github/workflows/ci.yml](../.github/workflows/ci.yml), [.github/workflows/release.yml](../.github/workflows/release.yml), [.github/workflows/security.yml](../.github/workflows/security.yml)

## Current strengths

- Solana-specific runtime boundaries already exist: the wallet layer owns signing, the RPC layer owns chain interaction, and the frontend is explicitly observational.
- Runtime configuration is schema-validated and production guards are present for core mainnet settings.
- There is already a strong foundation for health checks, data indexing, and structured logs.
- CI covers linting, tests, build verification, and dependency audit.
- Security automation exists through secret scanning, CodeQL, and Dependabot configuration.

## Primary infrastructure gaps

### 1. State is still fragmented

The system currently mixes JSON file persistence, Postgres persistence, and fallback paths. That is reasonable for development, but it introduces avoidable operational variance once the system is running at production scale.

Examples:

- Shared state store remains file-backed in [src/utils/store.ts](../src/utils/store.ts).
- Bearer token storage can use Postgres, with file fallback in [src/utils/bearer-token-store-db.ts](../src/utils/bearer-token-store-db.ts).
- Data indexing can persist to Postgres or to disk-backed state in [src/data/tracker.ts](../src/data/tracker.ts).

Impact:

- Backups and restores are harder to standardize.
- Incident response is more complicated because each subsystem can fail differently.
- There is a higher risk of state divergence between local, staging, and production environments.
- Durability guarantees are harder to reason about and verify consistently.

### 2. Runtime versions drift across surfaces

The root runtime, CI matrix, Docker image, and docs do not read as a single, deliberate standard.

Observed spread:

- Root engines allow Node 18+ in [package.json](../package.json).
- CI tests Node 18, 20, and 22 in [.github/workflows/ci.yml](../.github/workflows/ci.yml).
- Docker runtime uses Node 24 in [Dockerfile](../Dockerfile).
- Railway pins Node 22.13.0 in [railway.json](../railway.json).

Impact:

- More upgrade surface.
- More chance of environment-specific bugs.
- Harder to reproduce production behavior locally.

### 3. Deployment is configured, but not yet strongly automated end-to-end

The repo has deployment files, but there is still no visible infrastructure-as-code layer for the runtime topology, no explicit migration lifecycle, and no release-stage smoke-test gate.

Impact:

- Changes can ship without a full environment parity check.
- Database schema and application lifecycle are coupled more loosely than they should be.
- Rollback confidence is lower than it should be for a mainnet-facing system.

### 4. Observability is mostly logs plus health endpoints

There is structured logging and some health endpoints, but no explicit metrics pipeline, tracing pipeline, alerting contract, or incident dashboard in the codebase.

Impact:

- Harder to detect regressions in RPC behavior, indexing lag, and wallet execution latency.
- Harder to answer root-cause questions quickly when Solana RPCs degrade.
- Harder to define SLOs and keep them honest.

### 5. RPC resilience is present but not fully operationalized

The code has failover-aware RPC components, health checks, and retry logic, but the production strategy appears to depend heavily on configuration discipline rather than an enforced operational policy.

Impact:

- A single bad RPC choice can still become a performance bottleneck.
- No clear SLO-bound routing policy is documented in code.
- Failover behavior needs stronger testing under real outage scenarios.

### 6. CI is solid, but still underpowered for release confidence

Current CI validates lint, tests, build, and audit. That is a good baseline, but for a system that can move value on chain, it should also validate deployment shape and critical user flows more aggressively.

Missing or weak areas:

- Automated smoke tests against a deployed preview or staging environment.
- Artifact retention for test/build evidence.
- Stronger matrix separation between unit, integration, and e2e signals.
- Explicit mainnet-readiness gating for release candidates.

### 7. Security posture is good for a startup, not yet complete for an operations-heavy wallet system

The repo has security controls, but the next layer is lifecycle governance:

- secret rotation discipline,
- environment-specific key separation,
- admin access auditing,
- storage encryption lifecycle,
- incident runbooks,
- and privileged-action review paths.

### 8. Frontend delivery is functional, but build reproducibility can improve

The frontend build path in [apps/frontend/package.json](../apps/frontend/package.json) uses `npm install` in deployment config instead of the more reproducible `npm ci` pattern. That is a small detail, but for a delivery chain it matters.

Impact:

- More nondeterministic installs.
- Higher chance of version skew between local and deployment.

## Improvement priorities

### Priority A: Make state durable and predictable

Objective: one clear persistence model per subsystem, with explicit fallbacks only where they are intentionally required.

Actions:

1. Define the canonical store for each state class: wallets, agents, tokens, intents, events, and indexing state.
2. Move production-critical state to Postgres with migrations.
3. Keep file-backed storage only for local dev or explicit emergency fallback.
4. Add backup and restore verification for every persistent table or file that remains operationally relevant.

### Priority B: Standardize the runtime and delivery contract

Objective: one supported Node baseline, one reproducible install strategy, one documented deployment shape.

Actions:

1. Pick a single supported Node major for backend production.
2. Align CI, Docker, Railway, and local development to that baseline.
3. Replace deployment installs with lockfile-driven installs where possible.
4. Add build-time checks that fail when environment assumptions diverge.

### Priority C: Add real observability

Objective: detect failures before users do.

Actions:

1. Emit request, job, wallet, and RPC latency metrics.
2. Track Solana RPC error rates and failover counts.
3. Track indexing lag and webhook health as first-class SLOs.
4. Add alerting around wallet execution failures, backlog growth, and repeated auth failures.

### Priority D: Make release confidence high enough for mainnet operations

Objective: no release without a meaningful production-shaped validation chain.

Actions:

1. Add staged smoke tests against a deployed environment.
2. Split unit, integration, and e2e signals in CI.
3. Capture deployment artifacts and logs for failed runs.
4. Gate release tagging on the full validation matrix.

### Priority E: Harden Solana-specific operational paths

Objective: reduce mainnet failure modes unique to Solana and intent-based execution.

Actions:

1. Make RPC failover deterministic and observable.
2. Verify transaction simulation and retry behavior under degraded RPC conditions.
3. Validate token decimal lookup, memo attachment, and confirmation tracking under real network variance.
4. Test webhook backfill and indexing recovery with restart scenarios.

## Execution roadmap

### Phase 1: Foundation cleanup

Deliverables:

- Runtime version standardization.
- Canonical storage decisions.
- Reproducible install strategy.
- Mainnet readiness checklist updated to match actual deployment behavior.

### Phase 2: Persistence and recovery

Deliverables:

- Postgres schema ownership for production state.
- Migrations or schema bootstrap strategy.
- Backup and restore playbook.
- File-fallback policy documented and limited.

### Phase 3: Observability and reliability

Deliverables:

- Metrics and tracing.
- SLO definitions.
- Alerts for RPC, indexing, auth, and wallet execution.
- Incident runbooks.

### Phase 4: Release engineering

Deliverables:

- Preview/staging smoke tests.
- Release gating in CI.
- Deployment evidence capture.
- Rollback automation.

## What I would execute first

If we start implementation next, I would begin with these in order:

1. Standardize the Node runtime and install path across [package.json](../package.json), [Dockerfile](../Dockerfile), [railway.json](../railway.json), and [.github/workflows/ci.yml](../.github/workflows/ci.yml).
2. Decide the canonical production persistence model for each state category and remove accidental ambiguity.
3. Add a real migration/seed strategy for production Postgres state.
4. Add production-shaped smoke tests and release gates.
5. Add metrics and alerting for RPC, indexing, and wallet execution.

## Success criteria

The infrastructure is meaningfully improved when:

- Production state has a clearly documented owner and storage path.
- A fresh deploy behaves the same as the previous deploy under the same config.
- A failed Solana RPC or webhook does not require manual guesswork to diagnose.
- Releases are blocked by automated checks that reflect real operational risk.
- The mainnet checklist becomes a confirmation of reality, not a wish list.

## Notes for implementation

- Keep changes minimal and production-minded.
- Avoid refactoring unrelated surfaces while the storage and delivery contracts are being cleaned up.
- Add tests with each change that affects persistence, deployment, or Solana execution behavior.
