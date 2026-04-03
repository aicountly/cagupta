-- =============================================================================
-- Migration 002 — Expand sso_provider_id column to TEXT
-- Fixes Google SSO login failure caused by JWT tokens exceeding VARCHAR(255)
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_fix_sso_provider_id_type') THEN
        RAISE NOTICE 'Migration 002_fix_sso_provider_id_type already applied — skipping.';
        RETURN;
    END IF;

    ALTER TABLE users ALTER COLUMN sso_provider_id TYPE TEXT;

    INSERT INTO schema_migrations (version) VALUES ('002_fix_sso_provider_id_type');
END;
$$;
