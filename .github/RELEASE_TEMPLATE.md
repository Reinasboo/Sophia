# Release Checklist

## Summary

- **Version:** `v`
- **Release Type:** `major` | `minor` | `patch`
- **Release Date:**
- **Scope:**

---

## Pre-Release Validation

- [ ] All CI checks pass on `main`
- [ ] `npm run lint` — no warnings or errors
- [ ] `npm test -- --run` — all tests pass
- [ ] `npm run build` — build succeeds
- [ ] Security workflow green on default branch
- [ ] `npm audit --audit-level=high` — no high/critical vulnerabilities

## Documentation

- [ ] `CHANGELOG.md` updated with all changes under the new version header
- [ ] `README.md` reviewed for accuracy with any API or feature changes
- [ ] Migration notes included (if breaking changes)
- [ ] `package.json` version bumped

## Security and Compliance

- [ ] No secrets, credentials, or private keys in the diff
- [ ] New dependencies reviewed for license compatibility and known vulnerabilities
- [ ] Security-impacting changes explicitly called out in release notes
- [ ] `SECURITY.md` reviewed if scope of security controls changed

## Release Steps

1. [ ] Merge all PRs targeted for this release into `main`
2. [ ] Update `CHANGELOG.md` — move `[Unreleased]` items under new version heading
3. [ ] Bump version in `package.json`
4. [ ] Push to `main` — release workflow creates tag and GitHub Release automatically
5. [ ] Verify GitHub Release notes are accurate
6. [ ] Post announcement (if applicable)

## Rollback Plan

- [ ] Previous stable tag identified: `v`
- [ ] Rollback steps documented and tested
- [ ] Communication plan for downstream consumers
