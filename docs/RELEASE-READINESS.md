# Release Readiness Summary

Generated as part of Full App Deep Debug (Round 3). Update after each release candidate.

## Static gates

| Check | Command | Status |
|-------|---------|--------|
| Full CI | `npm run ci` | Run before release |
| Web routes | `node web/scripts/check-routes.cjs` | PASS — 116 routes |
| Web-mobile sync | `node scripts/web-mobile-sync-check.js` | PASS |
| Mobile screens | `node mobile/app/scripts/check-screen-registry.cjs` | PASS — 29 screens |
| Txn API parity | `node scripts/check-txn-routes.cjs` | Run in CI |
| PHP syntax | `npm run lint:php` | PASS — 212 files |

## Risk register

| ID | Risk | Severity | Status |
|----|------|----------|--------|
| R1 | Admin routes staff boundary | High | Mitigated — `staff` on admin routes |
| R2 | SSO audience validation | Critical | Mitigated — Google `aud`, Microsoft `appId` |
| R3 | OAuth default secrets in prod | Critical | Mitigated — `OAuthStateSecret` |
| R4 | Public lead spam | High | Mitigated — honeypot + rate limit + Turnstile |
| R5 | Universal Links (mobile) | Medium | Scaffold — app config + AASA templates; deploy `.well-known` |
| R6 | EAS projectId for push | Medium | Scaffold — `app.config.js` + clear error when unset |
| R7 | Associate 9-tab overflow | Low | Mitigated — 5 tabs + More stack |
| R8 | Web-only features vs mobile | Medium | Documented — web-mobile-sync check |
| R9 | Physical device smoke | Medium | Manual — DEVICE-SMOKE-TESTS.md |

## E2E scenarios (manual)

1. Lead → Quotation → public share PDF
2. Service → KYC upload → preview
3. Invoice → receipt → ledger reversal window
4. Leave → handover assignment
5. 401 session expiry → logout (web + mobile)

## Deferred (out of scope)

- Node email service Brevo SDK fix
- Production deploy workflow validation
- Full React Query migration for data-fetch effects
- Deploy Universal Links `.well-known` files to production host

## Setup references

- Universal / App Links: [`docs/UNIVERSAL-LINKS.md`](UNIVERSAL-LINKS.md)
- Device smoke: [`docs/DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md)
- Web smoke: [`docs/WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md)
