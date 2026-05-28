# Mobile App — CA Rahul Gupta Office

Expo React Native app with four portals: **Core**, **Associate**, **My CA**, **Partner**.

## Structure

| Path | Purpose |
|------|---------|
| `src/screens/LoginScreen.tsx` | 4-tab portal login |
| `src/navigation/` | Role-based navigators |
| `src/portals/core/` | Staff portal screens |
| `src/portals/associate/` | Associate portal screens |
| `src/portals/partner/` | Partner portal screens |
| `src/portals/client/` | Client portal screens |
| `src/portals/client/screens/` | Active, Completed, Ledger, Chat, Profile, Service detail |
| `src/adapters/` | API client + secure storage |

Shared logic: `@cagupta/shared-constants`, `@cagupta/shared-services`.

Run `npm run build:packages` from repo root before `expo start` (or use `npm start` which runs prestart).

## Dev

```bash
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_BASE_URL=http://localhost:8080/api` (or your machine IP for physical device).

## Deep links

Custom URL scheme: `carahulgupta://`

| URL | Action |
|-----|--------|
| `carahulgupta://login?portal=client` | Pre-select My CA login tab |
| `carahulgupta://login?portal=affiliate` | Legacy slug → Associate tab |
| `carahulgupta://client/service/123` | Client service detail (when signed in) |
| `carahulgupta://core/inbox` | Core inbox (when signed in) |
| `carahulgupta://associate/payouts` | Associate payouts tab |
| `carahulgupta://partner/bank` | Partner bank tab |

Helpers live in `@cagupta/shared-constants` (`buildMobileDeepLink`, `parseMobileDeepLink`).

## Push notifications (scaffold)

- `expo-notifications` registers on sign-in (physical device + permission required).
- Notification tap payload: `{ "url": "carahulgupta://…" }` routes via the same deep-link handler.
- Backend token registration is not wired yet.

## Typecheck

```bash
npm run typecheck
```
