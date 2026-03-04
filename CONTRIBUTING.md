# Contributing to Agentic Wallet

Thank you for helping improve Agentic Wallet. This guide defines the development,
collaboration, and review standards used for this repository.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Standard](#commit-message-standard)
- [Pull Request Process](#pull-request-process)
- [PR Readiness Checklist](#pr-readiness-checklist)
- [Code Style](#code-style)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Security](#security)

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
Please report unacceptable behavior to [security@agentic-wallet.dev](mailto:security@agentic-wallet.dev).

---

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally.
3. Create a branch for your change (see [Branch Naming Convention](#branch-naming-convention)).
4. Make changes following project standards.
5. Validate locally (lint, test, build) before opening a PR.

---

## Development Setup

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0 (20 recommended) |
| npm | ≥ 9.0 |
| Git | latest |

### Installation

```bash
git clone https://github.com/<your-username>/Agentic-wallet.git
cd Agentic-wallet
npm install
cd apps/frontend
npm install
cd ../..
cp .env.example .env
```

### Running Locally

```bash
# Start both backend and frontend
npm run dev

# Or run individually
npm run dev:backend
npm run dev:frontend
```

### Running Tests

```bash
npm test -- --run
```

---

## Branch Naming Convention

Use `<prefix>/<short-description>` in kebab-case.

| Prefix | Purpose |
|---|---|
| `feat/` | New functionality |
| `fix/` | Bug fix |
| `docs/` | Documentation updates |
| `test/` | Test additions or changes |
| `ci/` | Workflow and pipeline changes |
| `chore/` | Maintenance and tooling |
| `security/` | Security hardening |
| `refactor/` | Code restructuring (no behavior change) |

**Examples:**

- `feat/wallet-policy-v2`
- `fix/byoa-intent-validation`
- `docs/readme-badge-refresh`
- `security/upgrade-dependencies`

---

## Commit Message Standard

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

**Format:**

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `docs`, `test`, `ci`, `chore`, `refactor`, `perf`, `security`

**Scopes:** `agent`, `wallet`, `byoa`, `rpc`, `api`, `frontend`, `ci`, `deps`

**Examples:**

```
feat(agent): add configurable strategy parameter validation
fix(wallet): handle transient RPC failure on simulation
docs(readme): improve setup and security sections
ci(workflows): add Node 22 to test matrix
```

**Breaking changes** must include `BREAKING CHANGE:` in the footer or `!` after the type:

```
feat(api)!: require X-Admin-Key header for all mutation endpoints

BREAKING CHANGE: All mutation API calls now require the X-Admin-Key header.
```

---

## Pull Request Process

1. **Rebase** on latest `main` before opening the PR.
2. **Complete the PR template** — fill in all sections including security checklist.
3. **Ensure all CI checks pass** — lint, test, build, audit.
4. **Request maintainer review** — assign `@Reinasboo`.
5. **Squash merge** unless otherwise instructed by the maintainer.

### Review Expectations

- Typical review turnaround: **2 business days**.
- Keep PRs **focused and scoped** — one concern per PR.
- Add tests for any behavior changes.
- Update documentation when applicable.
- Respond to review feedback promptly.

---

## PR Readiness Checklist

Before requesting review, ensure:

```bash
npm run lint          # No warnings or errors
npm test -- --run     # All tests pass
npm run build         # Build succeeds
```

- [ ] No secrets, credentials, or private keys in the diff
- [ ] Related documentation updated (README, ARCHITECTURE, etc.)
- [ ] New dependencies justified and audited (`npm audit`)
- [ ] Breaking changes documented in PR description and commit message

---

## Code Style

- **Language:** TypeScript (strict mode)
- **Formatting:** 2-space indentation, LF line endings (see `.editorconfig`)
- **Linting:** ESLint — run `npm run lint` before committing
- **Imports:** Prefer named imports; group by external → internal → relative
- **Naming:** camelCase for variables/functions, PascalCase for classes/types, UPPER_SNAKE for constants
- **Error handling:** Validate at system boundaries; trust internal code contracts

---

## Testing Requirements

- **New features** must include corresponding test cases.
- **Bug fixes** should include a regression test when feasible.
- **Test framework:** Vitest — tests live in `tests/` directory.
- **Run tests:** `npm test -- --run`
- **Naming:** `<module>.test.ts` — descriptive test names that explain the expected behavior.

---

## Documentation

- Update `README.md` for any user-facing changes.
- Update `ARCHITECTURE.md` or `DEEP_DIVE.md` for design-level changes.
- Update `CHANGELOG.md` under `[Unreleased]` for notable changes.
- Add inline comments only where logic is non-obvious.

---

## Security

- Never commit secrets.
- Never expose private keys.
- Validate external input at boundaries.
- Report vulnerabilities privately via `security@agentic-wallet.dev`.

For full disclosure policy, see [SECURITY.md](SECURITY.md).
