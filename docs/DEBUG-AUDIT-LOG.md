# Debug & Security Audit Log

Gate-driven audit per Full App Deep Debug Plan (Round 3).

| Batch | Date | Findings | Fixes | Deferred |
|-------|------|----------|-------|----------|
| 0 | 2026-05-28 | Root `npm run ci` lacked lint, PHP syntax, Expo export; mobile lint `continue-on-error` in GitHub CI | Extended root `ci` script; `lint:php`, `export:android/ios`, route/sync/screen checks; removed `continue-on-error` on mobile lint in `.github/workflows/ci.yml` | — |
| 1 | 2026-05-28 | Static baseline | Web/mobile lint 0 errors; builds + tsc + expo export pass; PHP 212 files 0 syntax errors | — |
| 2 | 2026-05-28 | 3 orphan approval pages; `<a href>` to `/admin/leaves` | Deleted orphan pages; `web/scripts/check-routes.cjs` (116 routes, 0 dead links); React Router `Link`; TopBar breadcrumb | — |
| 3 | 2026-05-28 | Unknown core deep link paths; screen registry unverified | `usePortalDeepLink` unknown → Home; `check-screen-registry.cjs` (28 screens); deep link notes in DEVICE-SMOKE-TESTS.md | Associate 9-tab overflow on small screens |
| 4 | 2026-05-28 | Unauthenticated diag; SSO aud missing; JWT leak; OTP no rate limit; hardcoded super-admin | Removed `/api/system/diag`; Google `aud` + Microsoft `appId` in SsoTokenVerifier; generic AuthFilter errors; RateLimiter on auth OTP; `SUPER_ADMIN_EMAIL` env | Fail startup if APP_ENV unset in prod (warn only) |
| 5 | 2026-05-28 | Public lead spam; OAuth default secrets | Honeypot + rate limit on public leads; `OAuthStateSecret` blocks defaults in production | CAPTCHA on public leads |
| 6 | 2026-05-28 | ~300 admin routes without `staff`; registers/settings view on mutating verbs | `staff` on 320 admin routes; `fix-route-permissions.js` patched 39 routes to `*.edit` | Automated 403 portal boundary tests in CI |
| 7 | 2026-05-28 | Quotation share token entropy; KYC path outside web root | Verified `random_bytes(16)` tokens; DOCU_BANK_PATH documented in `.env.example` | Full CRM IDOR SQL audit |
| 8 | 2026-05-28 | Finance webhook idempotency | Prior Razorpay HMAC + idempotency assumed from round 2 | txnService.js vs PHP route automated diff |
| 9 | 2026-05-28 | Marketing PATCH prospects; AI insights refresh permissions | Explicit `permission_any` on PATCH prospects + POST ai-insights/refresh | Portal IDOR fuzz tests |
| 10 | 2026-05-28 | Web-mobile naming drift | `scripts/web-mobile-sync-check.js` — PASS | Full API client parity matrix |
| 11 | 2026-05-28 | Browser runtime not in CI | [`docs/WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md) checklist | Manual sign-off |
| 12–13 | 2026-05-28 | Physical device smoke not executed in agent session | [`docs/DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md) matrix + deep link + push sections | Android/iOS sign-off columns |
| 14 | 2026-05-28 | Deep link + push routing | Documented in DEVICE-SMOKE-TESTS.md; `uri-scheme` commands | Physical cold/warm start tests |
| 15 | 2026-05-28 | Cross-portal E2E | [`docs/RELEASE-READINESS.md`](RELEASE-READINESS.md) risk register + E2E list | Manual E2E execution |

### Prior rounds (summary)

| Round | Date | Notes |
|-------|------|-------|
| 1 | 2026-05-28 | CI iOS export; mobile ESLint; orphan pages; SSO/diag/marketing fixes |
| 2 | 2026-05-28 | Service re-exports; core service detail screen; marketing permissions; web lint 252→0 |

## Gate B results (Round 3 — latest)

| Check | Result |
|-------|--------|
| `npm run ci` | PASS |
| Web lint | 0 errors / 0 warnings |
| Mobile lint | 0 errors / 0 warnings |
| Web routes | 116 routes, 0 dead links |
| Mobile screens | 28 registered |
| Web-mobile sync | PASS |
| PHP syntax | 212 files, 0 errors |
| Expo export Android + iOS | PASS |

## Gate commands

```bash
npm run ci
# Or individually:
npm run build:packages && npm run build:web && npm run typecheck:mobile
npm run export:android && npm run export:ios
npm run lint:web && npm run lint:mobile && npm run lint:php
npm run check:routes && npm run check:sync && npm run check:mobile-screens
```

## Manual sign-off required before release

- [`docs/WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md) — browser flows
- [`docs/DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md) — Android + iOS
- [`docs/RELEASE-READINESS.md`](RELEASE-READINESS.md) — risk register
