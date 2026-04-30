# 🏢 CA Gupta Office Management Portal

A **full-stack automated office-management portal** designed specifically for a **Chartered Accountancy practice** handling **100+ clients** with a team of **15+ professionals**. The portal centralises, automates, and streamlines all core operations — from client onboarding and compliance tracking to invoicing, appointments, and affiliate management.

The system comprises:

| Layer | Technology | URL |
|---|---|---|
| **Public marketing site** | React + Vite | `https://carahulgupta.in` |
| **Practice portal (web app)** | React + Vite | `https://app.carahulgupta.in` |
| **PHP API backend** | PHP 8.1 + PostgreSQL | `https://carahulgupta.in/api/` |
| **Email notification service** | Node.js + Brevo | `backend/` (internal) |

---

## 🎯 Vision & Purpose

Instead of juggling multiple tools (Excel, Tally, WhatsApp, emails, and random folders), this portal provides:

- A **single pane of glass** for managing clients, services, tasks, documents, and finances.
- Automated compliance workflows (recurring services, registers, reminders, document sharing).
- A **secure client portal** for document viewing, service status, and ledger access.
- An **affiliate portal** for referral partners to track commissions, payouts, and sub-affiliates.
- **Native calendar sync** with Google, Outlook, and Apple CalDAV.
- **Online appointment booking** with Razorpay payment and automatic Zoom meeting creation.

---

## ✅ Features Built (Current State)

### 1. Authentication & Access Control
- Email OTP login, Google OAuth, and Microsoft (MSAL) OAuth for the **staff portal**.
- Separate OTP-based login for the **client portal**.
- Three portal types served from the same app: `staff`, `client`, `affiliate`.
- Role-based access control (RBAC) — `super_admin`, `admin`, `manager`, `staff`, `viewer`.
- Delegate permissions — granular per-user permission overrides on top of roles.
- JWT sessions stored in DB (server-side revocation on logout).

### 2. Dashboard
- KPI cards: pending tasks, overdue services, monthly revenue, active clients.
- Drill-down views (`DashboardMetricDetail`) for each metric.
- Today's tasks, pending follow-ups, and upcoming deadlines at a glance.

### 3. Client & Organization Management
- Separate **Contacts** (individuals) and **Organizations** (companies) modules.
- PAN-based deduplication — identical PAN rejected at create/update with a conflict payload.
- Soft duplicate warning on similar names (informational only).
- **Client Groups** for batch billing and service assignment.
- KYC document collection per contact and organization.
- **Exception reports** for contacts and organizations missing required fields or KYC documents.
- Contact–organization linking (one contact can belong to multiple organizations).

### 4. Services & Engagement Management
- Define service **categories** and **sub-categories** (e.g. GST Return, ITR Filing, ROC).
- Open engagements per client/organization with assignees, due dates, and billing closure.
- **Multi-assignee** support per service engagement.
- Sub-task tracking within engagements.
- **Service logs** — timestamped notes and activity feed per engagement.
- **Time tracking** — per-staff time entries with live timer, start/stop, and handoff between staff members.
- Service engagement files — attach and manage documents per engagement.
- **Recurring service definitions** — per-client compliance schedules (monthly / quarterly / half-yearly / annual) that drive expected register rows and due dates (migration 044).
- KPI list view for service performance analytics.

### 5. Compliance Registers
- Compliance register tabs: **GST**, **TDS**, **Income Tax (IT)**, **ROC**, **PF**, **Payment**.
- Each engagement type maps to a register category.
- Register entries carry: return type, period label, period start/end, filed-by, acknowledgment number, error number, late fee, and linked service.
- Registers auto-populated via recurring service definitions.
- Sub-filters for granular register viewing per client/period.

### 6. Invoicing & Financial Ledger
- Raise invoices with **GST line-item breakdown** (CGST, SGST, IGST) per Indian regulations.
- Transaction (`txn`) model covering invoices, payments, and expenses with proper ledger signs.
- Opening balances per client.
- Aged receivables and outstanding balance tracking.
- **Razorpay integration** for online appointment payments (webhook-verified).
- Appointment invoice auto-generation on payment confirmation.
- Affiliate commission accrual and sync per invoice line item.

