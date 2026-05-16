# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

CA Office Management Portal with three components:

| Service | Directory | Port | Tech |
|---------|-----------|------|------|
| Web Frontend | `web/` | 5173 | React 19 + Vite 7 |
| PHP API Backend | `server-php/` | 8080 | PHP 8.3 (CodeIgniter-style, no Composer) |
| Node.js Email Service | `backend/` | 4000 | Express + Brevo SDK (optional) |

Infrastructure: PostgreSQL 16 (`cagupta_db`).

### Running Services

- **Web frontend:** `cd web && npm run dev -- --host 0.0.0.0` (port 5173)
- **PHP backend:** `cd server-php && php -S 0.0.0.0:8080 -t public/` (built-in PHP server)
- **Email service:** `cd backend && npm run dev` (port 4000, optional — crashes with pre-existing Brevo SDK issue)
- **PostgreSQL:** `sudo pg_ctlcluster 16 main start` (must start before PHP backend)

### Lint / Test / Build

- **Lint (web):** `cd web && npx eslint .` — pre-existing lint errors exist in the codebase
- **Tests (backend):** `cd backend && npx jest --runInBand` — 12 tests, all passing
- **Build (web):** `cd web && npm run build`

### Dev/Mock Mode

The web frontend works without any backend in **mock mode** when `VITE_API_BASE_URL` is empty. In mock mode:
- Email OTP login accepts `123456` as the code
- Google/Microsoft mock auth works if their client IDs are not configured
- Dashboard shows dummy data

When `VITE_API_BASE_URL` is set (default: `http://localhost:8080/api`), the frontend calls the real PHP backend which requires PostgreSQL.

### Environment Files

- `web/.env` — set `VITE_API_BASE_URL` for real backend or leave empty for mock mode
- `server-php/.env` — DB credentials (`postgres`/`postgres`), JWT secret, CORS origin
- `backend/.env` — Brevo API key (optional)

### Database

PostgreSQL user `postgres` with password `postgres`, database `cagupta_db`. Schema in `server-php/database/schema.sql`, seed in `server-php/database/seed.sql`.

### Gotchas

- The PHP backend uses `php -S` (built-in server); no Apache/Nginx needed for development.
- Vite env var changes require a full dev server restart (not hot-reloaded).
- The email backend (`backend/`) has a pre-existing `Brevo.TransactionalEmailsApi is not a constructor` error — this service is optional and not needed for core app functionality.
- The `.env` files are git-ignored. They must be recreated from `.env.example` files in each directory.
