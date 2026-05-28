# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

CA Office Management Portal with four components:

| Service | Directory | Port | Tech |
|---------|-----------|------|------|
| Web Frontend | `web/` | 5173 | React 19 + Vite 7 |
| Mobile App | `mobile/app/` | 8081 (Expo) | React Native + Expo |
| PHP API Backend | `server-php/` | 8080 | PHP 8.3 (CodeIgniter-style, no Composer) |
| Node.js Email Service | `backend/` | 4000 | Express + Brevo SDK (optional) |

**Shared packages** (npm workspaces):

| Package | Path | Purpose |
|---------|------|---------|
| `@cagupta/shared-constants` | `packages/shared-constants/` | Portals, roles, permissions |
| `@cagupta/shared-services` | `packages/shared-services/` | Auth + API clients |

**Four portals** (single web app + single mobile app): Core (`staff`), Associate (`associate`), My CA (`client`), Partner (`partner`).

**Web + mobile sync:** See [`.cursor/rules/web-mobile-sync.mdc`](.cursor/rules/web-mobile-sync.mdc). When changing portal names, auth, roles, permissions, or `*Service.js` API clients, update shared packages and mobile counterparts. Run Gate A/B verification before finishing.

### Running Services

- **Web frontend:** `cd web && npm run dev -- --host 0.0.0.0` (port 5173)
- **Mobile app:** `cd mobile/app && npx expo start` (Expo Go / emulator)
- **PHP backend:** `cd server-php && php -S 0.0.0.0:8080 -t public/` (built-in PHP server)
- **Email service:** `cd backend && npm run dev` (port 4000, optional — crashes with pre-existing Brevo SDK issue)
- **PostgreSQL:** `sudo pg_ctlcluster 16 main start` (must start before PHP backend)

### Lint / Test / Build

- **Lint (web):** `cd web && npx eslint .` — pre-existing lint errors exist in the codebase
- **Build (web):** `cd web && npm run build` or from root: `npm run build:web`
- **Build (shared packages):** `npm run build:packages` (from repo root)
- **Typecheck (mobile):** `cd mobile/app && npx tsc --noEmit` or `npm run typecheck:mobile` from root
- **CI (local):** `npm run ci` from repo root
- **Tests (backend):** `cd backend && npx jest --runInBand` — 12 tests, all passing

### Dev/Mock Mode

The web frontend works without any backend in **mock mode** when `VITE_API_BASE_URL` is empty. In mock mode:
- Email OTP login accepts `123456` as the code
- Google/Microsoft mock auth works if their client IDs are not configured
- Dashboard shows dummy data

When `VITE_API_BASE_URL` is set (default: `http://localhost:8080/api`), the frontend calls the real PHP backend which requires PostgreSQL.

Mobile uses `EXPO_PUBLIC_API_BASE_URL` in `mobile/app/.env` (see `.env.example`).

### Environment Files

- `web/.env` — set `VITE_API_BASE_URL` for real backend or leave empty for mock mode; optional `VITE_GA4_MEASUREMENT_ID` (`G-…`, same value in `web-public/.env`)
- `web-public/.env` — optional `VITE_GA4_MEASUREMENT_ID` (marketing site at `carahulgupta.in`)
- `mobile/app/.env` — set `EXPO_PUBLIC_API_BASE_URL` (default `http://localhost:8080/api`)
- `server-php/.env` — DB credentials (`postgres`/`postgres`), JWT secret, CORS origin; optional `GA4_PROPERTY_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON` for Traffic Analytics
- `backend/.env` — Brevo API key (optional)

### Database

PostgreSQL user `postgres` with password `postgres`, database `cagupta_db`. Schema in `server-php/database/schema.sql`, seed in `server-php/database/seed.sql`.

### Gotchas

- The PHP backend uses `php -S` (built-in server); no Apache/Nginx needed for development.
- Vite env var changes require a full dev server restart (not hot-reloaded).
- The email backend (`backend/`) has a pre-existing `Brevo.TransactionalEmailsApi is not a constructor` error — this service is optional and not needed for core app functionality.
- The `.env` files are git-ignored. They must be recreated from `.env.example` files in each directory.
- Mobile monorepo: Metro must watch `packages/` — see `mobile/app/metro.config.js`.
- **Mobile build batches:** Follow `.cursor/plans/mobile_app_build_a8d7c2eb.plan.md` — Gate A before, Gate B after every batch.
