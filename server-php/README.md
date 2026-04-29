# CA Gupta Office Portal — PHP Backend

A CodeIgniter-style PHP 8.1+ API backend backed by PostgreSQL.  
The React frontend lives in `../web/` and calls these endpoints.

---

## Requirements

| Requirement | Version |
|---|---|
| PHP | 8.1 or higher |
| PostgreSQL | 14 or higher |
| Apache | 2.4+ with `mod_rewrite` enabled |
| PHP extensions | `pdo`, `pdo_pgsql`, `json`, `openssl` |

> **No Composer required.** The backend works as a drop-in on standard CPN shared hosting.

---

## Quick Start

### 1 — Copy the project

Upload the `server-php/` folder to your CPN hosting account (e.g. `public_html/api/`).

### 2 — Create the database

1. Create a PostgreSQL database in your CPN control panel.
2. Run the schema:

```bash
psql -h <host> -U <user> -d <dbname> -f database/schema.sql
```

3. Run the seed data (roles + super admin):

```bash
psql -h <host> -U <user> -d <dbname> -f database/seed.sql
```

### 3 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default: 5432) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASS` | Database password |
| `JWT_SECRET` | Random secret — generate with: `php -r "echo base64_encode(random_bytes(32));"` |
| `CORS_ORIGIN` | One or more allowed browser Origins, comma-separated (e.g. `https://app.yourdomain.com,https://yourdomain.com` when the portal is on a subdomain and the API is on the apex) |

### 4 — Point your web server to `public/`

#### Apache VHost (local / dedicated server)

```apache
<VirtualHost *:80>
    ServerName api.yourdomain.com
    DocumentRoot /path/to/server-php/public
    <Directory /path/to/server-php/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

#### CPN Shared Hosting (subdirectory)

If the API is hosted at `https://yourdomain.com/api/`:

1. Upload the entire `server-php/` folder as `api/` inside `public_html/`.
2. The root `.htaccess` rewrites everything to `public/index.php` automatically.
3. Set `BASE_URL=https://yourdomain.com/api` in `.env`.

#### Nginx

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    root /path/to/server-php/public;
    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
    }
}
```

---

## Deployment (cPanel — Production)

This backend is deployed **directly to production cPanel** shared hosting. There is no separate staging environment — all testing is performed against the live production URL.

### Upload procedure

1. Upload the `server-php/` folder contents into the target directory on cPanel (e.g. `public_html/api/`).
2. Copy `.env.example` → `.env` and fill in the production credentials directly on the server via the cPanel File Manager or SSH.
3. Verify `mod_rewrite` is enabled in cPanel → **Apache Handlers** (or ask your host).
4. Navigate to the production URL and open **DevTools → Console** to confirm the API is responding.

### No server-side log files

Because the application runs on shared cPanel hosting where file-system log paths are unreliable and inaccessible during live testing, **no log files are written to disk**.

Instead, all debug information, errors, and batch-operation traces are returned directly in the API JSON response and surfaced to the **browser console (DevTools → Inspect Element → Console tab)**. This makes it possible to diagnose issues in real time from the production URL without SSH or log-file access.

#### How logs reach the browser console

Every API response envelope carries a `debug` array when `APP_ENV` is not `production`, and all caught exceptions / batch warnings are appended there:

```json
{
  "success": false,
  "message": "Something went wrong",
  "data": null,
  "errors": ["PDO error: ..."],
  "debug": [
    "[BATCH] Processing row 3 of 50",
    "[WARN]  Duplicate PAN skipped: ABCDE1234F",
    "[ERROR] Row 7 insert failed: unique constraint violation"
  ]
}
```

The React frontend reads `response.data.debug` on every Axios response and forwards each entry to `console.debug(...)` so they appear in the browser's Inspect → Console panel automatically.

> **Tip:** Open DevTools before triggering any batch action (import, bulk-update, etc.) to capture the full trace in real time.

---

## Running Migrations

Instead of running `schema.sql` directly, you can use the migration:

```bash
psql -h <host> -U <user> -d <dbname> -f database/migrations/001_initial_schema.sql
```

The migration is idempotent — safe to run multiple times.

---

## Cron Jobs

The project uses standalone CLI scripts for scheduled notifications.

Schedule the super-admin **daily timesheet report** one hour **before** per-user low-timesheet emails so the digest arrives first; both use the **same previous calendar day**.

### Super admin daily timesheet report (5:00 AM)

Sends **one** consolidated email to `SUPERADMIN_NOTIFY_EMAIL` with two sections: users **below** the daily shift target (with billable / non-billable / shortfall), and users who **met or exceeded** target (overtime minutes and extra target multiples — statistical only, not billable). Evaluates the **previous day** (`510` minute target, same as intimation).

```bash
0 5 * * * php /absolute/path/to/server-php/cli/send-superadmin-timesheet-report.php >> /absolute/path/to/logs/superadmin-timesheet.log 2>&1
```

Optional dry run:

```bash
php cli/send-superadmin-timesheet-report.php --dry-run
```

### Daily low-timesheet intimation (6:00 AM)

This checks each active user's **previous day** timesheet and sends an email only when punched time is below `510` minutes.

```bash
0 6 * * * php /absolute/path/to/server-php/cli/send-timesheet-intimation.php >> /absolute/path/to/logs/timesheet-intimation.log 2>&1
```

Optional dry run:

```bash
php cli/send-timesheet-intimation.php --dry-run
```

---

## API Endpoint Reference

### Authentication

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | No | Email + password login |
| `POST` | `/api/auth/sso` | No | Google / Microsoft SSO |
| `POST` | `/api/auth/logout` | Bearer | Invalidate current session |
| `GET` | `/api/auth/me` | Bearer | Get current user profile |
| `POST` | `/api/auth/refresh` | Bearer | Refresh access token |

#### Login request body
```json
{ "email": "user@example.com", "password": "secret" }
```

#### SSO request body
```json
{
  "provider": "google",
  "sso_token": "<google-id-token>",
  "name": "John Doe",
  "email": "john@example.com",
  "avatar_url": "https://..."
}
```

#### Response shape (all endpoints)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "<jwt>",
    "user": {
      "id": 1,
      "name": "Rahul Gupta",
      "email": "rahul@cagupta.in",
      "role": "super_admin",
      "permissions": ["*"],
      "avatar_url": null,
      "is_active": true,
      "last_login_at": "2025-01-01T00:00:00+05:30"
    }
  },
  "errors": []
}
```

