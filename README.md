# 🏢 Office Management Portal – Automated Practice Workbench for CA Firms

A **React‑based automated office‑management portal** designed specifically for a **Chartered Accountancy practice** handling **100+ clients** with a team of **15+ professionals**. The goal of this project is to **centralize, automate, and streamline** all core operations of the practice into a single, clean, and scalable web platform.

This repository contains the **frontend code** built in **React** and is intended to be **backend‑agnostic**, so it can later integrate with custom Node.js, PHP, .NET, or any other backend as per business needs.

Additionally, the project includes **two dedicated React Native mobile applications** — one for the **internal team** and one for **clients** — ensuring on‑the‑go access to all critical workflows.

---

## 🎯 Vision & Purpose

Instead of juggling multiple tools (Excel, Tally, WhatsApp, emails, and random folders), this portal aims to:

- Provide a **single pane of glass** for managing clients, services, tasks, documents, and finances.
- Automate repetitive workflows (invoice generation, reminders, document sharing, ledger maintenance, etc.).
- Allow **secure client access** for document viewing and request submission.
- Help the practice **scale** without adding proportionate overhead.
- Deliver **native mobile experiences** to both the team and clients for real‑time operations from anywhere.

---

## 🧩 Key Features Planned

### 1. **Services, Tasks & Sub‑tasks**
- Define **services** offered by the firm (e.g., ITR filing, GST return, ROC filings, audits, book‑keeping, etc.).
- Break each service into **tasks and sub‑tasks** with assignees, deadlines, and status.
- Track progress at service, task, and client level.

### 2. **Document Management within Services**
- Attach, upload, and version‑control **files within each service**.
- Add descriptions, categories, and tags to documents.
- Maintain a clear audit trail of who uploaded and when.

### 3. **Structured Document Library**
- A **central Document Library** where all files are organized by category and tag, independent of services.
- Fast search and filtering by client, year, document type, etc.
- Optional role‑based permissions (admin, staff, client).

### 4. **Client Portal & Login**
- Secure **client login** to access their own documents and request assistance.
- Transparent view of pending tasks, recent invoices, and upcoming events.
- Web‑based communication channel to reduce reliance on WhatsApp and email for trivial queries.

### 5. **One‑Click Document Sharing**
- Share documents with clients via **email, SMS, WhatsApp, or download link** in a single click.
- Support for **bulk actions** (e.g., share all documents for a particular year).
- Security layer: expiry links, access logs, and download tracking.

### 6. **Calendar & Appointments**
- Integrated **calendar** for tasks, deadlines, and client meetings.
- Online **appointment booking** for clients (with slots, durations, and reminders).
- Staff‑wise calendar view to avoid over‑scheduling.

### 7. **Client Ledger & Invoicing**
- Track **client ledger** across multiple billing firms (e.g., separate invoices for different services/banks, but a single consolidated ledger view).
- Raise **invoices** from the portal, with templates and GST support as per Indian regulations.
- View pending, paid, and overdue invoices with aging filters.

### 8. **Credentials & Automated Registers**
- Maintain **client credentials** (login IDs, passwords, portal URLs) in a secure, permission‑based manner.
- Auto‑generate **registers** (e.g., GST filing, ROC, TDS, Tally‑related registers) from active services and tasks.

### 9. **Quotations & Leads Management**
- Capture **leads** with source, stage, and probability.
- Create and manage **quotations** for new services.
- Set **timely reminders** for follow‑ups and renewal dates.

### 10. **Extensibility & Future Ideas**
This portal will be designed to accommodate any feature that increases **productivity, compliance, or client experience**, such as:
- Integration with **Tally** or **accounting APIs**.
- Workflow approvals (e.g., manager approval for final submissions).
- Role‑based dashboards and reports.
- Mobile‑friendly / responsive UI for working from anywhere.

---

## 🗄️ Recommended Database Strategy

Since this is primarily a frontend project, the database lives on the backend. However, the choice of database is critical for the long‑term success and scalability of the portal. Below is our **recommended multi‑database strategy** tailored for a CA practice workbench:

### Primary Database — **PostgreSQL** ✅ (Strongly Recommended)

