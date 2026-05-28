# Mobile Device Smoke Tests (Android + iOS)

Run after `npm run ci` passes locally. Use **Expo Go** or an **EAS preview** build (`mobile/app/eas.json` profile `preview`).

## Prerequisites

```bash
npm run build:packages
cd mobile/app && npx expo start
```

Set `EXPO_PUBLIC_API_BASE_URL` to your machine IP (physical device) or `http://localhost:8080/api` (emulator).

PHP backend + PostgreSQL must be running for real API tests.

---

## Test matrix

| Portal | Screen / flow | Android | iOS |
|--------|---------------|---------|-----|
| Login | 4 portal tabs render | ☐ | ☐ |
| Login | Wrong portal shows error (no token saved) | ☐ | ☐ |
| Login | OTP / password success → correct navigator | ☐ | ☐ |
| Core | Dashboard loads KPIs | ☐ | ☐ |
| Core | Contacts list pagination | ☐ | ☐ |
| Core | Services list + tap → detail screen | ☐ | ☐ |
| Core | More → Profile, Inbox | ☐ | ☐ |
| Core | Sign out → Login | ☐ | ☐ |
| Associate | Home / Services / Commissions / Payouts / More (5 tabs) | ☐ | ☐ |
| Associate | More → Rewards, Chat, Bank, Invite, Profile | ☐ | ☐ |
| Associate | Sign out | ☐ | ☐ |
| Partner | All 6 tabs load | ☐ | ☐ |
| Partner | Sign out | ☐ | ☐ |
| Client | Active / Done / Ledger / Chat / Profile | ☐ | ☐ |
| Client | Service detail from list | ☐ | ☐ |
| Client | Sign out | ☐ | ☐ |

---

## Deep link tests (cold start + warm)

Use `npx uri-scheme open "carahulgupta://…" --android` or `--ios` (or tap link in Notes/email).

| URL | Expected (signed in) | Android | iOS |
|-----|----------------------|---------|-----|
| `carahulgupta://login?portal=client` | Client tab pre-selected | ☐ | ☐ |
| `carahulgupta://core/inbox` | Core → More → Inbox | ☐ | ☐ |
| `carahulgupta://core/service/123` | Core service detail (valid id) | ☐ | ☐ |
| `carahulgupta://client/service/123` | Client service detail | ☐ | ☐ |
| `carahulgupta://associate/payouts` | Associate payouts tab | ☐ | ☐ |
| `carahulgupta://partner/bank` | Partner bank tab | ☐ | ☐ |
| Cross-portal link while signed in | Alert: "Wrong portal" | ☐ | ☐ |
| Unknown core path (e.g. `core/unknown`) | Falls back to Home tab | ☐ | ☐ |

**Note:** Only `carahulgupta://core/service/{id}` opens service detail; `core/services/{id}` opens the Services list tab. HTTPS links on `https://app.carahulgupta.in/...` work when Universal Links are deployed — see [`docs/UNIVERSAL-LINKS.md`](UNIVERSAL-LINKS.md).

---

## Push notification tap (scaffold)

Payload: `{ "url": "carahulgupta://core/inbox" }` — should route same as deep link.

| Step | Android | iOS |
|------|---------|-----|
| Register for push on sign-in | ☐ | ☐ |
| Tap notification → correct screen | ☐ | ☐ |

---

## Auth edge cases

| Case | Expected | Android | iOS |
|------|----------|---------|-----|
| 401 from API | Auto logout → Login | ☐ | ☐ |
| Kill app, reopen (mock mode) | Session restored | ☐ | ☐ |
| Kill app, reopen (real API) | Session restored via `/auth/me` | ☐ | ☐ |

---

## Sign-off

| Tester | Date | Build (Expo/EAS) | Notes |
|--------|------|------------------|-------|
| | | | |

Record results in [`docs/DEBUG-AUDIT-LOG.md`](DEBUG-AUDIT-LOG.md).