### User Management (admin only)

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| `GET` | `/api/admin/users` | super_admin, admin | Paginated user list |
| `POST` | `/api/admin/users` | super_admin, admin | Create user |
| `GET` | `/api/admin/users/{id}` | super_admin, admin | Get single user |
| `PUT` | `/api/admin/users/{id}` | super_admin, admin | Update user |
| `DELETE` | `/api/admin/users/{id}` | super_admin, admin | Deactivate user |
| `GET` | `/api/admin/roles` | super_admin, admin | List all roles |
| `PUT` | `/api/admin/roles/{id}` | super_admin | Update role permissions |

#### GET /api/admin/users query parameters
| Param | Default | Description |
|---|---|---|
| `page` | 1 | Page number |
| `per_page` | 20 | Results per page (max 100) |
| `search` | — | Filter by name or email |
| `role` | — | Filter by role name |
| `status` | — | `active` or `inactive` |

---

## Contacts (clients) — duplicate vs identical records

The admin UI distinguishes two ideas for **people contacts** (the `clients` table):

| Term | Meaning | API / behaviour |
|------|---------|-----------------|
| **Duplicate record** (suspicious) | Same or very similar **name** (or other soft signals in the UI). Not proof of the same person. | Informational only. Create and update **are allowed**. |
| **Identical record** | Same **PAN** after normalization (`TRIM` + uppercase). Treats the record as the same tax identity. | Create and update **are rejected** with HTTP **422** and a payload `data.conflict` describing the existing row. |

**Parameters today:** identical matching uses **PAN only**. Other fields (e.g. name) may be used later for suspicious duplicate hints only.

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/contacts/check-pan?pan=…&exclude_id=…` | Returns `{ conflict: null }` or `{ conflict: { id, display_name, pan, email, phone } }`. Use `exclude_id` when editing an existing contact so its own PAN is ignored. |

On `POST /api/admin/contacts` and `PUT /api/admin/contacts/:id`, a non-empty PAN that matches another client triggers the same 422 + `data.conflict` shape.

---

## Role & Permission Matrix

| Role | Permissions |
|---|---|
| `super_admin` | `["*"]` — full access |
| `admin` | All modules except user management settings |
| `manager` | Clients, Services, Docs, Invoices, Calendar, Leads |
| `staff` | View Clients/Docs, edit Services, create Calendar events |
| `viewer` | Read-only on Dashboard, Clients, Services, Docs, Invoices |

---

## Super Admin

Email **`rahul@cagupta.in`** is hardcoded as `SUPER_ADMIN_EMAIL` in `app/Config/Auth.php`.

- Always receives `super_admin` role at login regardless of the DB value.
- Cannot be deleted or deactivated via the API.
- Cannot be modified via the API.

---

## Security Notes

- All DB queries use PDO prepared statements — no raw string interpolation.
- Passwords are hashed with bcrypt (cost factor 12).
- JWTs are signed with HS256; token expiry is validated on every request.
- Sessions are stored in the DB — tokens can be revoked server-side by deleting the row.
- CORS allows browser `Origin` values listed in `CORS_ORIGIN` in `.env` (comma-separated; www/non-www normalized per entry).
- `.env` is blocked by `.htaccess` from being served directly.