| Aspect | Detail |
|--------|--------|
| **Why** | PostgreSQL is the gold standard for structured, transactional business data — exactly what a CA firm needs. |
| **Best For** | Client master data, ledgers, invoices, tasks, services, user roles & permissions, audit logs, registers, and all relational/financial data. |
| **Key Strengths** | ACID compliance, complex joins & queries, full‑text search, JSONB support (for flexible metadata), row‑level security, and excellent performance for reporting & analytics. |
| **Indian Compliance** | Handles GST calculations, multi‑entity billing, and financial year partitioning natively with proper schema design. |
| **ORM / Query Layer** | Use **Prisma**, **TypeORM**, or **Sequelize** (Node.js); **Entity Framework** (.NET); or **Eloquent** (PHP/Laravel). |
| **Scaling** | Supports read replicas, partitioning, and connection pooling (PgBouncer) for handling 100+ concurrent client sessions. |

### Secondary Database — **MongoDB** (Optional, for specific use cases)

| Aspect | Detail |
|--------|--------|
| **Why** | Ideal for storing unstructured or semi‑structured data that doesn't fit neatly into relational tables. |
| **Best For** | Activity/audit logs, notification streams, chat messages, document metadata with variable schemas, and client communication history. |
| **Key Strengths** | Schema‑less flexibility, horizontal scaling, native JSON storage, excellent for real‑time event streams. |
| **ORM / Driver** | Use **Mongoose** (Node.js) or the native MongoDB driver. |

### File / Object Storage — **AWS S3 / MinIO / Google Cloud Storage**

| Aspect | Detail |
|--------|--------|
| **Why** | Documents (PDFs, Excel files, images, scanned copies) should never be stored in the database. |
| **Best For** | All uploaded documents, invoices, signed copies, and client submissions. |
| **Key Strengths** | Unlimited scalable storage, CDN integration, versioning, signed URLs for secure sharing, and lifecycle policies for archival. |

### Caching Layer — **Redis**

| Aspect | Detail |
|--------|--------|
| **Why** | For blazing‑fast responses on dashboards, session management, and rate limiting. |
| **Best For** | Session tokens, frequently accessed data (dashboard KPIs, task counts), real‑time notification queues, and API response caching. |

### Search Engine — **Elasticsearch** or **Meilisearch** (Optional)

| Aspect | Detail |
|--------|--------|
| **Why** | The Document Library and client search need fast, typo‑tolerant, filterable full‑text search. |
| **Best For** | Searching across thousands of documents, client records, invoices, and registers by keyword, tag, date, or type. |

### Recommended Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND LAYER                        │
│  React Web App  │  Team Mobile App  │  Client Mobile App│
└────────┬────────┴─────────┬─────────┴─────────┬─────────┘
         │        REST / GraphQL APIs           │
         ▼                                      ▼
