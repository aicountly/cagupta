-- ============================================================
-- 048 · Contact Verification (Email & Mobile OTP)
-- ============================================================

-- Verification status columns on clients table
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mobile_verified      BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mobile_verified_at   TIMESTAMPTZ;

-- Verification OTP log (for audit + rate limiting)
CREATE TABLE IF NOT EXISTS contact_verification_otps (
    id            SERIAL PRIMARY KEY,
    client_id     INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel       VARCHAR(20) NOT NULL, -- email | sms | whatsapp
    otp_hash      VARCHAR(128) NOT NULL,
    field         VARCHAR(20) NOT NULL, -- email | mobile
    expires_at    TIMESTAMPTZ NOT NULL,
    used          BOOLEAN     NOT NULL DEFAULT FALSE,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ver_otps_client  ON contact_verification_otps(client_id);
CREATE INDEX IF NOT EXISTS idx_ver_otps_expires ON contact_verification_otps(expires_at);

-- Verification audit log (full history of verify/unverify events)
CREATE TABLE IF NOT EXISTS contact_verification_log (
    id          SERIAL PRIMARY KEY,
    client_id   INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    field       VARCHAR(20) NOT NULL,  -- email | mobile
    action      VARCHAR(30) NOT NULL,  -- verified | unverified | otp_sent | otp_failed
    channel     VARCHAR(20),           -- email | sms | whatsapp
    value       VARCHAR(320),          -- the email or mobile that was verified/changed
    actor_id    INTEGER REFERENCES users(id), -- staff who triggered, or NULL if self-verified
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ver_log_client ON contact_verification_log(client_id);
CREATE INDEX IF NOT EXISTS idx_ver_log_created ON contact_verification_log(created_at DESC);

-- ── Activity Trigger Config (testing mode) ────────────────────
CREATE TABLE IF NOT EXISTS activity_trigger_config (
    id             SERIAL PRIMARY KEY,
    trigger_type   VARCHAR(100) NOT NULL UNIQUE, -- service_log_created | service_status_changed | invoice_created
    channel        VARCHAR(32)  NOT NULL DEFAULT 'email', -- email | sms | whatsapp
    enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
    testing_mode   BOOLEAN      NOT NULL DEFAULT TRUE,
    test_email     VARCHAR(320) NOT NULL DEFAULT 'testing@logicmail.in',
    test_mobile    VARCHAR(30),
    template_name  VARCHAR(200),
    updated_by     INTEGER REFERENCES users(id),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default trigger config (testing mode ON by default)
INSERT INTO activity_trigger_config (trigger_type, channel, enabled, testing_mode, test_email)
VALUES
    ('service_log_created',     'email', TRUE, TRUE, 'testing@logicmail.in'),
    ('service_status_changed',  'email', FALSE, TRUE, 'testing@logicmail.in'),
    ('invoice_created',         'email', FALSE, TRUE, 'testing@logicmail.in')
ON CONFLICT (trigger_type) DO NOTHING;

-- Activity trigger log (every trigger event, with routing info)
CREATE TABLE IF NOT EXISTS activity_trigger_log (
    id              SERIAL PRIMARY KEY,
    trigger_type    VARCHAR(100) NOT NULL,
    channel         VARCHAR(32)  NOT NULL,
    service_id      INTEGER REFERENCES services(id),
    service_log_id  INTEGER,
    client_id       INTEGER REFERENCES clients(id),
    sent_to         VARCHAR(320) NOT NULL, -- actual address sent to (test or real)
    testing_mode    BOOLEAN      NOT NULL,
    status          VARCHAR(32)  NOT NULL DEFAULT 'queued', -- queued | sent | failed
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trigger_log_service ON activity_trigger_log(service_id);
CREATE INDEX IF NOT EXISTS idx_trigger_log_created ON activity_trigger_log(created_at DESC);
