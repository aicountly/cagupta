-- ============================================================
-- 071 — Grant runtime app-user access on blog tables
-- ============================================================
-- Migration 069 was shipped without GRANT statements, so the
-- restricted app user (carahulgupta_cagupta_user / DB_USER) gets
-- "permission denied for table blog_posts" at runtime.
--
-- This migration:
--   1. Grants table + sequence access to the app user.
--   2. Sets ALTER DEFAULT PRIVILEGES so every future table
--      created by the migration user is automatically accessible.
--
-- Run as MIGRATION_DB_USER (table owner, e.g. carahulgupta on cPanel)
-- so the GRANT and ALTER DEFAULT PRIVILEGES succeed.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'carahulgupta_cagupta_user') THEN
        -- Tables created by migration 069
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON blog_posts, blog_ai_drafts, blog_email_logs
            TO "carahulgupta_cagupta_user";

        GRANT USAGE, SELECT
            ON SEQUENCE blog_posts_id_seq, blog_ai_drafts_id_seq, blog_email_logs_id_seq
            TO "carahulgupta_cagupta_user";

        -- Prevent recurrence: future tables/sequences created by this session's
        -- role are automatically granted to the app user.
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
            TO "carahulgupta_cagupta_user"';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES
            TO "carahulgupta_cagupta_user"';
    END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('071_blog_grants')
ON CONFLICT (version) DO NOTHING;
