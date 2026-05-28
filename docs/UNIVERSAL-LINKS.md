# Universal Links & App Links

The mobile app supports both the custom scheme (`carahulgupta://`) and HTTPS Universal/App Links on `app.carahulgupta.in`.

## App configuration

- `mobile/app/app.config.js` — `associatedDomains` (iOS) and HTTPS `intentFilters` (Android)
- `packages/shared-constants/src/mobileDeepLinks.ts` — parses `https://app.carahulgupta.in/...` the same as `carahulgupta://...`

## Server setup (production)

Host these files on **https://app.carahulgupta.in**:

| File | URL |
|------|-----|
| Apple AASA | `https://app.carahulgupta.in/.well-known/apple-app-site-association` |
| Android asset links | `https://app.carahulgupta.in/.well-known/assetlinks.json` |

Templates are in [`mobile/app/universal-links/`](mobile/app/universal-links/).

1. Replace `TEAMID` in `apple-app-site-association` with your Apple Developer Team ID.
2. Replace `REPLACE_WITH_RELEASE_KEY_SHA256` in `assetlinks.json` with your release keystore SHA-256 fingerprint (`eas credentials` or `keytool -list -v`).
3. Deploy both files with `Content-Type: application/json` (AASA has no file extension).

## Example URLs

| HTTPS (Universal Link) | Custom scheme equivalent |
|------------------------|--------------------------|
| `https://app.carahulgupta.in/login?portal=client` | `carahulgupta://login?portal=client` |
| `https://app.carahulgupta.in/core/inbox` | `carahulgupta://core/inbox` |
| `https://app.carahulgupta.in/associate/payouts` | `carahulgupta://associate/payouts` |

Custom scheme links continue to work when Universal Links are not yet deployed.

## EAS project ID (push notifications)

Set before production builds:

```bash
cd mobile/app
eas init   # links project and writes projectId
# Or set EAS_PROJECT_ID in mobile/app/.env
```

`app.config.js` injects `extra.eas.projectId` for Expo push token registration.
