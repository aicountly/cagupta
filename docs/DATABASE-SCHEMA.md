# 🗄️ Database Schema — CA Office Management Portal

> **Database:** PostgreSQL (primary)
> **Naming Convention:** `snake_case` for tables and columns
> **Timestamps:** All tables include `created_at` and `updated_at` (auto-managed via trigger)

---

## Table of Contents

1. [Users & Roles](#1-users--roles)
2. [Clients](#2-clients)
3. [Services & Tasks](#3-services--tasks)
4. [Documents](#4-documents)
5. [Invoicing & Ledger](#5-invoicing--ledger)
6. [Calendar & Appointments](#6-calendar--appointments)
7. [Credentials Vault](#7-credentials-vault)
8. [Registers](#8-registers)
9. [Quotations & Leads](#9-quotations--leads)
10. [Audit & Activity Log](#10-audit--activity-log)
11. [Entity-Relationship Summary](#11-entity-relationship-summary)

---

## 0. Shared Setup

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reusable timestamp trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 1. Users & Roles

### `roles`
Staff roles within the firm.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `SERIAL PK` | |
| `name` | `VARCHAR(50) UNIQUE NOT NULL` | e.g. `admin`, `partner`, `manager`, `staff`, `client` |
| `description` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | |

```sql
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
  ('admin',   'Full access — firm owner / system admin'),
  ('partner', 'Senior professional with broad access'),
  ('manager', 'Team lead; manages assigned clients'),
  ('staff',   'Junior professional; executes tasks'),
  ('client',  'External client — limited, isolated access');
```

---

### `users`
All human actors: staff, partners, admins, and clients logging into the portal.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK DEFAULT gen_random_uuid()` | |
| `role_id` | `INT FK → roles.id` | |
| `full_name` | `VARCHAR(150) NOT NULL` | |
| `email` | `VARCHAR(255) UNIQUE NOT NULL` | Login identifier |
| `phone` | `VARCHAR(20)` | |
| `password_hash` | `TEXT NOT NULL` | bcrypt hash |
| `is_active` | `BOOLEAN DEFAULT TRUE` | Soft-enable/disable |
| `last_login_at` | `TIMESTAMPTZ` | |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | |

```sql
CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         INT         NOT NULL REFERENCES roles(id),
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 2. Clients

### `clients`
Master record for every client of the CA firm.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `client_code` | `VARCHAR(20) UNIQUE NOT NULL` | e.g. `CLT-0001` |
| `display_name` | `VARCHAR(200) NOT NULL` | Individual or firm name |
| `entity_type` | `VARCHAR(30)` | `individual`, `partnership`, `pvt_ltd`, `llp`, `trust`, `huf`, `other` |
| `pan` | `VARCHAR(10) UNIQUE` | Permanent Account Number |
| `gstin` | `VARCHAR(15)` | GST Identification Number |
| `aadhaar_last4` | `CHAR(4)` | Last 4 digits only |
| `date_of_birth` | `DATE` | For individuals |
| `date_of_incorporation` | `DATE` | For entities |
| `address_line1` | `TEXT` | |
| `address_line2` | `TEXT` | |
| `city` | `VARCHAR(100)` | |
| `state` | `VARCHAR(100)` | |
| `pincode` | `VARCHAR(10)` | |
| `primary_email` | `VARCHAR(255)` | |
| `secondary_email` | `VARCHAR(255)` | |
| `primary_phone` | `VARCHAR(20)` | |
| `secondary_phone` | `VARCHAR(20)` | |
| `assigned_manager_id` | `UUID FK → users.id` | Primary CA/manager |
| `portal_user_id` | `UUID FK → users.id NULLABLE` | If client has portal login |
| `onboarding_date` | `DATE` | |
| `status` | `VARCHAR(20) DEFAULT 'active'` | `active`, `inactive`, `prospect` |
| `notes` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | |

```sql
CREATE TABLE clients (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code            VARCHAR(20) UNIQUE NOT NULL,
  display_name           VARCHAR(200) NOT NULL,
  entity_type            VARCHAR(30)  NOT NULL DEFAULT 'individual',
  pan                    VARCHAR(10)  UNIQUE,
  gstin                  VARCHAR(15),
  aadhaar_last4          CHAR(4),
  date_of_birth          DATE,
  date_of_incorporation  DATE,
  address_line1          TEXT,
  address_line2          TEXT,
  city                   VARCHAR(100),
  state                  VARCHAR(100),
  pincode                VARCHAR(10),
  primary_email          VARCHAR(255),
  secondary_email        VARCHAR(255),
  primary_phone          VARCHAR(20),
  secondary_phone        VARCHAR(20),
  assigned_manager_id    UUID         REFERENCES users(id),
  portal_user_id         UUID         REFERENCES users(id),
  onboarding_date        DATE,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'active',
  notes                  TEXT,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_pan        ON clients(pan);
CREATE INDEX idx_clients_gstin      ON clients(gstin);
CREATE INDEX idx_clients_status     ON clients(status);
CREATE INDEX idx_clients_manager    ON clients(assigned_manager_id);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `client_contacts`
Additional contacts for a client (spouse, director, accountant, etc.)

```sql
CREATE TABLE client_contacts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_name VARCHAR(150) NOT NULL,
  designation  VARCHAR(100),
  email        VARCHAR(255),
  phone        VARCHAR(20),
  is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Services & Tasks

### `service_catalogue`
Master list of service types offered by the firm.

```sql
CREATE TABLE service_catalogue (
  id           SERIAL      PRIMARY KEY,
  name         VARCHAR(200) UNIQUE NOT NULL,  -- e.g. 'ITR Filing', 'GST Return', 'ROC Filing'
  category     VARCHAR(100),                   -- e.g. 'Tax', 'Compliance', 'Audit', 'Accounts'
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `services`
Engagement of a specific service for a specific client for a financial year.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `client_id` | `UUID FK → clients.id` | |
| `catalogue_id` | `INT FK → service_catalogue.id` | |
| `financial_year` | `VARCHAR(9)` | e.g. `2024-25` |
| `assigned_to_id` | `UUID FK → users.id` | Primary staff member |
| `status` | `VARCHAR(30)` | `not_started`, `in_progress`, `pending_info`, `review`, `completed`, `cancelled` |
| `start_date` | `DATE` | |
| `due_date` | `DATE` | |
| `completed_date` | `DATE` | |
| `fee_agreed` | `NUMERIC(12,2)` | Agreed fee for this service |
| `notes` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

```sql
CREATE TABLE services (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        NOT NULL REFERENCES clients(id),
  catalogue_id   INT         NOT NULL REFERENCES service_catalogue(id),
  financial_year VARCHAR(9)  NOT NULL,
  assigned_to_id UUID        REFERENCES users(id),
  status         VARCHAR(30) NOT NULL DEFAULT 'not_started',
  start_date     DATE,
  due_date       DATE,
  completed_date DATE,
  fee_agreed     NUMERIC(12,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, catalogue_id, financial_year)
);

CREATE INDEX idx_services_client   ON services(client_id);
CREATE INDEX idx_services_status   ON services(status);
CREATE INDEX idx_services_due_date ON services(due_date);

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `tasks`
Tasks under a service engagement.

```sql
CREATE TABLE tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID        NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  parent_task_id UUID       REFERENCES tasks(id),          -- NULL = top-level task
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  assigned_to_id UUID       REFERENCES users(id),
  status        VARCHAR(30) NOT NULL DEFAULT 'pending',    -- pending, in_progress, done, blocked
  priority      VARCHAR(20) NOT NULL DEFAULT 'medium',     -- low, medium, high, urgent
  due_date      DATE,
  completed_at  TIMESTAMPTZ,
  sort_order    INT         NOT NULL DEFAULT 0,
  created_by_id UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_service    ON tasks(service_id);
CREATE INDEX idx_tasks_assigned   ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_due_date   ON tasks(due_date);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `task_comments`
Threaded comments on tasks for team collaboration.

```sql
CREATE TABLE task_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users(id),
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Documents

### `documents`
Central document registry (metadata only; binary files live in S3/MinIO).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `client_id` | `UUID FK → clients.id` | |
| `service_id` | `UUID FK → services.id NULLABLE` | NULL = document library |
| `task_id` | `UUID FK → tasks.id NULLABLE` | |
| `name` | `VARCHAR(255) NOT NULL` | Display name |
| `original_filename` | `VARCHAR(255) NOT NULL` | As uploaded |
| `storage_key` | `TEXT UNIQUE NOT NULL` | S3/MinIO object key |
| `mime_type` | `VARCHAR(100)` | |
| `size_bytes` | `BIGINT` | |
| `category` | `VARCHAR(100)` | e.g. `ITR`, `GST`, `Invoice`, `Bank Statement` |
| `financial_year` | `VARCHAR(9)` | |
| `tags` | `TEXT[]` | PostgreSQL array |
| `version` | `INT DEFAULT 1` | |
| `parent_document_id` | `UUID NULLABLE` | For version chain |
| `uploaded_by_id` | `UUID FK → users.id` | |
| `is_shared_with_client` | `BOOLEAN DEFAULT FALSE` | |
| `shared_at` | `TIMESTAMPTZ` | |
| `download_count` | `INT DEFAULT 0` | |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

```sql
CREATE TABLE documents (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clients(id),
  service_id            UUID        REFERENCES services(id),
  task_id               UUID        REFERENCES tasks(id),
  name                  VARCHAR(255) NOT NULL,
  original_filename     VARCHAR(255) NOT NULL,
  storage_key           TEXT        UNIQUE NOT NULL,
  mime_type             VARCHAR(100),
  size_bytes            BIGINT,
  category              VARCHAR(100),
  financial_year        VARCHAR(9),
  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  version               INT         NOT NULL DEFAULT 1,
  parent_document_id    UUID        REFERENCES documents(id),
  uploaded_by_id        UUID        REFERENCES users(id),
  is_shared_with_client BOOLEAN     NOT NULL DEFAULT FALSE,
  shared_at             TIMESTAMPTZ,
  download_count        INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_client        ON documents(client_id);
CREATE INDEX idx_documents_service       ON documents(service_id);
CREATE INDEX idx_documents_category      ON documents(category);
CREATE INDEX idx_documents_financial_yr  ON documents(financial_year);
CREATE INDEX idx_documents_tags          ON documents USING gin(tags);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `document_share_links`
Secure, expiring share links sent to clients.

```sql
CREATE TABLE document_share_links (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token          TEXT        UNIQUE NOT NULL,  -- cryptographically random
  created_by_id  UUID        NOT NULL REFERENCES users(id),
  expires_at     TIMESTAMPTZ NOT NULL,
  accessed_count INT         NOT NULL DEFAULT 0,
  max_accesses   INT,                          -- NULL = unlimited
  is_revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Invoicing & Ledger

### `billing_firms`
A CA practice may issue invoices under multiple firm names / GST registrations.

```sql
CREATE TABLE billing_firms (
  id          SERIAL      PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  gstin       VARCHAR(15),
  pan         VARCHAR(10),
  address     TEXT,
  bank_name   VARCHAR(150),
  bank_account VARCHAR(30),
  bank_ifsc   VARCHAR(15),
  logo_url    TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `invoices`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `UUID PK` | |
| `invoice_number` | `VARCHAR(50) UNIQUE NOT NULL` | e.g. `RG/24-25/001` |
| `billing_firm_id` | `INT FK → billing_firms.id` | |
| `client_id` | `UUID FK → clients.id` | |
| `service_id` | `UUID FK → services.id NULLABLE` | |
| `invoice_date` | `DATE NOT NULL` | |
| `due_date` | `DATE` | |
| `financial_year` | `VARCHAR(9)` | |
| `subtotal` | `NUMERIC(12,2) NOT NULL` | |
| `discount_amount` | `NUMERIC(12,2) DEFAULT 0` | |
| `taxable_amount` | `NUMERIC(12,2) NOT NULL` | subtotal − discount |
| `cgst_rate` | `NUMERIC(5,2) DEFAULT 9` | % |
| `sgst_rate` | `NUMERIC(5,2) DEFAULT 9` | % |
| `igst_rate` | `NUMERIC(5,2) DEFAULT 0` | % (for inter-state) |
| `cgst_amount` | `NUMERIC(12,2) DEFAULT 0` | |
| `sgst_amount` | `NUMERIC(12,2) DEFAULT 0` | |
| `igst_amount` | `NUMERIC(12,2) DEFAULT 0` | |
| `total_amount` | `NUMERIC(12,2) NOT NULL` | |
| `amount_paid` | `NUMERIC(12,2) DEFAULT 0` | |
| `status` | `VARCHAR(20) DEFAULT 'draft'` | `draft`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled` |
| `notes` | `TEXT` | |
| `pdf_storage_key` | `TEXT` | S3 key |
| `created_by_id` | `UUID FK → users.id` | |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

```sql
CREATE TABLE invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(50) UNIQUE NOT NULL,
  billing_firm_id  INT         NOT NULL REFERENCES billing_firms(id),
  client_id        UUID        NOT NULL REFERENCES clients(id),
  service_id       UUID        REFERENCES services(id),
  invoice_date     DATE        NOT NULL,
  due_date         DATE,
  financial_year   VARCHAR(9),
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 9,
  sgst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 9,
  igst_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           VARCHAR(20)   NOT NULL DEFAULT 'draft',
  notes            TEXT,
  pdf_storage_key  TEXT,
  created_by_id    UUID          REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_client        ON invoices(client_id);
CREATE INDEX idx_invoices_status        ON invoices(status);
CREATE INDEX idx_invoices_due_date      ON invoices(due_date);
CREATE INDEX idx_invoices_financial_yr  ON invoices(financial_year);

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `invoice_line_items`

```sql
CREATE TABLE invoice_line_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT        NOT NULL,
  hsn_sac_code VARCHAR(10),
  quantity     NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price   NUMERIC(12,2) NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0
);
```

---

### `payments`
Payment receipts against invoices.

```sql
CREATE TABLE payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID        NOT NULL REFERENCES invoices(id),
  client_id       UUID        NOT NULL REFERENCES clients(id),
  amount          NUMERIC(12,2) NOT NULL,
  payment_date    DATE        NOT NULL,
  payment_mode    VARCHAR(50),              -- NEFT, UPI, Cheque, Cash
  reference_no    VARCHAR(100),
  notes           TEXT,
  recorded_by_id  UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_client  ON payments(client_id);
```

---

### `ledger_entries`
Double-entry-style ledger for each client across billing firms.

```sql
CREATE TABLE ledger_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES clients(id),
  billing_firm_id INT         REFERENCES billing_firms(id),
  entry_date      DATE        NOT NULL,
  entry_type      VARCHAR(20) NOT NULL,  -- invoice, payment, credit_note, adjustment
  reference_id    UUID,                  -- FK to invoices.id or payments.id
  debit_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  running_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  narration       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_client ON ledger_entries(client_id);
CREATE INDEX idx_ledger_date   ON ledger_entries(entry_date);
```

---

## 6. Calendar & Appointments

### `calendar_events`
Tasks, deadlines, filing due dates, meetings.

```sql
CREATE TABLE calendar_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  event_type     VARCHAR(30) NOT NULL DEFAULT 'task',  -- task, meeting, filing_deadline, holiday
  client_id      UUID        REFERENCES clients(id),
  service_id     UUID        REFERENCES services(id),
  task_id        UUID        REFERENCES tasks(id),
  assigned_to_id UUID        REFERENCES users(id),
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime   TIMESTAMPTZ,
  all_day        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_recurring   BOOLEAN     NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,                               -- iCal RRULE string
  color          VARCHAR(20),
  created_by_id  UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_start  ON calendar_events(start_datetime);
CREATE INDEX idx_calendar_client ON calendar_events(client_id);
CREATE INDEX idx_calendar_user   ON calendar_events(assigned_to_id);

CREATE TRIGGER trg_calendar_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `appointments`
Client-booked meetings with staff.

```sql
CREATE TABLE appointments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES clients(id),
  staff_id        UUID        NOT NULL REFERENCES users(id),
  booked_by_id    UUID        REFERENCES users(id),       -- staff who booked on behalf
  appointment_date DATE       NOT NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  mode            VARCHAR(20) NOT NULL DEFAULT 'in_person', -- in_person, video, phone
  location        TEXT,
  meeting_url     TEXT,
  subject         TEXT,
  notes           TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  reminder_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_staff  ON appointments(staff_id);
CREATE INDEX idx_appointments_date   ON appointments(appointment_date);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 7. Credentials Vault

### `credentials`
Securely stored portal login credentials for clients (e.g. IT portal, GST portal, MCA).

> **Security Note:** `encrypted_password` must be encrypted using AES-256 at the application layer before INSERT; the database stores only the cipher text.

```sql
CREATE TABLE credentials (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  portal_name      VARCHAR(150) NOT NULL,  -- e.g. 'Income Tax Portal', 'GST Portal', 'MCA21'
  portal_url       TEXT,
  username         VARCHAR(255),
  encrypted_password TEXT      NOT NULL,  -- AES-256 encrypted; NEVER plain text
  notes            TEXT,
  last_changed_at  DATE,
  created_by_id    UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credentials_client ON credentials(client_id);

CREATE TRIGGER trg_credentials_updated_at
  BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 8. Registers

### `gst_register`
Auto-generated GST filing register from active services/tasks.

```sql
CREATE TABLE gst_register (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id),
  gstin            VARCHAR(15) NOT NULL,
  financial_year   VARCHAR(9)  NOT NULL,
  return_type      VARCHAR(30) NOT NULL,  -- GSTR-1, GSTR-3B, GSTR-9, etc.
  period_month     INT,                   -- 1–12; NULL for annual
  period_year      INT         NOT NULL,
  due_date         DATE,
  filed_date       DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, filed, late, nil_filed
  late_fee         NUMERIC(10,2),
  service_id       UUID        REFERENCES services(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `tds_register`

```sql
CREATE TABLE tds_register (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id),
  tan              VARCHAR(10),
  financial_year   VARCHAR(9)  NOT NULL,
  quarter          CHAR(2)     NOT NULL,  -- Q1, Q2, Q3, Q4
  return_type      VARCHAR(20) NOT NULL,  -- 24Q, 26Q, 27Q, 27EQ
  due_date         DATE,
  filed_date       DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  service_id       UUID        REFERENCES services(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `roc_register`
ROC (Registrar of Companies) filing register.

```sql
CREATE TABLE roc_register (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL REFERENCES clients(id),
  cin              VARCHAR(21),           -- Company Identification Number
  financial_year   VARCHAR(9)  NOT NULL,
  filing_type      VARCHAR(50) NOT NULL,  -- AOC-4, MGT-7, ADT-1, DIR-3 KYC, etc.
  due_date         DATE,
  filed_date       DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  fee_paid         NUMERIC(10,2),
  service_id       UUID        REFERENCES services(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 9. Quotations & Leads

### `leads`

```sql
CREATE TABLE leads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name    VARCHAR(150) NOT NULL,
  email           VARCHAR(255),
  phone           VARCHAR(20),
  company_name    VARCHAR(200),
  source          VARCHAR(100),           -- referral, website, cold_call, social_media, etc.
  stage           VARCHAR(30) NOT NULL DEFAULT 'new',  -- new, contacted, qualified, proposal_sent, negotiation, won, lost
  probability     INT         NOT NULL DEFAULT 50,     -- 0–100 %
  estimated_value NUMERIC(12,2),
  assigned_to_id  UUID        REFERENCES users(id),
  next_follow_up  DATE,
  notes           TEXT,
  converted_to_client_id UUID REFERENCES clients(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `quotations`

```sql
CREATE TABLE quotations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number VARCHAR(50) UNIQUE NOT NULL,  -- e.g. QT/24-25/001
  lead_id          UUID        REFERENCES leads(id),
  client_id        UUID        REFERENCES clients(id),
  title            VARCHAR(255) NOT NULL,
  total_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft',  -- draft, sent, accepted, rejected, expired
  valid_until      DATE,
  notes            TEXT,
  created_by_id    UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotation_line_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id    UUID        NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  catalogue_id    INT         REFERENCES service_catalogue(id),
  description     TEXT        NOT NULL,
  frequency       VARCHAR(50),   -- monthly, quarterly, annually, one-time
  amount          NUMERIC(12,2) NOT NULL,
  sort_order      INT         NOT NULL DEFAULT 0
);

CREATE TRIGGER trg_quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 10. Audit & Activity Log

### `activity_logs`
Immutable record of all significant actions (create / update / delete).

```sql
CREATE TABLE activity_logs (
  id            BIGSERIAL   PRIMARY KEY,
  actor_id      UUID        REFERENCES users(id),
  actor_email   VARCHAR(255),             -- denormalised for log permanence
  action        VARCHAR(50) NOT NULL,     -- created, updated, deleted, shared, logged_in, etc.
  entity_type   VARCHAR(50) NOT NULL,     -- clients, services, invoices, documents, etc.
  entity_id     TEXT,                     -- UUID or composite key as string
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_actor      ON activity_logs(actor_id);
CREATE INDEX idx_activity_entity     ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_created_at ON activity_logs(created_at DESC);
```

---

## 11. Entity-Relationship Summary

```
roles ──< users >── (assigned_manager) ──< clients
                                              │
                         ┌────────────────────┤
                         │                    │
                    services >──────── service_catalogue
                         │
              ┌──────────┤──────────────┐
              │          │              │
            tasks     documents      invoices
              │                         │
         task_comments           invoice_line_items
                                        │
                                     payments
                                        │
                                  ledger_entries

clients ──< credentials
clients ──< appointments >── users (staff)
clients ──< gst_register / tds_register / roc_register
clients ──< leads ──< quotations
```

---

## Notes for Backend Integration

1. **UUID vs SERIAL:** Use UUID primary keys for all business entities; SERIAL only for lookup/catalogue tables.
2. **Soft Deletes:** Add `deleted_at TIMESTAMPTZ` columns and filter `WHERE deleted_at IS NULL` instead of hard deletes for clients, services, documents.
3. **Row-Level Security (RLS):** Enable Postgres RLS on `clients`, `documents`, `invoices`, and `credentials` so that a `client` role user can only see rows where `portal_user_id = current_user_id`.
4. **Financial Year Partitioning:** Consider range-partitioning large tables (`invoices`, `ledger_entries`, `activity_logs`) by `financial_year` / `created_at` for performance.
5. **Encrypted Credentials:** The `credentials.encrypted_password` column must always be encrypted at the application layer (e.g. Node.js `crypto.createCipheriv('aes-256-gcm', ...)`) — never store plain text.
6. **Migrations:** Use **Prisma Migrate** or **Flyway** to version-control all schema changes.
