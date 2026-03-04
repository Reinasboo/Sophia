# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Enterprise-grade repository governance overhaul.
- Investor-ready README with architecture diagram, tech stack matrix, and comprehensive documentation.
- Enhanced SECURITY.md with response SLA table and severity-based fix targets.
- CI/CD matrix testing across Node.js 18, 20, and 22.
- Workflow concurrency controls to prevent redundant CI runs.
- Expanded CONTRIBUTING.md with code style guide, testing requirements, and documentation standards.
- Hardened .gitignore with comprehensive exclusion patterns.
- Detailed .env.example with inline security guidance.
- ESLint configuration (`.eslintrc.json`) with TypeScript parser and Prettier integration.
- Prettier configuration (`.prettierrc.json`, `.prettierignore`) for consistent code formatting.
- `lint:fix`, `format`, and `format:check` npm scripts.
- `.nvmrc` for explicit Node.js version pinning.
- `SUPPORT.md` with troubleshooting guide, support channels, and version table.
- `.github/GOVERNANCE.md` with leadership structure, contribution tiers, and release cadence.
- `.github/workflows/stale.yml` for automated stale issue/PR management.
- `package.json` metadata: repository, homepage, bugs, keywords, author, license fields.
- Prettier format check added to CI lint job.

### Changed

- Upgraded README formatting: centered hero section, badge row, ASCII architecture diagram, table-driven sections.
- Improved all markdown files with consistent section separators and table formatting.

---

## [1.0.0] - 2026-03-04

### Added

- Autonomous AI agent wallet platform for Solana Devnet.
- 4 built-in agent strategies: Accumulator, Distributor, Balance Guard, Scheduled Payer.
- Strategy Registry with Zod-validated runtime parameters.
- Multi-agent orchestrator supporting up to 20 concurrent agents.
- Bring Your Own Agent (BYOA) integration with 5 intent types and 8 autonomous actions.
- AES-256-GCM encrypted wallet key storage with scrypt key derivation.
- Admin API key authentication for mutation endpoints.
- Autonomous intent safety guardrails: rate limits, transfer caps, minimum balance reserves.
- Real-time Next.js 14 dashboard with 11 routes and WebSocket live updates.
- 5-step agent creation wizard with dynamic parameter forms.
- Full intent history logging for audit and compliance.
- Comprehensive security audit with 26 findings identified and resolved.
- CI/CD workflows: lint, test, build, audit, security scanning, auto-release.
- GitHub issue templates (bug, feature, security), PR template, release template.
- CODEOWNERS, Dependabot, FUNDING.yml, and repository governance files.
- Complete documentation: ARCHITECTURE.md, DEEP_DIVE.md, SKILLS.md, SECURITY.md, CONTRIBUTING.md.

### Security

- Prototype pollution prevention on all `z.record()` schemas.
- Error response sanitization (no stack traces leaked).
- WebSocket origin validation.
- Configurable CORS origins.
- Raw transaction program inspection/logging before signing.
- Token transfer decimal awareness (not hardcoded).

---

[Unreleased]: https://github.com/Reinasboo/Agentic-wallet/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Reinasboo/Agentic-wallet/releases/tag/v1.0.0