┌─────────────────────────────────────────────────────────┐
│                  BACKEND / API LAYER                    │
│         Node.js / .NET / PHP (Laravel)                  │
├─────────────┬──────────────┬──────────────┬─────────────┤
│ PostgreSQL  │   MongoDB    │  Redis Cache │ S3 / MinIO  │
│ (Primary)   │ (Events/Logs)│  (Sessions)  │ (Documents) │
├─────────────┴──────────────┴──────────────┴─────────────┤
│         Elasticsearch / Meilisearch (Search)            │
└─────────────────────────────────────────────────────────┘
```

### Why Not Firebase / Firestore?

While Firebase is excellent for rapid prototyping and small apps, a CA firm's portal has:
- Complex relational data (multi‑entity invoicing, ledger reconciliation).
- Strict data‑sovereignty and compliance needs (Indian data residency).
- Need for advanced reporting/analytics that Firestore's query model doesn't support well.
- Cost unpredictability at scale.

**PostgreSQL gives you full control, compliance, and cost predictability.**

---

## 📱 React Native Mobile Applications

The project includes **two separate React Native mobile applications**, built from a **shared monorepo** for maximum code reuse while maintaining distinct user experiences and permission boundaries.

### Why Two Separate Apps?

| Concern | Team App | Client App |
|---------|----------|------------|
| **Users** | 15+ CA staff, partners, managers | 100+ clients and their representatives |
| **Operations** | Heavy read + write (create tasks, assign work, generate invoices, manage docs) | Primarily read + limited write (view docs, book appointments, submit requests) |
| **Security** | Access to all clients, internal dashboards, credentials vault, admin features | Isolated to own data only — documents, invoices, tasks, appointments |
| **Complexity** | High — role‑based workflows, bulk operations, analytics | Low to medium — clean dashboard, document viewer, request forms |
| **App Store** | Internal distribution (MDM / Enterprise) or Play Store / App Store | Public distribution on Play Store & App Store |

### 📲 Team App — `ca-team-app`

**Purpose:** The internal command center for the CA firm's professionals.

**Key Features:**
- 🏠 **Dashboard** — Today's tasks, pending deadlines, overdue items, team workload heatmap.
- 📋 **Task Manager** — Create, assign, track, and close tasks/sub‑tasks with real‑time status updates.
- 👥 **Client Management** — Full client directory with contact, PAN, GSTIN, engagement details.
- 📂 **Document Hub** — Upload, tag, categorize, and share documents on the go (camera + file picker).
- 💰 **Invoicing & Ledger** — Raise invoices, record payments, view client ledger and aging reports.
- 📅 **Calendar** — Task deadlines, client meetings, filing due dates, staff leave calendar.
- 🔑 **Credentials Vault** — Securely access stored client portal credentials (biometric‑protected).
- 📊 **Reports & Registers** — Auto‑generated GST, TDS, ROC filing registers; practice analytics.
- 🔔 **Push Notifications** — Deadline reminders, client document uploads, payment receipts, task assignments.
- 💬 **Internal Chat** — Quick team communication without leaving the app.

### 📲 Client App — `ca-client-app`

**Purpose:** A transparent, self‑service portal for the firm's clients.

**Key Features:**
- 🏠 **Dashboard** — Overview of active services, pending tasks, recent invoices, upcoming deadlines.
- 📂 **My Documents** — View, download, and upload documents requested by the firm.
- 🧾 **Invoices & Payments** — View invoice history, download PDFs, check outstanding balances.
- 📅 **Appointments** — Book meetings with assigned CA/staff, view available slots, receive confirmations.
- 📝 **Service Requests** — Submit new requests (e.g., "Need ITR filed", "Send me Form 16") with attachments.
- 🔔 **Push Notifications** — Alerts for new documents shared, invoice raised, task completed, appointment reminders.
- 💬 **Messaging** — Communicate with the assigned professional directly from the app.
- 🔐 **Security** — Biometric login, OTP verification, encrypted data at rest.

### 🏗️ Monorepo Architecture

We use a **monorepo** (powered by **Nx** or **Turborepo**) to share common code between both apps while keeping them independently deployable:

```
/mobile
├── /packages
│   ├── /shared-ui          # Reusable UI components (buttons, cards, modals, lists)
│   ├── /shared-services    # API clients, auth logic, push notification handlers
│   ├── /shared-types       # TypeScript interfaces & types (Client, Invoice, Task, etc.)
│   └── /shared-utils       # Date formatting, currency helpers, validation schemas
│
├── /apps
│   ├── /team-app           # CA Team App (ca-team-app)
│   │   ├── /src
│   │   │   ├── /screens    # Dashboard, Tasks, Clients, Documents, Invoices, Calendar, etc.
│   │   │   ├── /navigation # Stack & Tab navigators (admin‑level routes)
│   │   │   ├── /store      # Redux Toolkit slices + React Query hooks
│   │   │   └── /config     # Environment config, feature flags
│   │   ├── android/
│   │   ├── ios/
│   │   └── package.json
│   │
│   └── /client-app         # Client App (ca-client-app)
│       ├── /src
│       │   ├── /screens    # Dashboard, Documents, Invoices, Appointments, Requests, etc.
│       │   ├── /navigation # Stack & Tab navigators (client‑level routes)
│       │   ├── /store      # Redux Toolkit slices + React Query hooks
│       │   └── /config     # Environment config, feature flags
│       ├── android/
│       ├── ios/
│       └── package.json
│
├── nx.json / turbo.json    # Monorepo orchestration config
├── tsconfig.base.json
└── package.json
```

### Mobile Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React Native (with Expo or bare workflow) | Cross‑platform iOS & Android development |
| **Language** | TypeScript | Type safety across the entire codebase |
| **Navigation** | React Navigation v7+ | Type‑safe stack, tab, and drawer navigators |
| **State Management** | Redux Toolkit + React Query (TanStack Query) | Global state + server‑state caching & sync |
| **Forms** | React Hook Form + Zod | Performant forms with schema‑based validation |
| **HTTP Client** | Axios | API communication with interceptors for auth |
| **Push Notifications** | Firebase Cloud Messaging (FCM) + APNs | Real‑time alerts and reminders |
| **File Handling** | react-native-document-picker + react-native-camera | Upload documents and scan physical papers |
| **Secure Storage** | react-native-keychain / expo-secure-store | Biometric auth, token storage, credential vault |
| **Offline Support** | WatermelonDB / MMKV | Local caching for low‑connectivity scenarios |
| **PDF Viewer** | react-native-pdf | View invoices and documents in‑app |
| **Charts** | react-native-chart-kit / Victory Native | Dashboard analytics and reports |
| **Testing** | Jest + React Native Testing Library + Detox | Unit, integration, and E2E testing |
| **CI/CD** | GitHub Actions + Fastlane + EAS Build | Automated builds, testing, and store deployment |

---

## 🛠 Web Frontend Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Core** | React 18+ | UI framework |
| **Routing** | React Router v6+ | Module‑based routing |
| **State** | Redux Toolkit + React Query | Global + server state management |
| **Forms** | React Hook Form + Zod | Invoice, task, client, and quotation forms |
| **HTTP** | Axios | REST API communication |
| **Styling** | Tailwind CSS or Material UI (MUI) | Responsive, modern UI design |
| **Tables** | TanStack Table (React Table) | Client lists, registers, ledger views |
| **Charts** | Recharts or Chart.js | Dashboard analytics |
| **PDF** | react-pdf / jsPDF | Invoice generation and document viewing |
| **Calendar** | FullCalendar or react-big-calendar | Task deadlines, appointments, events |
| **Auth** | JWT + OAuth 2.0 | Secure authentication and authorization |

---

## 📂 Full Project Structure (High‑Level)

```
/
├── /web-public                   # Public marketing website (carahulgupta.in)
│   ├── /src
│   │   ├── /assets
│   │   ├── /components
│   │   │   ├── /layout           # NavBar (with portal dropdown), Footer
│   │   │   ├── /sections         # Hero, ServicesGrid, WhyUs, FaqAccordion, CtaBanner
│   │   │   └── /ui               # Container, Button
│   │   ├── /config               # site.config.js (PORTAL_URL, contact info)
│   │   ├── /content              # services.js, faqs.js, blogPosts.js
│   │   └── /pages                # Home, About, Services, Blog, BlogPost, Contact
│   ├── /public                   # .htaccess, favicon, robots.txt
│   └── package.json
│
├── /web                          # React Web Application (portal at app.carahulgupta.in)
│   ├── /public
│   ├── /src
│   │   ├── /assets               # Images, icons, fonts
│   │   ├── /components           # Reusable UI components
│   │   │   ├── /common           # Buttons, modals, cards, loaders
│   │   │   ├── /layout           # Sidebar, header, footer, page wrappers
│   │   │   └── /forms            # Form components (invoice, task, client, etc.)
│   │   ├── /features             # Feature modules
│   │   │   ├── /dashboard        # Main dashboard
│   │   │   ├── /clients          # Client management
│   │   │   ├── /services         # Services, tasks, sub‑tasks
│   │   │   ├── /documents        # Document library & management
│   │   │   ├── /invoicing        # Invoices, ledger, payments
│   │   │   ├── /calendar         # Calendar & appointments
│   │   │   ├── /credentials      # Secure credentials vault
│   │   │   ├── /registers        # Auto‑generated registers
│   │   │   ├── /quotations       # Quotations & leads
│   │   │   └── /settings         # Firm settings, user management, roles
│   │   ├── /hooks                # Custom React hooks
│   │   ├── /services             # API service layer (Axios instances)
│   │   ├── /store                # Redux store, slices, middleware
│   │   ├── /utils                # Helper functions, formatters, validators
│   │   ├── /types                # TypeScript interfaces and types
│   │   ├── /routes               # Route definitions and guards
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── /mobile                       # React Native Mobile Applications
│   ├── /packages                 # Shared packages (see monorepo structure above)
│   ├── /apps
│   │   ├── /team-app             # Internal team app
│   │   └── /client-app           # Client‑facing app
│   ├── nx.json
│   └── package.json
│
├── /docs                         # Documentation
│   ├── API-CONTRACTS.md          # Mock API contracts for backend integration
│   ├── DATABASE-SCHEMA.md        # PostgreSQL schema design
│   ├── DEPLOYMENT.md             # Deployment guides (web + mobile)
│   └── CONTRIBUTING.md           # Contribution guidelines
│
├── /mock-api                     # Mock JSON server for development
│   ├── db.json
│   └── routes.json
│
├── .github
│   └── /workflows                # GitHub Actions CI/CD pipelines
│       ├── web-ci.yml
│       ├── team-app-ci.yml
│       └── client-app-ci.yml
│
├── README.md                     # ← You are here
├── LICENSE
└── .gitignore
```

---

## 🔐 Security Considerations

| Area | Implementation |
|------|---------------|
| **Authentication** | JWT tokens with refresh rotation; OAuth 2.0 for SSO; OTP for client login |
| **Authorization** | Role‑based access control (RBAC) — Admin, Partner, Manager, Staff, Client |
| **Data Encryption** | TLS 1.3 in transit; AES‑256 at rest for credentials vault |
| **API Security** | Rate limiting (Redis), input validation (Zod), CORS policies, CSRF protection |
| **Mobile Security** | Biometric authentication, certificate pinning, secure storage for tokens |
| **Audit Trail** | All create/update/delete operations are recorded in the database; no server-side log files are written - debug traces are surfaced to the browser console via API responses |
| **Compliance** | Designed for Indian data residency; GST‑compliant invoicing |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x or **yarn** >= 1.22 or **pnpm** >= 8.x
- **React Native CLI** or **Expo CLI** (for mobile apps)
- **Xcode** (for iOS development, macOS only)
- **Android Studio** (for Android development)

### Web Application

```bash
# Clone the repository
git clone https://github.com/<your-org>/ca-office-portal.git
cd ca-office-portal/web

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