### 7. Appointments & Calendar
- Staff-wise appointment slots with configurable **fee rules** per engagement type.
- Online booking with Razorpay payment gateway and automatic **Zoom meeting** creation.
- Two-way **calendar sync**: Google Calendar, Outlook Calendar, Apple CalDAV.
- Integrated calendar view for tasks, appointments, deadlines, and staff leave.
- Push events to/from connected calendars on create/update/cancel.

### 8. Document Management
- Upload, tag, categorize, and version-control documents per engagement.
- Central **Document Library** independent of services.
- KYC document collection with exception reporting.

### 9. Credentials Vault
- Securely store client portal credentials (login IDs, passwords, portal URLs).
- Permission-based access — staff and manager roles only.

### 10. Leads & Quotations
- Capture leads with source, stage, and assigned owner.
- Create quotations linked to leads with per-engagement-type default pricing.
- Follow-up reminders and lead lifecycle tracking.
- **Pending Follow-Ups** dashboard for overdue lead actions.

### 11. Affiliate Portal
- Dedicated portal for referral affiliates (`/affiliate/*` routes).
- Dashboard with commission summary, pending payouts, and active services.
- Sub-affiliate tree (upline tracker).
- Commission accrual per invoice line with configurable rates.
- Payout request workflow.
- Bank detail management.
- Firm-level commission defaults with per-affiliate overrides.

### 12. Client Portal
- Dedicated self-service portal for clients (`/client/*` routes).
- View active and completed services.
- Client ledger (invoice history, payment records, outstanding balance).
- Client profile management.
- Service detail view with log entries and file downloads.

### 13. Leave Management
- Staff leave requests and approval workflow.
- Handover assignment modal for active service tasks during leave.
- Leave calendar integration.

### 14. Timesheets & Shift Targets
- Per-user daily timesheet with billable/non-billable breakdown.
- Shift target configuration (minutes per day per user).
- Timesheets report with date-range and staff filters.
- Shift-target timesheet report for gap analysis.
- **Cron job** (6 AM daily): sends low-timesheet intimation emails to individual staff.
- **Cron job** (5 AM daily): sends consolidated super-admin digest with team attendance.

### 15. Global Search
- Full-text search across clients, organizations, services, leads, and invoices from a single input.

### 16. User Management & Settings
- Create/edit/deactivate staff users with role assignment.
- Per-user delegate permissions beyond the base role.
- Firm-level settings (portal types, engagement type definitions, quotation defaults).
- Admin audit log — all create/update/delete operations recorded.

### 17. Notifications & Email
- **Brevo (Sendinblue)** transactional email for OTP, appointment confirmations, invoice receipts, timesheet intimations, and digest reports.
- **DigestQueue** library for batching and deduplicating notification sends.
- Browser-console debug logging of all API responses (`response.data.debug`) in non-production environments.

---

## 🗄️ Database

**PostgreSQL 14+** is the sole database. 44 migrations cover the full schema:

| Migration range | Coverage |
|---|---|
| 001–010 | Initial schema, SSO, OTP, service categories, payments, opening balances, client groups, leads, portal types |
| 011–020 | Transactions, contact–org linking, engagement subcategories, quotation setup, GST breakdown, delegate permissions |
| 021–030 | Audit log, affiliate commissions, billing closure, time entries, appointments + Zoom + Razorpay, client referral, service assignees, app grants, client portal login |
| 031–040 | Super-admin digest, client group uniqueness, contact/org status fields, time-entry timers, staff leaves, temp assignments, service logs |
| 041–044 | Shift targets, calendar sync, KYC documents, **recurring service definitions + extended registers** |

Run migrations in order:

```bash
psql -h <host> -U <user> -d <dbname> -f server-php/database/migrations/001_initial_schema.sql
# ... through ...
psql -h <host> -U <user> -d <dbname> -f server-php/database/migrations/044_registers_recurring.sql
```

