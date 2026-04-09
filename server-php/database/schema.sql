-- =============================================================================
-- CA Gupta Office Portal — Master Database Schema
-- PostgreSQL 14+
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(50)  UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    permissions  JSONB        NOT NULL DEFAULT '{}',
    is_system    BOOLEAN      DEFAULT FALSE,
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(150)  NOT NULL,
    email               VARCHAR(255)  UNIQUE NOT NULL,
    password_hash       VARCHAR(255),
    role_id             INTEGER       REFERENCES roles(id),
    is_active           BOOLEAN       DEFAULT TRUE,
    is_email_verified   BOOLEAN       DEFAULT FALSE,
    avatar_url          TEXT,
    last_login_at       TIMESTAMPTZ,
    login_provider      VARCHAR(30)   DEFAULT 'local',
    sso_provider_id     TEXT,
    created_by          INTEGER       REFERENCES users(id),
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. user_sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER      REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(512) UNIQUE NOT NULL,
    ip_address  INET,
    user_agent  TEXT,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. clients (contacts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id                SERIAL PRIMARY KEY,
    type              VARCHAR(20)   DEFAULT 'individual',
    first_name        VARCHAR(100),
    last_name         VARCHAR(100),
    organization_name VARCHAR(200),
    email             VARCHAR(255),
    phone             VARCHAR(30),
    pan               VARCHAR(20),
    gstin             VARCHAR(20),
    address_line1     TEXT,
    address_line2     TEXT,
    city              VARCHAR(100),
    state             VARCHAR(100),
    pincode           VARCHAR(10),
    country           VARCHAR(100)  DEFAULT 'India',
    notes             TEXT,
    is_active         BOOLEAN       DEFAULT TRUE,
    created_by        INTEGER       REFERENCES users(id),
    created_at        TIMESTAMPTZ   DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    type       VARCHAR(50),
    gstin      VARCHAR(20),
    pan        VARCHAR(20),
    email      VARCHAR(255),
    phone      VARCHAR(30),
    address    TEXT,
    city       VARCHAR(100),
    state      VARCHAR(100),
    country    VARCHAR(100) DEFAULT 'India',
    pincode    VARCHAR(10),
    website    VARCHAR(255),
    notes      TEXT,
    is_active  BOOLEAN     DEFAULT TRUE,
    created_by INTEGER     REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_contact_id INT REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS contact_organization (
    id              SERIAL PRIMARY KEY,
    contact_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    organization_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'member',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(contact_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_org_contact ON contact_organization(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_org_org ON contact_organization(organization_id);

-- -----------------------------------------------------------------------------
-- 6. services
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER      REFERENCES clients(id),
    organization_id INTEGER      REFERENCES organizations(id),
    service_type    VARCHAR(100) NOT NULL,
    description     TEXT,
    financial_year  VARCHAR(10),
    due_date        DATE,
    status          VARCHAR(30)  DEFAULT 'pending',
    priority        VARCHAR(20)  DEFAULT 'medium',
    assigned_to     INTEGER      REFERENCES users(id),
    fees            NUMERIC(12,2),
    notes           TEXT,
    created_by      INTEGER      REFERENCES users(id),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. documents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER      REFERENCES clients(id),
    organization_id INTEGER      REFERENCES organizations(id),
    service_id      INTEGER      REFERENCES services(id),
    title           VARCHAR(255) NOT NULL,
    file_name       VARCHAR(255),
    file_path       TEXT,
    file_size       BIGINT,
    mime_type       VARCHAR(100),
    document_type   VARCHAR(100),
    financial_year  VARCHAR(10),
    uploaded_by     INTEGER      REFERENCES users(id),
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. invoices
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id              SERIAL PRIMARY KEY,
    invoice_number  VARCHAR(50)   UNIQUE NOT NULL,
    client_id       INTEGER       REFERENCES clients(id),
    organization_id INTEGER       REFERENCES organizations(id),
    service_id      INTEGER       REFERENCES services(id),
    invoice_date    DATE          NOT NULL,
    due_date        DATE,
    subtotal        NUMERIC(12,2) DEFAULT 0,
    tax_percent     NUMERIC(5,2)  DEFAULT 18,
    tax_amount      NUMERIC(12,2) DEFAULT 0,
    total           NUMERIC(12,2) DEFAULT 0,
    amount_paid     NUMERIC(12,2) DEFAULT 0,
    status          VARCHAR(30)   DEFAULT 'draft',
    notes           TEXT,
    created_by      INTEGER       REFERENCES users(id),
    created_at      TIMESTAMPTZ   DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. ledger_entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_entries (
    id          SERIAL PRIMARY KEY,
    invoice_id  INTEGER      REFERENCES invoices(id),
    client_id   INTEGER      REFERENCES clients(id),
    entry_type  VARCHAR(20)  NOT NULL,
    amount      NUMERIC(12,2) NOT NULL,
    description TEXT,
    entry_date  DATE          NOT NULL,
    created_by  INTEGER      REFERENCES users(id),
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 10. calendar_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    event_date      DATE         NOT NULL,
    start_time      TIME,
    end_time        TIME,
    event_type      VARCHAR(50),
    client_id       INTEGER      REFERENCES clients(id),
    service_id      INTEGER      REFERENCES services(id),
    assigned_to     INTEGER      REFERENCES users(id),
    is_recurring    BOOLEAN      DEFAULT FALSE,
    recurrence_rule TEXT,
    created_by      INTEGER      REFERENCES users(id),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11. credentials_vault
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credentials_vault (
    id               SERIAL PRIMARY KEY,
    client_id        INTEGER      REFERENCES clients(id),
    organization_id  INTEGER      REFERENCES organizations(id),
    portal_name      VARCHAR(150) NOT NULL,
    username         VARCHAR(255),
    password_encrypted TEXT,
    url              TEXT,
    notes            TEXT,
    last_used_at     TIMESTAMPTZ,
    created_by       INTEGER      REFERENCES users(id),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 12. portal_types
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_types (
    id              SERIAL PRIMARY KEY,
    organization_id INTEGER      REFERENCES organizations(id),
    name            VARCHAR(150) NOT NULL,
    url             TEXT,
    created_by      INTEGER      REFERENCES users(id),
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_portal_types_org ON portal_types(organization_id);

-- -----------------------------------------------------------------------------
-- 13. registers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registers (
    id               SERIAL PRIMARY KEY,
    register_type    VARCHAR(100) NOT NULL,
    client_id        INTEGER      REFERENCES clients(id),
    organization_id  INTEGER      REFERENCES organizations(id),
    period           VARCHAR(50),
    due_date         DATE,
    filed_date       DATE,
    status           VARCHAR(30)  DEFAULT 'pending',
    reference_number VARCHAR(100),
    notes            TEXT,
    created_by       INTEGER      REFERENCES users(id),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 14. leads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL,
    email            VARCHAR(255),
    phone            VARCHAR(30),
    source           VARCHAR(100),
    service_interest TEXT,
    estimated_value  NUMERIC(12,2),
    status           VARCHAR(30)  DEFAULT 'new',
    assigned_to      INTEGER      REFERENCES users(id),
    notes            TEXT,
    follow_up_date   DATE,
    created_by       INTEGER      REFERENCES users(id),
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Indexes for common lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user  ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_email       ON clients(email);
CREATE INDEX IF NOT EXISTS idx_services_client     ON services(client_id);
CREATE INDEX IF NOT EXISTS idx_services_assigned   ON services(assigned_to);
CREATE INDEX IF NOT EXISTS idx_invoices_client     ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned      ON leads(assigned_to);