> **Production deployment note:** The web app is built locally (`npm run build`) and the resulting `dist/` folder is uploaded directly to the cPanel `public_html/app/` directory of the **`app.carahulgupta.in`** subdomain (see "Public Marketing Site" below). All testing is performed against the live production URL — there is no separate staging environment. See [`server-php/README.md`](server-php/README.md) for backend deployment details and the browser-console logging strategy used during production testing.

### Public Marketing Site (`carahulgupta.in`)

The repo also contains [`web-public/`](web-public/) — a separate React/Vite project that powers the firm's public-facing marketing website at **`https://carahulgupta.in`**. It is fully decoupled from the practice portal: no shared auth, no shared API. Its only job is to introduce the firm and hand visitors off to the right portal via the dropdown in the navbar.

```bash
cd web-public

# Install dependencies (one-time)
npm install

# Start dev server (http://localhost:5174)
npm run dev

# Build for production (outputs web-public/dist/)
npm run build
```

#### What's in the marketing site

| Path | Content |
|---|---|
| `/`              | Hero, services grid, why-us, FAQ, CTA |
| `/about`         | Firm bio, credentials, areas of practice |
| `/services`      | Full services catalogue with bullets |
| `/blog`, `/blog/:slug` | Static articles (data lives in [`web-public/src/content/blogPosts.js`](web-public/src/content/blogPosts.js)) |
| `/contact`       | Contact form (uses `mailto:` for now), office details, embedded map |
| Login dropdown   | Three portal links — see below |