---

## 🔗 Third-Party Integrations

| Integration | Purpose | Library |
|---|---|---|
| **Google OAuth** | Staff SSO | `@react-oauth/google` (frontend) |
| **Microsoft (MSAL)** | Staff SSO | `@azure/msal-browser` (frontend) |
| **Google Calendar** | Two-way calendar sync | `GoogleCalendarClient.php` |
| **Outlook Calendar** | Two-way calendar sync | `OutlookCalendarClient.php` |
| **Apple CalDAV** | Two-way calendar sync | `AppleCalDAVClient.php` |
| **Zoom** | Auto-create meetings for paid appointments | `ZoomOAuthClient.php`, `ZoomMeetingService.php` |
| **Razorpay** | Appointment payment gateway | `RazorpayClient.php`, webhook handler |
| **Brevo** | Transactional email (OTP, invoices, digests) | `BrevoMailer.php`, `backend/` Node service |

---

## 📱 Mobile Applications (Planned — Phase 12 & 13)

Two separate React Native apps will be built from a **shared monorepo** (`mobile/`) for maximum code reuse while maintaining distinct user experiences and permission boundaries.

| Concern | Team App (`ca-team-app`) | Client App (`ca-client-app`) |
|---|---|---|
| **Users** | 15+ CA staff, partners, managers | 100+ clients and their representatives |
| **Operations** | Heavy read + write (tasks, invoices, docs, credentials) | Primarily read + limited write (view docs, book appointments, submit requests) |
| **Security** | Access to all clients, internal dashboards, credentials vault | Isolated to own data only |
| **Distribution** | Internal (MDM / Enterprise) or Play Store / App Store | Public — Play Store & App Store |

### Mobile Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo or bare workflow) |
| Language | TypeScript |
| Navigation | React Navigation v7+ |
| State | Redux Toolkit + TanStack Query |
| Forms | React Hook Form + Zod |
| HTTP | Axios (shared interceptors from `shared-services`) |
| Push Notifications | Firebase Cloud Messaging (FCM) + APNs |
| File Handling | `react-native-document-picker` + `react-native-camera` |
| Secure Storage | `react-native-keychain` / `expo-secure-store` (biometric auth) |
| Offline | WatermelonDB / MMKV for low-connectivity caching |
| PDF Viewer | `react-native-pdf` |
| Charts | Victory Native |
| Testing | Jest + React Native Testing Library + Detox |
| CI/CD | GitHub Actions + Fastlane + EAS Build |

### Mock API for Mobile Dev

During mobile development the `mock-api/` JSON server will stand in for the live PHP backend:

```bash
cd mock-api
npx json-server --watch db.json --port 3001
```

Point the mobile apps at `http://localhost:3001` via the `EXPO_PUBLIC_API_BASE_URL` env variable in `mobile/apps/team-app/.env`.

---

## 📂 Actual Project Structure

