-- =============================================================================
-- Migration 006 — Opening Balances for client ledgers
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'opening_balances'
    ) THEN
        CREATE TABLE opening_balances (
            id                   SERIAL PRIMARY KEY,
            client_id            INTEGER        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            billing_profile_code VARCHAR(50)    NOT NULL,
            amount               NUMERIC(12, 2) NOT NULL DEFAULT 0,
            type                 VARCHAR(10)    NOT NULL DEFAULT 'debit'
                                     CHECK (type IN ('debit', 'credit')),
            created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
            updated_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
            UNIQUE (client_id, billing_profile_code)
        );

        CREATE INDEX idx_opening_balances_client_id ON opening_balances (client_id);

        INSERT INTO schema_migrations (version) VALUES ('006_create_opening_balances')
        ON CONFLICT (version) DO NOTHING;
    END IF;
END;
$$;
