-- =============================================================================
-- Migration 003 — Create otp_tokens table
-- Stores one-time passwords used for the two-step login flow.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '003_create_otp_tokens') THEN
        RAISE NOTICE 'Migration 003_create_otp_tokens already applied — skipping.';
        RETURN;
    END IF;

    CREATE TABLE IF NOT EXISTS otp_tokens (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        otp_code   VARCHAR(10)  NOT NULL,
        expires_at TIMESTAMPTZ  NOT NULL,
        used       BOOLEAN      DEFAULT FALSE,
        created_at TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_otp_tokens_user ON otp_tokens(user_id);

    INSERT INTO schema_migrations (version) VALUES ('003_create_otp_tokens');

    RAISE NOTICE 'Migration 003_create_otp_tokens applied successfully.';
END;
$$;