```
/
├── /web                          # React Portal App (app.carahulgupta.in)
│   ├── /src
│   │   ├── /auth                 # AuthContext, MsalConfig, ProtectedRoute
│   │   ├── /components
│   │   │   ├── /calendar         # CalendarSyncSettings
│   │   │   ├── /common           # ClientSearchDropdown, DateInput, StatusBadge,
│   │   │   │                     # ListPaginationBar, RegisterSubFilters, etc.
│   │   │   ├── /documents        # KycDocumentTab
│   │   │   ├── /layout           # Sidebar, TopBar, AffiliateLayout, ClientLayout
│   │   │   ├── /leaves           # HandoverAssignmentModal
│   │   │   ├── /registers        # RegisterEntryModal
│   │   │   └── /services         # AddLogModal, AddTaskModal, ServiceLogPanel,
│   │   │                         # TimerHandoffModal, TimeEntryModifyModal, etc.
│   │   ├── /constants            # billingProfiles, config, registerConfig, roles, etc.
│   │   ├── /context              # NotificationContext
│   │   ├── /hooks                # useElapsedTimer, useServiceTimer, useStaffUsers,
│   │   │                         # useTimesheetReportFilters
│   │   ├── /pages
│   │   │   ├── /affiliate        # AffiliateDashboard, AffiliateCommissions,
│   │   │   │                     # AffiliateServices, AffiliateBank, AffiliatePayouts,
│   │   │   │                     # AffiliateSubAffiliates
│   │   │   ├── /client           # ClientActiveServices, ClientCompletedServices,
│   │   │   │                     # ClientLedger, ClientProfile, ClientServiceDetails
│   │   │   ├── Dashboard, DashboardMetricDetail
│   │   │   ├── Clients, Contacts, ContactCreatePage, Organizations, OrganizationCreatePage
│   │   │   ├── ClientGroups, AdminAffiliates
│   │   │   ├── Services, NewServiceEngagement, ServiceEngagementEdit,
│   │   │   │   ServiceEngagementManage, ServiceEngagementFiles, ServicesKpiList
│   │   │   ├── RecurringServices
│   │   │   ├── Documents, Credentials
│   │   │   ├── Registers
│   │   │   ├── Invoices
│   │   │   ├── Calendar, AppointmentFeeRules
│   │   │   ├── Leads, PendingFollowUps
│   │   │   ├── LeaveManagement
│   │   │   ├── TimesheetsReport, ShiftTargetTimesheetReport
│   │   │   ├── GlobalSearchPage
│   │   │   ├── ContactExceptionsReport, OrganizationExceptionsReport,
│   │   │   │   ContactKycExceptionsReport, OrganizationKycExceptionsReport
│   │   │   ├── UserManagement, Settings, Profile
│   │   │   └── Login
│   │   └── /services             # Axios API service layer
│   ├── tailwind.config.js
│   └── package.json
│
├── /web-public                   # Public Marketing Site (carahulgupta.in)
│   ├── /src
│   │   ├── /components           # NavBar (portal dropdown), Footer, Hero,
│   │   │                         # ServicesGrid, WhyUs, FaqAccordion, CtaBanner
│   │   ├── /config               # site.config.js (PORTAL_URL, contact info)
│   │   ├── /content              # services.js, faqs.js, blogPosts.js
│   │   └── /pages                # Home, About, Services, Blog, BlogPost, Contact, NotFound
│   └── package.json
│
├── /server-php                   # PHP 8.1 API Backend (carahulgupta.in/api/)
│   ├── /app
│   │   ├── /Config               # App, Auth, Database, Routes
│   │   ├── /Controllers
│   │   │   ├── /Admin            # All admin-facing CRUD controllers
│   │   │   ├── /Affiliate        # AffiliatePortalController
│   │   │   ├── /Auth             # AuthController (JWT, OTP, SSO)
│   │   │   ├── /Client           # ClientPortalController, Client ServiceLogController
│   │   │   ├── /Integrations     # Google/Outlook/Apple calendar callbacks, ZoomCallback
│   │   │   └── /Webhooks         # RazorpayWebhookController
│   │   ├── /Filters              # AuthFilter, RoleFilter, PermissionFilter
│   │   ├── /Helpers              # response_helper (standard JSON envelope)
│   │   ├── /Libraries            # BrevoMailer, CalendarSyncService, CommissionSyncService,
│   │   │                         # DigestQueue, GoogleCalendarClient, OutlookCalendarClient,
│   │   │                         # AppleCalDAVClient, GstInvoiceTax, InvoiceLineCommission,
│   │   │                         # JWT, OtpService, PasswordHasher, RazorpayClient,
│   │   │                         # ZoomOAuthClient, ZoomMeetingService,
│   │   │                         # AppointmentBookingService, AppointmentInvoiceBuilder,
│   │   │                         # AppointmentPaymentHooks
│   │   ├── /Models               # 40+ Eloquent-style models for every entity
│   │   └── /Templates            # Email HTML templates
│   ├── /cli                      # Cron scripts (send-digest, timesheet-report, intimation)
│   ├── /database
│   │   └── /migrations           # 044 idempotent SQL migrations (001 → 044)
│   └── /public                   # Entry point (index.php + .htaccess)
│
├── /backend                      # Node.js email-notification service (Brevo)
│   ├── /src
│   │   ├── /config
│   │   ├── /routes
│   │   ├── /services
│   │   ├── /templates
│   │   └── /__tests__
│   └── package.json
│
├── /mobile                       # 🗓 PLANNED — React Native Mobile Apps (monorepo)
│   ├── /packages
│   │   ├── /shared-ui            # Reusable UI components (buttons, cards, modals)
│   │   ├── /shared-services      # API clients, auth logic, push notification handlers
│   │   ├── /shared-types         # TypeScript interfaces (Client, Invoice, Task, etc.)
│   │   └── /shared-utils         # Date formatting, currency helpers, validators
│   ├── /apps
│   │   ├── /team-app             # Internal CA team app (ca-team-app)
│   │   └── /client-app           # Client-facing app (ca-client-app)
│   ├── nx.json / turbo.json      # Monorepo orchestration
│   └── package.json
│
├── /mock-api                     # 🗓 PLANNED — JSON mock server for mobile dev
│   ├── db.json                   # Seed data for all entities
│   └── routes.json               # Route overrides
│
├── .github
│   └── /workflows
│       └── deploy-cpanel.yml     # Manual build + rsync to cPanel
│
└── README.md
```