#### Portal handoff (the URL parameter contract)

The login dropdown in the marketing site's navbar is a plain `<a>` link (not JS state) so the receiving portal sees the parameter on the very first paint:

```
https://app.carahulgupta.in/login?portal=staff
https://app.carahulgupta.in/login?portal=affiliate
https://app.carahulgupta.in/login?portal=client
```

The portal's [`web/src/pages/Login.jsx`](web/src/pages/Login.jsx) reads `?portal=` via `useSearchParams`, locks the portal selection (no tab switcher is shown), and renders a full-width banner identifying which portal the visitor is signing in to. A small "Wrong portal? Choose another at carahulgupta.in" link sends them back here if they followed a wrong link.

If `/login` is opened **without** a `portal=` parameter (e.g. a direct bookmark), the portal falls back to the original 3-tab selector so existing behavior is preserved.

#### Environment variables

Marketing site — [`web-public/.env.example`](web-public/.env.example):

| Variable | Purpose | Default |
|---|---|---|
| `VITE_PORTAL_URL` | Base URL of the portal that the login dropdown points at | `https://app.carahulgupta.in` |

Portal — [`web/.env.example`](web/.env.example) gains:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_MARKETING_URL` | Used by the "Wrong portal?" escape link on the locked login page | `https://carahulgupta.in` |

