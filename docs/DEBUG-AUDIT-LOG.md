# Debug & Security Audit Log

Gate-driven audit per Full App Deep Debug Plan.

## Round 4 (2026-05-28)

Branch: `main` | Commit: `1b339ba0e4da8941813965e3588ceb23a5f2ec7f`

| Batch | Date | Findings | Fixes | Deferred |
|-------|------|----------|-------|----------|
| R4-0 | 2026-05-28 | `npm run ci` Android export intermittent Windows exit 3221226356 (bundle succeeds); `mobile/app/.env` missing locally; web/backend unit tests not in CI | Baseline recorded; web Vitest 4/4 PASS; backend Jest 12/12 PASS | Physical `mobile/app/.env` (gitignored) — copy from `.env.example` |
| R4-1 | 2026-05-28 | Static gates all green | Web/mobile lint 0; PHP 213 files 0 syntax errors; Expo export Android+iOS PASS | — |
| R4-2 | 2026-05-28 | **Critical:** `Routes.php` pointed at deleted `Affiliate\*` controllers; clients call `/api/associate/*` and `/api/admin/associates/*` | Added associate routes + legacy affiliate aliases; `Associate\*` handlers; `associate.*` permissions; new `scripts/check-api-parity.cjs` (251 paths, 0 missing) | — |
| R4-3 | 2026-05-28 | Mobile mock mode enabled in production when `EXPO_PUBLIC_API_BASE_URL` unset | `isMockMode()` gated with `__DEV__` in `mobile/app/src/adapters/storage.ts`; `scripts/portal-boundary-smoke.cjs` added | Full IDOR fuzz suite in CI; CAPTCHA on public leads |
| R4-4 | 2026-05-28 | API prefix smoke without DB: marketing/public → 404 (expected); auth/admin/portals → 401 | `scripts/api-smoke.cjs` — all prefix groups no 5xx; associate dashboard returns 401 not 404 | Migration 099 apply + happy-path CRUD with PostgreSQL (manual) |
| R4-5 | 2026-05-28 | Browser runtime not automatable in agent session | Automated prep PASS (`npm run ci`, route/sync checks) | Manual [`WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md) sign-off |
| R4-6 | 2026-05-28 | Shared packages + mobile bundle | Fresh `build:packages`; tsc PASS; Expo export PASS | Expo Go launch on device (manual) |
| R4-7 | 2026-05-28 | Android physical smoke not run in agent session | Android Expo export bundle PASS; smoke matrix documented | [`DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md) Android column (physical) |
| R4-8 | 2026-05-28 | iOS physical smoke not run in agent session | iOS Expo export bundle PASS | DEVICE-SMOKE-TESTS iOS column (physical) |
| R4-9 | 2026-05-28 | Deep link / push physical tests | Code paths verified (`usePortalDeepLink`, `DeepLinkContext`); export PASS | Cold/warm `uri-scheme` on device |
| R4-10 | 2026-05-28 | Cross-portal E2E not executed end-to-end | E2E list in RELEASE-READINESS; API boundary smoke PASS | Manual E2E with PostgreSQL |
| R4-11 | 2026-05-28 | GitHub CI subset of local CI | Extended `.github/workflows/ci.yml`: PHP lint, route/sync/screen/txn/api-parity checks, unit tests; path filters for `server-php/**`, `scripts/**` | — |
| R4-12 | 2026-05-28 | Release sign-off | Root `ci` includes `check:api-parity` + `test`; all automated gates PASS | Universal Links deploy; physical device sign-off |

### Round 4 Gate B results (latest)

| Check | Result |
|-------|--------|
| `npm run ci` | PASS |
| Web lint | 0 errors |
| Mobile lint | 0 errors |
| Web routes | 116 routes, 0 dead links |
| Mobile screens | 29 registered |
| Web-mobile sync | PASS |
| API parity | 251 client paths, 0 missing |
| PHP syntax | 213 files, 0 errors |
| Expo export Android + iOS | PASS |
| Web Vitest | 4/4 PASS |
| Backend Jest | 12/12 PASS |
| API smoke (`npm run smoke:api`) | PASS (no 5xx) |
| Portal boundary smoke | PASS |

---

## Round 3 (2026-05-28) — summary

| Batch | Date | Findings | Fixes | Deferred |
|-------|------|----------|-------|----------|
| 0 | 2026-05-28 | Root `npm run ci` lacked lint, PHP syntax, Expo export; mobile lint `continue-on-error` in GitHub CI | Extended root `ci` script; `lint:php`, `export:android/ios`, route/sync/screen checks; removed `continue-on-error` on mobile lint in `.github/workflows/ci.yml` | — |
| 1 | 2026-05-28 | Static baseline | Web/mobile lint 0 errors; builds + tsc + expo export pass; PHP 212 files 0 syntax errors | — |
| 2 | 2026-05-28 | 3 orphan approval pages; `<a href>` to `/admin/leaves` | Deleted orphan pages; `web/scripts/check-routes.cjs` (116 routes, 0 dead links); React Router `Link`; TopBar breadcrumb | — |
| 3 | 2026-05-28 | Unknown core deep link paths; screen registry unverified | `usePortalDeepLink` unknown → Home; `check-screen-registry.cjs` (28 screens); deep link notes in DEVICE-SMOKE-TESTS.md | Associate 9-tab overflow on small screens |
| 4–15 | 2026-05-28 | Security hardening, staff middleware, smoke doc scaffolding | See Round 3 rows in git history | Physical device + browser sign-off |

### Prior rounds (summary)

| Round | Date | Notes |
|-------|------|-------|
| 1 | 2026-05-28 | CI iOS export; mobile ESLint; orphan pages; SSO/diag/marketing fixes |
| 2 | 2026-05-28 | Service re-exports; core service detail screen; marketing permissions; web lint 252→0 |

## Gate commands

```bash
npm run ci
# Or individually:
npm run build:packages && npm run build:web && npm run typecheck:mobile
npm run export:android && npm run export:ios
npm run lint:web && npm run lint:mobile && npm run lint:php
npm run check:routes && npm run check:sync && npm run check:mobile-screens
npm run check:txn-routes && npm run check:api-parity
npm run test
npm run smoke:api
npm run smoke:portal-boundary
```

## Manual sign-off required before release

- [`docs/WEB-SMOKE-TESTS.md`](WEB-SMOKE-TESTS.md) — browser flows
- [`docs/DEVICE-SMOKE-TESTS.md`](DEVICE-SMOKE-TESTS.md) — Android + iOS
- [`docs/RELEASE-READINESS.md`](RELEASE-READINESS.md) — risk register