---

## 🛠 Tech Stack

### Web App (`web/`)

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS |
| HTTP | Axios (with debug-console interceptor) |
| Auth | JWT + Google OAuth (`@react-oauth/google`) + Microsoft MSAL |
| Forms | Controlled components + custom validation |
| Calendar UI | FullCalendar |
| Charts | Recharts |

### PHP Backend (`server-php/`)

| Layer | Technology |
|---|---|
| Language | PHP 8.1 |
| Architecture | Lightweight MVC (CodeIgniter-style, no framework dependency) |
| Database | PostgreSQL 14 via PDO prepared statements |
| Auth | JWT (HS256) + bcrypt passwords + OTP |
| Email | Brevo (Sendinblue) REST API |
| Payments | Razorpay (orders + webhooks) |
| Video | Zoom OAuth + Meetings API |
| Calendar | Google Calendar API, Microsoft Graph, Apple CalDAV |
| Hosting | cPanel shared hosting (Apache + `mod_rewrite`) |

### Node.js Service (`backend/`)

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 + Express |
| Purpose | Supplementary email rendering and Brevo dispatch |
| Testing | Jest + Supertest |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x, **npm** >= 9.x
- **PHP** >= 8.1 with extensions: `pdo`, `pdo_pgsql`, `json`, `openssl`
- **PostgreSQL** >= 14
- **Apache** 2.4+ with `mod_rewrite` (for local PHP dev) or **cPanel** hosting

### Web Portal (`web/`)

```bash
cd web
npm install
npm run dev          # http://localhost:5173

# Build for production
npm run build        # outputs web/dist/  → upload to public_html/app/
```

> **Production note:** Build locally and upload `dist/` to `public_html/app/` on cPanel. All testing is against the live URL — there is no staging environment. See [`server-php/README.md`](server-php/README.md) for the browser-console logging strategy.

### Public Marketing Site (`web-public/`)

```bash
cd web-public
npm install
npm run dev          # http://localhost:5174
npm run build        # outputs web-public/dist/ → upload to public_html/
```

### PHP Backend (`server-php/`)

```bash
# 1. Copy env
cp server-php/.env.example server-php/.env
# Fill in DB_HOST, DB_NAME, DB_USER, DB_PASS, JWT_SECRET, CORS_ORIGIN, etc.

# 2. Run all migrations in order
psql -h <host> -U <user> -d <dbname> \
  -f server-php/database/migrations/001_initial_schema.sql
# ... repeat for 002 through 044

# 3. Point Apache DocumentRoot at server-php/public/
# OR upload server-php/ as public_html/api/ on cPanel (see server-php/README.md)
```