In local dev you can point the marketing site at the local portal:

```env
# web-public/.env
VITE_PORTAL_URL=http://localhost:5173
```

#### cPanel deployment (subdomain split)

Single cPanel account hosts both the marketing site and the portal:

| Hostname | DocumentRoot | Source |
|---|---|---|
| `carahulgupta.in` (and `www.`) | `public_html/`     | Upload `web-public/dist/` here |
| `app.carahulgupta.in`          | `public_html/app/` | Upload `web/dist/` here (cPanel → "Subdomains" → create) |

The PHP API (`server-php/`) lives at **`https://carahulgupta.in/api/`** (folder `public_html/api/`). The portal on **`app.carahulgupta.in`** should call that URL from the browser (`VITE_API_BASE_URL`). In the **`app/`** document root, use an `.htaccess` that only does the SPA fallback (no `/api/` rewrite to the wrong path). A template is in [`web/public/.htaccess.subdomain-app`](web/public/.htaccess.subdomain-app) — copy its rules into `public_html/app/.htaccess` on the server (the cPanel workflow excludes `.htaccess` from rsync so server copies are not overwritten).

PostgreSQL on this cPanel account uses the role **`carahulgupta_cagupta_user`**. Set `DB_USER` in `server-php/.env` to that value on the server; the backend defaults to it in [`server-php/app/Config/Database.php`](server-php/app/Config/Database.php) when `DB_USER` is omitted. For local machines that still use the `postgres` superuser, set `DB_USER=postgres` in `.env`. See [`server-php/README.md`](server-php/README.md) and [`server-php/.env.example`](server-php/.env.example).

`web-public/public/.htaccess` ships with two rules: an SPA fallback for client-side routes, and a hard 301 from `/login` on the marketing domain to the portal subdomain so any old bookmarks keep working.

#### One-time configuration changes after the split

1. **CORS** — in `server-php/.env` set a comma-separated list so the API accepts the portal **and** any origin that actually loads the SPA, e.g. `CORS_ORIGIN=https://app.carahulgupta.in,https://carahulgupta.in,https://www.carahulgupta.in`. Put **`https://app.carahulgupta.in` first** (used by the Zoom OAuth callback `postMessage` target). The marketing site does not call the API. The API now matches `Origin` against each entry (www/non-www normalized).
2. **Google OAuth** — in Google Cloud Console → Credentials, add `https://app.carahulgupta.in` to **Authorised JavaScript Origins**.
3. **Microsoft / Azure App Registration** — add `https://app.carahulgupta.in/` (with trailing slash) as a **Single-Page Application redirect URI**.

#### GitHub Actions — [`deploy-cpanel.yml`](.github/workflows/deploy-cpanel.yml)

One manual workflow builds and rsyncs **portal** (`web/dist` → `CPANEL_REMOTE_ROOT`), **API** (`server-php/` → `CPANEL_SITE_ROOT/api/`), and **marketing** (`web-public/dist` → `CPANEL_SITE_ROOT/` with `--exclude` for `app/` and `api/` so `rsync --delete` does not remove those folders).

