-- =============================================================================
-- Migration 030 — Client portal login identities, OTP, and sessions
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '030_client_portal_login') THEN
        RAISE NOTICE 'Migration 030_client_portal_login already applied — skipping.';
        RETURN;
    END IF;

    ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS secondary_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(30);

    ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS secondary_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(30);

    CREATE TABLE IF NOT EXISTS client_login_otps (
        id                SERIAL PRIMARY KEY,
        login_identifier  VARCHAR(255) NOT NULL,
        otp_code          VARCHAR(10)  NOT NULL,
        expires_at        TIMESTAMPTZ  NOT NULL,
        used              BOOLEAN      DEFAULT FALSE,
        created_at        TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_client_login_otps_identifier
        ON client_login_otps(login_identifier);

    CREATE TABLE IF NOT EXISTS client_sessions (
        id                 SERIAL PRIMARY KEY,
        token              VARCHAR(512) UNIQUE NOT NULL,
        login_identifier   VARCHAR(255) NOT NULL,
        entity_type        VARCHAR(20)  NOT NULL,
        entity_id          INTEGER      NOT NULL,
        context_contact_id INTEGER,
        context_org_id     INTEGER,
        ip_address         INET,
        user_agent         TEXT,
        expires_at         TIMESTAMPTZ  NOT NULL,
        created_at         TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_client_sessions_token ON client_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_client_sessions_entity ON client_sessions(entity_type, entity_id);

    INSERT INTO schema_migrations (version) VALUES ('030_client_portal_login');

    RAISE NOTICE 'Migration 030_client_portal_login applied successfully.';
END;
$$;