### Node.js Email Service (`backend/`)

```bash
cd backend
cp .env.example .env   # fill in BREVO_API_KEY, etc.
npm install
npm run dev            # starts on configured port
```

### Cron Jobs (PHP CLI)

Schedule in cPanel → Cron Jobs:

```bash
# 5:00 AM — Super-admin consolidated timesheet digest
0 5 * * * php /home/carahulgupta/public_html/api/cli/send-superadmin-timesheet-report.php

# 6:00 AM — Per-staff low-timesheet intimation emails
0 6 * * * php /home/carahulgupta/public_html/api/cli/send-timesheet-intimation.php

# Daily digest queue flush (frequency as needed)
0 7 * * * php /home/carahulgupta/public_html/api/cli/send-digest.php
```

---

## 🌐 Public Marketing Site & Portal Handoff

The marketing site (`web-public/`) and the portal (`web/`) are fully decoupled. The navbar login dropdown passes a `?portal=` parameter so the portal's Login page can lock to the correct tab:

```
https://app.carahulgupta.in/login?portal=staff
https://app.carahulgupta.in/login?portal=affiliate
https://app.carahulgupta.in/login?portal=client
```

If `/login` is opened without a `portal=` parameter (e.g. a direct bookmark), the portal falls back to the 3-tab selector.

### cPanel Subdomain Layout

| Hostname | DocumentRoot | Source |
|---|---|---|
| `carahulgupta.in` (and `www.`) | `public_html/` | `web-public/dist/` |
| `app.carahulgupta.in` | `public_html/app/` | `web/dist/` |
| `carahulgupta.in/api/` | `public_html/api/` | `server-php/` |

### Environment Variables

**`web-public/.env`**

| Variable | Purpose | Default |
|---|---|---|
| `VITE_PORTAL_URL` | Portal base URL for login dropdown links | `https://app.carahulgupta.in` |

**`web/.env`**

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | PHP API base URL | *(omit for mock/dev mode)* |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `VITE_MSAL_CLIENT_ID` | Azure App Registration client ID | — |
| `VITE_MSAL_TENANT_ID` | Azure tenant ID | `common` |
| `VITE_MARKETING_URL` | "Wrong portal?" escape link target | `https://carahulgupta.in` |

### GitHub Actions Deployment

One manual workflow (`.github/workflows/deploy-cpanel.yml`) builds and rsyncs all three artifacts:

| GitHub Secret | Example Value | Used For |
|---|---|---|
| `CPANEL_REMOTE_ROOT` | `/home/carahulgupta/public_html/app` | Portal (`web/dist/`) |
| `CPANEL_SITE_ROOT` | `/home/carahulgupta/public_html` | API + marketing |
| `VITE_PORTAL_URL` | `https://app.carahulgupta.in` | `web-public` build |
| `VITE_MARKETING_URL` | `https://carahulgupta.in` | Portal "Wrong portal?" link |
| `MIGRATION_DB_USER` | `carahulgupta` | Table-owner role for `ALTER TABLE` migrations |
| `MIGRATION_DB_PASS` | *(phpPgAdmin password)* | Password for `MIGRATION_DB_USER` |

> **cPanel note:** cPanel creates tables owned by the phpPgAdmin default user (`carahulgupta`), but the runtime app DB user (`carahulgupta_cagupta_user`) is a restricted role without ownership. `database/migrate.php` uses `MIGRATION_DB_USER`/`MIGRATION_DB_PASS` for DDL migrations and falls back to `DB_USER`/`DB_PASS` when they are absent (safe for local dev).

---

## 🔐 Authentication Setup

### Dev / Mock Mode

Run `npm run dev` inside `web/` — no backend required.

| Method | Behaviour in mock mode |
|---|---|
| Email OTP | Any email works; enter **`123456`** as the OTP |
| Google | Fallback button that sets a dummy session |
| Microsoft | MSAL popup; fails gracefully if not configured |

