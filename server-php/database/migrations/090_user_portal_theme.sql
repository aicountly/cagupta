-- =============================================================================
-- Migration 090 — Per-user portal color theme preference
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '090_user_portal_theme') THEN
        RAISE NOTICE 'Migration 090_user_portal_theme already applied — skipping.';
        RETURN;
    END IF;

    ALTER TABLE users
        ADD COLUMN IF NOT EXISTS portal_theme VARCHAR(30) NOT NULL DEFAULT 'classic_orange';

    INSERT INTO schema_migrations (version) VALUES ('090_user_portal_theme');
END $$;
