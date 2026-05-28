# Release Readiness Summary

Updated after Full App Deep Debug Round 4 (2026-05-28).

## Static gates

| Check | Command | Status |
|-------|---------|--------|
| Full CI | `npm run ci` | PASS |
| Web routes | `node web/scripts/check-routes.cjs` | PASS — 116 routes |
| Web-mobile sync | `node scripts/web-mobile-sync-check.js` | PASS |
| Mobile screens | `node mobile/app/scripts/check-screen-registry.cjs` | PASS — 29 screens |
| API parity | `node scripts/check-api-parity.cjs` | PASS — 251 paths |
| Txn API parity | `node scripts/check-txn-routes.cjs` | PASS |
| PHP syntax | `npm run lint:php` | PASS — 213 files |
| Unit tests | `npm run test` | PASS — web 4, backend 12 |
| API smoke | `npm run smoke:api` | PASS |
| Portal boundary | `npm run smoke:portal-boundary` | PASS |

## Risk register

| ID | Risk | Severity | Status |
|----|------|----------|--------|
| R1 | Admin routes staff boundary | High | Mitigated — `staff` on admin routes |
| R2 | SSO audience validation | Critical | Mitigated — Google `aud`, Microsoft `appId` |
| R3 | OAuth default secrets in prod | Critical | Mitigated — `OAuthStateSecret` |
| R4 | Public lead spam | High | Mitigated — honeypot + rate limit + Turnstile |
| R5 | Universal Links (mobile) | Medium | Scaffold — deploy `.well-known` |
| R6 | EAS projectId for push | Medium | Scaffold — clear error when unset |
| R7 | Associate 9-tab overflow | Low | Mitigated — 5 tabs + More stack |
| R8 | Web-only features vs mobile | Medium | Documented — web-mobile-sync check |
| R9 | Physical device smoke | Medium | Automated prep PASS — manual sign-off pending |
| R10 | Associate API route mismatch | Critical | **Mitigated (R4)** — `/api/associate/*` routes + legacy aliases |
| R11 | Mobile mock mode in production | Critical | **Mitigated (R4)** — `__DEV__` guard on `isMockMode()` |

## E2E scenarios (manual)

1. Lead → Quotation → public share PDF
2. Service → KYC upload → preview
3. Invoice → receipt → ledger reversal window
4. Leave → handover assignment
5. 401 session expiry → logout (web + mobile)
6. Associate commission → payout request → admin approval
7. Partner assignment visibility
8. Client chat message send/receive
9. Staff switches portal via top bar (web only)

## Deferred (out of scope)

- Node email service Brevo SDK fix
- Production deploy workflow validation
- Full React Query migration for data-fetch effects
- Deploy Universal Links `.well-known` files to production host
- Full CRM IDOR SQL audit
- Automated portal IDOR fuzz tests in CI

## Setup references

- Universal / App Links: [`docs/UNIVERSAL-LINKS.md`](UNIVERSAL-LINKS.md)
- Device smoke: [`docs/DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md)
- Web smoke: [`docs/WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md)

## Release decision (Round 4)

**Automated gates: GO** — all CI checks, API parity, and smoke scripts pass.

**Production release: conditional** — complete manual browser + physical device sign-off in WEB-SMOKE-TESTS and DEVICE-SMOKE-TESTS before shipping to users.
