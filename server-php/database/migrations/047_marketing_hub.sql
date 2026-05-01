-- ============================================================
-- 047 · Marketing & Communication Hub
-- ============================================================

-- WhatsApp Web sessions (per staff user — isolated)
CREATE TABLE IF NOT EXISTS marketing_wa_sessions (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id    VARCHAR(128) NOT NULL UNIQUE,
    status        VARCHAR(32)  NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | connected
    qr_code       TEXT,
    phone_number  VARCHAR(20),
    connected_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_sessions_user ON marketing_wa_sessions(user_id);

-- ── SMS Templates (DLT compliant) ────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_sms_templates (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    dlt_id      VARCHAR(100),
    category    VARCHAR(100),
    body        TEXT NOT NULL,
    status      VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft | pending | approved | rejected
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Social Media Accounts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_social_accounts (
    id           SERIAL PRIMARY KEY,
    platform     VARCHAR(50)  NOT NULL, -- youtube | facebook | instagram | twitter | linkedin | threads
    account_name VARCHAR(200),
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    provider     VARCHAR(50), -- ayrshare | buffer | socialpilot
    status       VARCHAR(32)  NOT NULL DEFAULT 'disconnected',
    connected_by INTEGER REFERENCES users(id),
    connected_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Marketing API Config (encrypted at app level) ─────────────
CREATE TABLE IF NOT EXISTS marketing_api_config (
    id          SERIAL PRIMARY KEY,
    service     VARCHAR(100) NOT NULL UNIQUE, -- sms_gateway | wa_native | social_api
    provider    VARCHAR(100),
    api_key     TEXT,
    api_secret  TEXT,
    extra_config JSONB,
    updated_by  INTEGER REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Marketing Campaigns ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    channels     JSONB        NOT NULL DEFAULT '[]', -- ['email','sms','whatsapp','social']
    audience     VARCHAR(200),
    status       VARCHAR(32)  NOT NULL DEFAULT 'draft', -- draft | scheduled | active | completed | paused
    scheduled_at TIMESTAMPTZ,
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by   INTEGER REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Marketing Logs (per-message delivery tracking) ────────────
CREATE TABLE IF NOT EXISTS marketing_logs (
    id              SERIAL  PRIMARY KEY,
    campaign_id     INTEGER REFERENCES marketing_campaigns(id),
    channel         VARCHAR(32)  NOT NULL, -- email | sms | whatsapp | social
    direction       VARCHAR(16)  NOT NULL DEFAULT 'outbound',
    -- Recipient
    client_id       INTEGER REFERENCES clients(id),
    recipient_name  VARCHAR(200),
    recipient_email VARCHAR(320),
    recipient_mobile VARCHAR(30),
    -- Message
    template_name   VARCHAR(200),
    message_body    TEXT,
    attachments     JSONB DEFAULT '[]',
    -- Status
    status          VARCHAR(32)  NOT NULL DEFAULT 'queued', -- queued | sent | delivered | failed | scheduled
    provider_msg_id VARCHAR(200),
    provider        VARCHAR(100),
    error_message   TEXT,
    -- Timing
    scheduled_at    TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    -- Audit
    sent_by_user_id INTEGER REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_client    ON marketing_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_channel   ON marketing_logs(channel);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_status    ON marketing_logs(status);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_campaign  ON marketing_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_logs_created   ON marketing_logs(created_at DESC);

-- ── Affiliate Prospects (for outreach CRM) ───────────────────
CREATE TABLE IF NOT EXISTS marketing_affiliate_prospects (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL,
    type          VARCHAR(100), -- banker | accountant | lawyer | consultant
    organization  VARCHAR(300),
    mobile        VARCHAR(30),
    email         VARCHAR(320),
    source        VARCHAR(100), -- manual | referral | linkedin | event | cold_call | website
    status        VARCHAR(50)  NOT NULL DEFAULT 'new', -- new | contacted | interested | converted | not_interested
    notes         TEXT,
    last_contact  DATE,
    created_by    INTEGER REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON marketing_affiliate_prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_type   ON marketing_affiliate_prospects(type);

-- ── Document Share Log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_shares (
    id              SERIAL PRIMARY KEY,
    document_id     INTEGER REFERENCES documents(id),
    shared_by       INTEGER REFERENCES users(id),
    channel         VARCHAR(32) NOT NULL, -- email | sms | wa_web | wa_api
    recipient_name  VARCHAR(200),
    recipient_email VARCHAR(320),
    recipient_mobile VARCHAR(30),
    client_id       INTEGER REFERENCES clients(id),
    share_token     VARCHAR(128) UNIQUE,
    accessed_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    status          VARCHAR(32) NOT NULL DEFAULT 'sent',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_shares_document ON document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_client   ON document_shares(client_id);
