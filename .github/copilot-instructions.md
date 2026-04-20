# Sophia Copilot Instructions

This repository is Solana-first. For any request that touches Solana, wallets, intents, agents, transactions, DeFi, or onchain flows:

- Prefer Solana-specific skills and workflows already installed in local agent skills.
- Use existing project architecture and naming from `src/`, `apps/frontend/`, and `tests/`.
- Prioritize safe defaults: explicit error handling, signer checks, idempotent transaction logic, and clear validation.
- Keep changes minimal and production-minded; do not refactor unrelated code.
- Add or update tests when behavior changes.
- For security-sensitive paths, call out risks and mitigations.

When the user asks to build on Solana and intent is unclear:

- Propose a short path: idea -> scaffold -> implement -> test -> launch.
- Suggest relevant skill workflows (for example: `find-next-crypto-idea`, `scaffold-project`, `build-with-claude`, `debug-program`, `deploy-to-mainnet`).

If a non-Solana request conflicts with these rules, follow the user’s direct request.
