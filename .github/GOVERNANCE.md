# Project Governance

## Overview

Sophia is maintained by a core maintainer with community contributions
following structured processes defined in [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Project Leadership

| Role                | Person    | Contact                                                           |
| ------------------- | --------- | ----------------------------------------------------------------- |
| **Lead Maintainer** | Reinasboo | [@Reinasboo](https://github.com/Reinasboo)                        |
| **Security Lead**   | Reinasboo | [security@sophia.dev](mailto:security@sophia.dev) |

---

## Decision Making

### Code Decisions

- **Minor changes** (docs, tests, small fixes): Reviewed and approved by maintainer.
- **Features**: Discussed in [GitHub Discussions](https://github.com/Reinasboo/Sophia/discussions) before implementation.
- **Breaking changes**: RFC required with maintainer agreement before work begins.

### Security Decisions

- All security findings reviewed by Security Lead within 48 hours.
- Patches released on severity-based priority (see [SECURITY.md](../SECURITY.md)).

### Release Decisions

- Versions follow [Semantic Versioning](https://semver.org/).
- Releases are ad-hoc based on feature milestones and scheduled security patches.

---

## Contribution Tiers

### Contributor

- Open pull requests and participate in discussions.
- Follow [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).

### Committer

- Significant, sustained contributions over time.
- May perform code reviews on pull requests.
- Invited by the Lead Maintainer.

### Maintainer

- Full commit access and release authority.
- Requires consensus from existing maintainers.

---

## Merge Policy

- The `main` branch is protected with required status checks and CODEOWNERS review.
- Only `@Reinasboo` has permission to merge pull requests into `main`.
- All PRs must pass CI checks: Lint & Format Check, Test Suite, Build Verification, and Dependency Audit.
- Stale reviews are automatically dismissed when new commits are pushed.
- See `.github/settings.yml` for the full branch protection configuration.

---

## Release Cadence

| Release Type       | Frequency           | Trigger                              |
| ------------------ | ------------------- | ------------------------------------ |
| **Patch** (v1.0.x) | As needed           | Bug fixes and security patches       |
| **Minor** (v1.x.0) | Quarterly           | Significant features or improvements |
| **Major** (vx.0.0) | Yearly or as needed | Breaking changes                     |

---

## Conflict Resolution

1. Asynchronous discussion in the relevant PR or issue.
2. Respectful dialogue with all stakeholders.
3. Escalation to Lead Maintainer if unresolved.
4. Final decision issued within 7 business days.

---

## Community

- **Discussions**: [GitHub Discussions](https://github.com/Reinasboo/Sophia/discussions)
- **Code of Conduct**: [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)
- **Issues**: [GitHub Issues](https://github.com/Reinasboo/Sophia/issues)