### Backend Auth Endpoints

| Method | Endpoint | Body |
|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` |
| `POST` | `/api/auth/sso` | `{ provider, sso_token, name, email, avatar_url }` |
| `POST` | `/api/auth/request-otp` | `{ email }` (client portal) |
| `POST` | `/api/auth/verify-otp` | `{ email, otp }` (client portal) |
| `GET` | `/api/auth/me` | Bearer token |
| `POST` | `/api/auth/logout` | Bearer token |

All endpoints return: `{ success, message, data: { token, user }, errors, debug }`.

---

## 🔐 Security

| Area | Implementation |
|---|---|
| **Authentication** | JWT (HS256) with DB-stored sessions; server-side revocation on logout |
| **Authorization** | RBAC — `super_admin`, `admin`, `manager`, `staff`, `viewer`; delegate permission overrides |
| **Data integrity** | PDO prepared statements throughout — no raw SQL interpolation |
| **Passwords** | bcrypt (cost factor 12) |
| **API Security** | CORS per-origin allowlist, `.env` blocked via `.htaccess` |
| **Audit Trail** | `admin_audit_log` records all create/update/delete with actor, entity, and diff |
| **Debug logs** | In non-production: `response.data.debug[]` returned in JSON, forwarded to `console.debug` by Axios interceptor — no disk log files |
| **Compliance** | Indian data residency; GST-compliant invoicing (CGST/SGST/IGST) |
| **Payments** | Razorpay webhook signature verification before recording payment |
| **Calendar OAuth** | Tokens stored encrypted in DB; refresh handled server-side |

---

## 🗺️ Roadmap

| Phase | Focus | Status |
|---|---|---|
| **Phase 1** | Authentication (Email OTP, Google, Microsoft SSO), Dashboard, Client & Organization management | ✅ Complete |
| **Phase 2** | Services & Engagement management, time tracking, service logs, multi-assignee | ✅ Complete |
| **Phase 3** | Invoicing, GST transactions, ledger, opening balances, Razorpay payments | ✅ Complete |
| **Phase 4** | Calendar, appointment booking, Zoom integration, Google/Outlook/Apple calendar sync | ✅ Complete |
| **Phase 5** | Credentials vault, Leads & Quotations, Affiliate portal, Client portal | ✅ Complete |
| **Phase 6** | Compliance Registers (GST/TDS/IT/ROC/PF), Recurring Service Definitions | ✅ Complete (migration 044) |
| **Phase 7** | Leave management, timesheet reporting, shift targets, cron digests | ✅ Complete |
| **Phase 8** | KYC document management, exception reports, global search, client groups | ✅ Complete |
| **Phase 9** | **Recurring register auto-population** — backend scheduler to create register rows from `recurring_service_definitions` | 🔄 In Progress |
| **Phase 10** | **Client Portal enhancements** — appointment booking from client side, document upload requests, in-app messaging | 🗓 Planned |
| **Phase 11** | **Mock API server** — `mock-api/` JSON server (`json-server`) to unblock mobile development without requiring a live backend | 🗓 Planned |
| **Phase 12** | **React Native Team App** (`mobile/apps/team-app`) — Dashboard, Task Manager, Client directory, Document Hub, Invoicing, Credentials Vault, push notifications, biometric auth | 🗓 Planned |
| **Phase 13** | **React Native Client App** (`mobile/apps/client-app`) — Active/completed services, document viewer, ledger, appointment booking, in-app messaging | 🗓 Planned |
| **Phase 14** | **Tally integration**, AI-assisted compliance search, advanced analytics dashboards | 🗓 Planned |

---

## 🤝 Contributing

Open an issue or submit a PR. Please follow the existing file naming conventions (PascalCase for React components, `snake_case` for PHP) and ensure new migrations are idempotent (use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 📞 Contact

For questions or collaboration inquiries, open an issue or reach out to the maintainers.

---

> **Built with ❤️ for the Chartered Accountancy profession — because your practice deserves better than spreadsheets.**