| GitHub secret | Example | Used for |
|---|---|---|
| `CPANEL_REMOTE_ROOT` | `/home/carahulgupta/public_html/app` | Portal only (`app.carahulgupta.in`) |
| `CPANEL_SITE_ROOT` | `/home/carahulgupta/public_html` | API (`…/api/`) + marketing (site root) |
| `VITE_PORTAL_URL` | `https://app.carahulgupta.in` | `web-public` build (login links in navbar) |
| `VITE_MARKETING_URL` | `https://carahulgupta.in` | Optional; portal “Wrong portal?” link ([`web/.env.example`](web/.env.example)) |

### Mobile Applications

```bash
# Navigate to mobile directory
cd ca-office-portal/mobile

# Install all dependencies (monorepo)
npm install

# Start Team App
npx nx run team-app:start
# OR
cd apps/team-app && npx react-native run-android

# Start Client App
npx nx run client-app:start
# OR
cd apps/client-app && npx react-native run-ios
```

### Mock API Server

```bash
cd mock-api
npx json-server --watch db.json --port 3001
```

---

## 🗺️ Roadmap

| Phase | Focus | Timeline |
|-------|-------|----------|
| **Phase 1** | Web portal — Dashboard, Client Management, Services & Tasks | Month 1–2 |
| **Phase 2** | Document Management, Library, and Sharing | Month 2–3 |
| **Phase 3** | Invoicing, Ledger, and Financial Modules | Month 3–4 |
| **Phase 4** | Calendar, Appointments, Credentials Vault | Month 4–5 |
| **Phase 5** | Quotations, Leads, and Registers | Month 5–6 |
| **Phase 6** | Team Mobile App (React Native) | Month 6–8 |
| **Phase 7** | Client Mobile App (React Native) | Month 8–9 |
| **Phase 8** | Backend Integration, Testing, and Deployment | Month 9–11 |
| **Phase 9** | Tally Integration, AI Search, Advanced Analytics | Month 11–12 |

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](docs/CONTRIBUTING.md) for details on our code of conduct, development workflow, and how to submit pull requests.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 📞 Contact

For questions, suggestions, or collaboration inquiries, please open an issue or reach out to the maintainers.

---

## 🔐 Authentication Setup

The web app ships with an **authentication-first flow**: unauthenticated users always land on the Login page before reaching the Dashboard.

### Quick Start (Dev / Mock Mode)

No configuration needed.  Just run `npm run dev` inside the `web/` folder.

| Method | Behaviour in mock mode |
|---|---|
| Email OTP | Any email works; enter **`123456`** as the OTP |
| Google | Shows a fallback button that sets a dummy session |
| Microsoft | Opens the MSAL popup; fails gracefully with a message if not configured |

### Environment Variables (`web/.env`)

Copy `web/.env.example` to `web/.env` and fill in the values:

```env
VITE_API_BASE_URL=          # optional – omit to use mock/dev mode
VITE_GOOGLE_CLIENT_ID=      # Google OAuth client ID
VITE_MSAL_CLIENT_ID=        # Azure App Registration client ID
VITE_MSAL_TENANT_ID=common  # Tenant ID or "common"
```

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add your domain as an **Authorised JavaScript Origin** (e.g. `https://yourdomain.com`).
4. Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID`.

### Microsoft / Outlook OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory** → **App Registrations** → **New registration**.
2. Under **Redirect URIs**, add a **Single-Page Application** URI matching your deployed URL exactly (including any base path and trailing slash).
3. Copy the **Application (client) ID** into `VITE_MSAL_CLIENT_ID`.
4. Set `VITE_MSAL_TENANT_ID` to your Directory (tenant) ID, or keep `common` to allow any Microsoft account.

### Backend Endpoints (if `VITE_API_BASE_URL` is set)

| Method | Endpoint | Body |
|---|---|---|
| `POST` | `/auth/google` | `{ credential: "<google-id-token>" }` |
| `POST` | `/auth/microsoft` | `{ idToken, email, name }` |
| `POST` | `/auth/request-otp` | `{ email }` |
| `POST` | `/auth/verify-otp` | `{ email, otp }` |

All endpoints should return `{ token: "...", user: { name, email, initials } }` on success.

---

> **Built with ❤️ for the Chartered Accountancy profession — because your practice deserves better than spreadsheets.**
