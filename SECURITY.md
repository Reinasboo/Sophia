# Security Policy

This document defines the vulnerability disclosure process, reporting channels,
scope, response expectations, and security architecture for Agentic Wallet.

---

## Supported Versions

| Version | Supported |
|---|---|
| Latest on `main` | :white_check_mark: Active security updates |
| Previous minor | :warning: Critical fixes at maintainer discretion |
| Older releases | :x: Not supported |

Security updates are always prioritized for the latest release on the `main` branch.

---

## Reporting a Vulnerability

> **Do not open public issues for suspected vulnerabilities.**

| Field | Details |
|---|---|
| **Reporting email** | [security@agentic-wallet.dev](mailto:security@agentic-wallet.dev) |
| **Subject format** | `[SECURITY] <short summary>` |
| **PGP encryption** | Available on request |

**Include in your report:**

- Affected component (e.g., wallet layer, BYOA integration, API)
- Severity assessment (Critical / High / Medium / Low)
- Clear reproduction steps
- Proof-of-concept code or logs (if available)
- Potential impact description

---

## Response Timeline

| Stage | Target SLA |
|---|---|
| Acknowledgment of report | **48 hours** |
| Initial severity assessment | **5 business days** |
| Fix development & testing | Dependent on severity |
| Coordinated disclosure | After fix is released |

**Severity-based fix targets:**

| Severity | Target Resolution |
|---|---|
| Critical (exploitable, active risk) | **72 hours** |
| High (exploitable under specific conditions) | **7 days** |
| Medium (limited impact) | **30 days** |
| Low (hardening opportunity) | Next scheduled release |

---

## Disclosure Process

1. **Report** — Submit privately via email with full details.
2. **Acknowledge** — Maintainers confirm receipt within 48 hours.
3. **Assess** — Severity is validated and prioritized.
4. **Remediate** — Fix is developed, reviewed, and tested.
5. **Release** — Patched version is published with security advisory.
6. **Disclose** — Coordinated disclosure in release notes and CHANGELOG.

We follow [coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure) principles.

---

## Scope

### In Scope

- Repository source code and GitHub Actions workflows
- Dependency vulnerabilities in runtime and build chain
- Key management, encryption, and key derivation
- Authentication and authorization (Admin API, BYOA tokens)
- Data handling, input validation, and API security
- WebSocket security and CORS configuration

### Out of Scope

- Social engineering or phishing campaigns
- Denial-of-service without an underlying vulnerability
- Vulnerabilities only present in unsupported forks or modified deployments
- Issues in third-party infrastructure (e.g., Solana RPC providers)

---

## Responsible Disclosure Expectations

- Act in good faith and avoid privacy violations or data destruction.
- Do not exfiltrate secrets, private keys, or user data.
- Test only on systems you own or are authorized to assess.
- Provide enough detail for maintainers to reproduce and resolve.
- Allow reasonable time for remediation before any public disclosure.
- Do not leverage a vulnerability for unauthorized access beyond proof-of-concept.

---

## Security Architecture Highlights

| Control | Implementation |
|---|---|
| **Key encryption** | AES-256-GCM with scrypt key derivation |
| **Key isolation** | Private keys never leave the wallet layer |
| **BYOA security** | Control tokens hashed; agents never receive plaintext keys |
| **Input validation** | Zod schemas on all API endpoints; prototype pollution mitigated |
| **Error handling** | Stack traces sanitized in production responses |
| **Transport security** | WebSocket origin validation; configurable CORS |
| **Audit trail** | All intents, decisions, and transactions logged |
| **CI security gates** | CodeQL, TruffleHog, dependency review, npm audit |

See [ARCHITECTURE.md](ARCHITECTURE.md) and [DEEP_DIVE.md](DEEP_DIVE.md) for full design details.

---

## Automated Security Controls

- **Dependabot** — automated dependency updates (weekly, grouped by ecosystem)
- **CodeQL** — static analysis on every PR and push to `main`
- **TruffleHog** — secret scanning in CI pipeline
- **Dependency Review** — license and vulnerability checks on PRs
- **npm audit** — dependency audit at moderate+ severity level
- **Secret scanning** — GitHub-native secret scanning enabled
