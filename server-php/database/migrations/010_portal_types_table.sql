-- =============================================================================
-- Migration 010 — Portal Types Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id         SERIAL PRIMARY KEY,
    version    VARCHAR(50)  UNIQUE NOT NULL,
    applied_at TIMESTAMPTZ  DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '010_portal_types_table') THEN
        RAISE NOTICE 'Migration 010_portal_types_table already applied — skipping.';
        RETURN;
    END IF;

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

    INSERT INTO schema_migrations (version) VALUES ('010_portal_types_table');
    RAISE NOTICE 'Migration 010_portal_types_table applied successfully.';
END $$;
