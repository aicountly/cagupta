# Web Runtime Smoke Tests

Run after `npm run ci` with PostgreSQL + PHP backend on `:8080` and `web/.env` pointing at the API.

## Setup

```bash
npm run build:packages
cd server-php && php -S 0.0.0.0:8080 -t public/
cd web && npm run dev -- --host 0.0.0.0
```

## Matrix (Core staff user)

| Flow | Route | Pass | Console errors |
|------|-------|------|----------------|
| Login OTP | `/login` | ☐ | ☐ |
| Dashboard | `/` | ☐ | ☐ |
| Contacts | `/clients/contacts` | ☐ | ☐ |
| New organization | `/clients/organizations/new` | ☐ | ☐ |
| Services list | `/services` | ☐ | ☐ |
| New engagement | `/services/new` | ☐ | ☐ |
| Invoices hub | `/finance/invoices-banking` | ☐ | ☐ |
| Ledger | `/invoices` | ☐ | ☐ |
| Marketing hub | `/marketing/tools` | ☐ | ☐ |
| Reports hub | `/reports` | ☐ | ☐ |
| Associate portal | `/associate` | ☐ | ☐ |
| Partner portal | `/partner` | ☐ | ☐ |
| Client portal | `/client` | ☐ | ☐ |
| Public blog | `/blog` | ☐ | ☐ |
| Shared quotation | `/shared/quotation/:token` | ☐ | ☐ |

## Automated prep (Round 4)

```bash
npm run ci
node web/scripts/check-routes.cjs
node scripts/web-mobile-sync-check.js
node scripts/check-api-parity.cjs
```

**Round 4 automated prep:** PASS (2026-05-28). Browser matrix below requires manual execution with PostgreSQL + PHP backend.

## Sign-off

| Tester | Date | Browser | Notes |
|--------|------|---------|-------|
| | | | |
